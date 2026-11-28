/* /api/admin — toàn bộ nghiệp vụ quản trị (cần session admin + gate ticket) */
'use strict';
const C = require('./_lib/core.js');
const A = require('./_lib/api.js');
const O = require('./_lib/ops.js');

module.exports = async (req, res) => {
  if(req.method !== 'POST') return C.fail(res, 405, 'Chỉ hỗ trợ POST.');
  let body;
  try{ body = await require('./auth.js').readBody(req, 5000000); }catch(e){ return C.fail(res, 400, 'Body quá lớn hoặc không hợp lệ (tối đa ~4MB).'); }
  const act = body.act || '';
  try{
    /* ---- MỤC 7 (24/11/2026): upload jar THEO PHẦN — mỗi request < 4,5MB, KHÔNG ghi state.
       Chỉ ADMIN được upload — kiểm tra quyền TẠI SERVER; phần dữ liệu đẩy thẳng lên Blob tmp. ---- */
    if(act === 'jar-part'){
      const st0 = await C.getState();
      const me0 = A.getAdmin(req, st0);
      if(!me0) return C.json(res, 403, {ok:false, auth:true, msg:'Chỉ quản trị viên mới được tải file jar lên (kiểm tra ở server).'});
      const uidv = C.cleanStr(body.uid, 40);
      if(!/^[a-f0-9]{12,40}$/.test(uidv)) return C.fail(res, 400, 'Mã phiên upload không hợp lệ.');
      const idx = C.clampInt(body.idx, 0, 39, -1);
      if(idx < 0) return C.fail(res, 400, 'Chỉ số phần không hợp lệ.');
      if(!C.rateHit('jarpart:' + me0.id, 80, 3600 * 1000)) return C.fail(res, 429, 'Upload quá nhiều phần trong 1 giờ — thử lại sau.');
      const buf = Buffer.from(String(body.data || ''), 'base64');
      if(!buf.length || buf.length > 3 * 1024 * 1024) return C.fail(res, 400, 'Phần dữ liệu rỗng hoặc vượt 3MB.');
      await C.blobPut('tmp/jar/' + uidv + '/part-' + String(idx).padStart(2, '0'), buf, 'application/octet-stream');
      return C.json(res, 200, {ok: true, idx, got: buf.length});
    }
    const out = await C.withState(async st => {
      const me = A.getAdmin(req, st);
      if(!me) return {out: {ok:false, auth:true, msg:'Chưa mở khu vực quản trị (đăng nhập + cổng quản trị).'}};
      const S = st.settings = st.settings || {};
      const now = C.vnStr();

      /* ---------- người dùng ---------- */
      if(act === 'user-ban'){
        const u = (st.users || []).find(x => x.id === body.id);
        if(!u) return {out: {ok:false, msg:'Không tìm thấy user.'}};
        if(u.role === 'admin') return {out: {ok:false, msg:'Không khóa được tài khoản quản trị.'}};
        u.banned = !!body.banned;
        u.banReason = u.banned ? C.cleanStr(body.reason, 120) || 'Vi phạm quy định' : '';
        if(u.banned){ /* hủy session của user bị khóa */
          for(const k of Object.keys(st.sessions || {})) if(st.sessions[k].uid === u.id) delete st.sessions[k];
        }
        return {out: {ok:true, msg:(u.banned ? '🔒 Đã khóa ' : '🔓 Đã mở khóa ') + u.username}};
      }
      if(act === 'user-credit'){
        const q = C.cleanStr(body.who, 60).toLowerCase();
        const u = (st.users || []).find(x => x.username.toLowerCase() === q || (x.email || '').toLowerCase() === q);
        if(!u) return {out: {ok:false, msg:'Không tìm thấy người nhận "' + body.who + '" theo username hoặc email.'}};
        const amount = C.clampInt(body.amount, 1000, 1000000000, 0);
        if(amount < 1000) return {out: {ok:false, msg:'Số tiền không hợp lệ (tối thiểu 1.000đ).'}};
        O.walletAdd(st, u, amount, 'admin_credit', (body.reason || 'Cấp từ admin') + (body.note ? ' — ' + body.note : ''), me.username);
        S.creditLog = S.creditLog || [];
        S.creditLog.unshift({id: C.uid('CT'), at: now, by: me.username, to: u.username, amount, reason: C.cleanStr(body.reason, 40) || 'Cấp tiền', note: C.cleanStr(body.note, 100), balanceAfter: u.balance});
        O.notify(st, u.id, 'deposit', 'Admin cấp +' + amount.toLocaleString('vi-VN') + 'đ vào ví', 'Lý do: ' + (body.reason || 'Cấp tiền') + '. Số dư mới: ' + u.balance.toLocaleString('vi-VN') + 'đ.');
        return {out: {ok:true, msg:'💰 Đã cấp ' + amount.toLocaleString('vi-VN') + 'đ vào ví ' + u.username + ' — số dư mới: ' + u.balance.toLocaleString('vi-VN') + 'đ'}};
      }

      /* ---------- coupon ---------- */
      if(act === 'coupon-new'){
        const code = C.cleanStr(body.code, 20).toUpperCase().replace(/[^A-Z0-9]/g,'');
        if(!code) return {out: {ok:false, msg:'Mã không hợp lệ.'}};
        if((st.coupons || []).some(c => c.code === code)) return {out: {ok:false, msg:'Mã đã tồn tại.'}};
        st.coupons.unshift({code, percent: C.clampInt(body.percent, 1, 100, 10), maxUses: C.clampInt(body.maxUses, 1, 10000, 50), used: 0,
          expires: C.cleanStr(body.expires, 10) || new Date(Date.now() + 30*86400000).toISOString().slice(0,10), active: true});
        return {out: {ok:true, msg:'Đã tạo coupon ' + code}};
      }
      if(act === 'coupon-toggle'){
        const c = (st.coupons || []).find(x => x.code === body.code);
        if(!c) return {out: {ok:false, msg:'Không tìm thấy mã.'}};
        c.active = !c.active;
        return {out: {ok:true, msg:(c.active ? 'Đã bật ' : 'Đã tắt ') + c.code}};
      }
      if(act === 'coupon-del'){
        st.coupons = (st.coupons || []).filter(x => x.code !== body.code);
        return {out: {ok:true, msg:'Đã xóa mã ' + body.code}};
      }

      /* ---------- đơn hàng ---------- */
      if(act === 'order-confirm'){
        const order = (st.orders || []).find(o => o.id === body.id);
        if(!order) return {out: {ok:false, msg:'Không tìm thấy đơn.'}};
        const user = (st.users || []).find(u => u.id === order.userId);
        if(!user) return {out: {ok:false, msg:'Không tìm thấy người mua.'}};
        if(order.status === 'Đã thanh toán') return {out: {ok:false, msg:'Đơn đã thanh toán trước đó.'}};
        order.method = 'Chuyển khoản QR (admin xác nhận)';
        const purchased = O.grantOrder(st, order, user);
        return {out: {ok:true, msg:'✅ Đã xác nhận đơn ' + order.id + ' — đã cấp: ' + purchased.map(p => p.name).join(', ')}};
      }
      if(act === 'order-cancel'){
        const order = (st.orders || []).find(o => o.id === body.id);
        if(!order) return {out: {ok:false, msg:'Không tìm thấy đơn.'}};
        if(order.status === 'Đã thanh toán') return {out: {ok:false, msg:'Đơn đã thanh toán — không hủy được (dùng hoàn tiền qua A11).'}};
        order.status = 'Đã hủy';
        O.notify(st, order.userId, 'order', 'Đơn ' + order.id + ' đã bị hủy', C.cleanStr(body.msg, 200) || 'Đơn không được xác nhận thanh toán. Liên hệ hỗ trợ nếu cần.');
        return {out: {ok:true, msg:'Đã hủy đơn ' + order.id}};
      }

      /* ---------- nạp tiền ---------- */
      if(act === 'deposit-confirm'){
        const dep = (st.deposits || []).find(d => d.id === body.id);
        if(!dep) return {out: {ok:false, msg:'Không tìm thấy giao dịch nạp.'}};
        if(dep.status === 'Thành công') return {out: {ok:false, msg:'Giao dịch đã xác nhận trước đó.'}};
        if(dep.status === 'Thất bại') return {out: {ok:false, msg:'Giao dịch đã đánh dấu thất bại.'}};
        const user = (st.users || []).find(u => u.id === dep.userId);
        if(!user) return {out: {ok:false, msg:'Không tìm thấy user nạp.'}};
        dep.status = 'Thành công';
        dep.confirmedAt = now;
        dep.confirmedBy = me.username;
        const tx = O.walletAdd(st, user, dep.credit, 'deposit', 'Nạp ' + (dep.kind === 'bank' ? 'QR ngân hàng' : 'thẻ cào ' + (dep.carrier || '')), dep.id);
        dep.balanceAfter = tx.balanceAfter;
        O.notify(st, user.id, 'deposit', 'Nạp tiền thành công +' + dep.credit.toLocaleString('vi-VN') + 'đ', 'Yêu cầu ' + dep.id + ' đã được admin xác nhận. Số dư mới: ' + tx.balanceAfter.toLocaleString('vi-VN') + 'đ.');
        /* nếu nạp gắn với đơn hàng → tự thanh toán đơn */
        if(dep.orderId){
          const order = (st.orders || []).find(o => o.id === dep.orderId && o.userId === user.id);
          if(order && order.status !== 'Đã thanh toán' && order.status !== 'Đã hủy' && user.balance >= order.total){
            O.walletAdd(st, user, -order.total, 'purchase', 'Thanh toán đơn ' + order.id + ' từ tiền nạp', order.id);
            O.grantOrder(st, order, user);
          }
        }
        return {out: {ok:true, msg:'✅ Đã duyệt nạp ' + dep.id + ' — +' + dep.credit.toLocaleString('vi-VN') + 'đ cho ' + user.username}};
      }
      if(act === 'deposit-reject'){
        const dep = (st.deposits || []).find(d => d.id === body.id);
        if(!dep) return {out: {ok:false, msg:'Không tìm thấy giao dịch nạp.'}};
        if(dep.status === 'Thành công') return {out: {ok:false, msg:'Đã thành công — không từ chối được.'}};
        dep.status = 'Thất bại';
        dep.gatewayMsg = C.cleanStr(body.msg, 200) || 'Admin xác nhận không nhận được thanh toán hợp lệ.';
        O.notify(st, dep.userId, 'deposit', 'Yêu cầu nạp ' + dep.id + ' không thành công', dep.gatewayMsg + ' Liên hệ hỗ trợ nếu bạn đã chuyển khoản thật.');
        return {out: {ok:true, msg:'Đã từ chối nạp ' + dep.id}};
      }

      /* ---------- plugin (cửa hàng) ---------- */
      if(act === 'plugin-new' || act === 'plugin-edit'){
        let pl;
        if(act === 'plugin-new'){
          pl = {id: C.uid('PL'), slug: 'pl-' + Date.now().toString(36), createdAt: C.vnDate(), published: false, best: false, sale: 0, image: '/img/pl-generic.jpg', features: [], installGuide: '', usageGuide: '', kind:'plugin', price: 0, version: '1.0'};
          st.plugins.unshift(pl);
        } else {
          pl = (st.plugins || []).find(p => p.id === body.id);
          if(!pl) return {out: {ok:false, msg:'Không tìm thấy Plugin.'}};
        }
        if(body.name !== undefined) pl.name = C.cleanStr(body.name, 100);
        if(body.category !== undefined) pl.category = C.cleanStr(body.category, 40) || 'Plugin chính';
        if(body.version !== undefined) pl.version = C.cleanStr(body.version, 30);
        if(body.price !== undefined) pl.price = C.clampInt(body.price, 0, 1000000000, 0);
        if(body.sale !== undefined) pl.sale = C.clampInt(body.sale, 0, 100, 0);
        if(body.description !== undefined) pl.description = C.cleanStr(body.description, 1000);
        if(body.installGuide !== undefined) pl.installGuide = C.cleanStr(body.installGuide, 2000);
        if(body.usageGuide !== undefined) pl.usageGuide = C.cleanStr(body.usageGuide, 2000);
        if(body.image !== undefined) pl.image = C.cleanStr(body.image, 200);
        if(body.kind !== undefined && ['plugin','vip'].includes(body.kind)) pl.kind = body.kind;
        if(body.pkg !== undefined) pl.pkg = C.cleanStr(body.pkg, 40);
        if(body.months !== undefined) pl.months = C.clampInt(body.months, 0, 1200, 0);
        if(Array.isArray(body.features)) pl.features = body.features.slice(0, 20).map(f => C.cleanStr(f, 120)).filter(Boolean);
        if(body.published !== undefined) pl.published = !!body.published;
        if(body.best !== undefined) pl.best = !!body.best;
        return {out: {ok:true, msg:(act === 'plugin-new' ? 'Đã tạo Plugin "' + pl.name + '"' : 'Đã lưu Plugin "' + pl.name + '"') + (pl.published ? '' : ' (đang ẨN — bật hiển thị khi sẵn sàng)')}};
      }
      if(act === 'plugin-del'){
        const pl = (st.plugins || []).find(p => p.id === body.id);
        if(!pl) return {out: {ok:false, msg:'Không tìm thấy Plugin.'}};
        if((st.orders || []).some(o => (o.items || []).some(l => l.pluginId === pl.id) && o.status === 'Đã thanh toán'))
          return {out: {ok:false, msg:'Plugin đã có đơn hàng thành công — chỉ ẨN được (act=plugin-edit, published=false) để giữ quyền tải của khách.'}};
        if(pl.fileKey) await C.blobDelete(pl.fileKey);
        st.plugins = st.plugins.filter(p => p.id !== pl.id);
        return {out: {ok:true, msg:'Đã xóa Plugin ' + pl.name}};
      }
      if(act === 'plugin-upload'){
        const pl = (st.plugins || []).find(p => p.id === body.id);
        if(!pl) return {out: {ok:false, msg:'Không tìm thấy Plugin.'}};
        const ver = C.cleanStr(body.version, 30);
        if(!ver) return {out: {ok:false, msg:'Nhập số PHIÊN BẢN (version) khi upload — ví dụ 3.16.10.'}};
        try{
          const buf = Buffer.from(String(body.fileB64 || ''), 'base64');
          if(!buf.length) return {out: {ok:false, msg:'File rỗng.'}};
          if(buf.length > 3.5 * 1024 * 1024) return {out: {ok:false, msg:'File tối đa 3.5MB qua upload web — dùng plugin-seturl cho file lớn hơn.'}};
          if(pl.fileKey) await C.blobDelete(pl.fileKey);
          const meta = await C.putFile(pl.id, C.cleanStr(body.fileName, 80) || 'plugin.zip', buf, 'application/octet-stream');
          pl.fileKey = meta.fileKey; pl.fileUrl = meta.fileUrl; pl.fileName = meta.fileName; pl.fileSize = meta.fileSize;
          /* ghi rõ phiên bản khi upload — người dùng tải luôn là file mới nhất theo bản của họ */
          pl.version = ver; pl.versionUpdatedAt = C.vnStr();
          return {out: {ok:true, msg:'⬆ Đã upload ' + meta.fileName + ' (' + (meta.fileSize/1024).toFixed(1) + 'KB) cho ' + pl.name + ' — phiên bản mới: v' + ver + ' (thay thế file cũ, người dùng tải được bản mới nhất ngay)'}};
        }catch(e){ return {out: {ok:false, msg:'Upload lỗi: ' + e.message}}; }
      }
      if(act === 'plugin-seturl'){
        const pl = (st.plugins || []).find(p => p.id === body.id);
        if(!pl) return {out: {ok:false, msg:'Không tìm thấy Plugin.'}};
        const url = C.cleanStr(body.url, 500);
        if(!/^https:\/\//.test(url)) return {out: {ok:false, msg:'URL phải là https://'}};
        if(pl.fileKey) await C.blobDelete(pl.fileKey);
        pl.fileKey = null; pl.fileUrl = url;
        pl.fileName = C.cleanStr(body.fileName, 80) || 'plugin.zip';
        return {out: {ok:true, msg:'Đã gắn file tải từ URL (server proxy — URL không lộ cho khách)'}};
      }

      /* ---------- MỤC 7 (24/11/2026): JAR THEO PHIÊN BẢN cho 2 gói FREE & VIP ----------
         · jar-upload: file nhỏ ≤3,5MB gửi trực tiếp (server thấy byte → tự tính SHA-256)
         · jar-done  : file lớn upload theo phần (jar-part) → server GHÉP + kiểm tra + SHA-256
         · Lưu jarReleases (lịch sử, KHÔNG ghi đè file cũ) + jarLog (ai/lúc/bản/phiên bản)
         · jar-latest: "đặt lại bản này làm mới nhất" — hoàn tác khi lỡ upload nhầm */
      const JAR_MAX = 80 * 1024 * 1024;
      const JAR_PLUGIN = {free: 'PL-FREE', vip: 'PL-MAIN'};
      async function finalizeJar(me, buf, meta){
        const pkg = meta.pkg;
        if(!['free','vip'].includes(pkg)) return {ok:false, msg:'Chọn gói FREE hoặc VIP.'};
        const ver = C.cleanStr(meta.version, 30);
        if(!ver || !/^[A-Za-z0-9._+~-]{1,30}$/.test(ver)) return {ok:false, msg:'BẮT BUỘC nhập số phiên bản (VD: 3.16.10 — chỉ chữ, số, . _ + -).'};
        const name = C.cleanStr(meta.fileName, 80) || 'plugin.jar';
        if(!/\.jar$/i.test(name)) return {ok:false, msg:'Chỉ nhận file .jar — file "' + name + '" bị từ chối ở SERVER.'};
        if(!buf.length) return {ok:false, msg:'File rỗng.'};
        if(buf.length > JAR_MAX) return {ok:false, msg:'File quá lớn (giới hạn 80MB).'};
        if(!C.isZipBytes(buf)) return {ok:false, msg:'File không phải ZIP/JAR hợp lệ (server kiểm tra magic bytes PK) — từ chối.'};
        const sha = C.sha256Hex(buf);
        /* lưu file mới — KHÔNG xóa file cũ: giữ nguyên lịch sử phiên bản */
        const file = await C.putFile('jar-' + pkg, name, buf, 'application/java-archive');
        st.jarReleases = st.jarReleases || [];
        for(const r of st.jarReleases) if(r.pkg === pkg) r.latest = false;
        const rel = {id: C.uid('JR'), pkg, version: ver, changelog: C.cleanStr(meta.changelog, 400),
          fileName: file.fileName, fileKey: file.fileKey, fileUrl: file.fileUrl, size: buf.length,
          sha256: sha, uploader: me.username, at: C.vnStr(), latest: true, downloads: 0};
        st.jarReleases.unshift(rel);
        /* đồng bộ product tương ứng (shop + tải file hiển thị đúng bản mới nhất) */
        const pl = (st.plugins || []).find(p => p.id === JAR_PLUGIN[pkg]);
        if(pl){ pl.fileKey = file.fileKey; pl.fileUrl = file.fileUrl; pl.fileName = file.fileName; pl.fileSize = buf.length; pl.version = ver; pl.versionUpdatedAt = C.vnStr(); }
        S.jarLog = S.jarLog || [];
        S.jarLog.unshift({id: C.uid('JL'), at: C.vnStr(), by: me.username, act: 'upload', pkg, version: ver, releaseId: rel.id, fileName: file.fileName, size: buf.length, sha256: sha});
        if(S.jarLog.length > 200) S.jarLog.length = 200;
        O.notify(st, 'admins', 'jar', 'Đã upload jar ' + pkg.toUpperCase() + ' v' + ver, me.username + ' upload ' + file.fileName + ' (' + (buf.length/1024).toFixed(0) + 'KB) — SHA-256 ' + sha.slice(0, 12) + '… — trở thành bản mới nhất của gói ' + pkg.toUpperCase() + '.');
        /* dọn phần tạm — chỉ xóa đúng các phần đã biết (không LIST: LIST là Advanced ops trên Blob) */
        const uidv = C.cleanStr(meta.uid, 40);
        if(/^[a-f0-9]{12,40}$/.test(uidv)){
          const np = C.clampInt(meta.parts, 1, 40, 1);
          for(let i = 0; i < np; i++){ try{ await C.blobDelete('tmp/jar/' + uidv + '/part-' + String(i).padStart(2, '0')); }catch(e){} }
        }
        return {ok:true, msg:'⬆ Đã tải lên ' + file.fileName + ' (' + (buf.length/1024).toFixed(1) + 'KB) — gói ' + pkg.toUpperCase() + ' phiên bản v' + ver + ' — SHA-256: ' + sha + ' — đây là bản MỚI NHẤT của gói này.', release: {id: rel.id, pkg, version: ver, size: buf.length, sha256: sha}};
      }
      if(act === 'jar-upload'){
        if(!C.rateHit('jarup:' + me.id, 30, 3600 * 1000)) return {out: {ok:false, msg:'Upload quá 30 lần/giờ — thử lại sau.'}};
        const buf = Buffer.from(String(body.fileB64 || ''), 'base64');
        const r = await finalizeJar(me, buf, {pkg: body.pkg, version: body.version, changelog: body.changelog, fileName: body.fileName});
        return {out: r};
      }
      if(act === 'jar-done'){
        if(!C.rateHit('jarup:' + me.id, 30, 3600 * 1000)) return {out: {ok:false, msg:'Upload quá 30 lần/giờ — thử lại sau.'}};
        const uidv = C.cleanStr(body.uid, 40);
        if(!/^[a-f0-9]{12,40}$/.test(uidv)) return {out: {ok:false, msg:'Mã phiên upload không hợp lệ.'}};
        const parts = C.clampInt(body.parts, 1, 40, 1);
        /* ghép phần theo ĐƯỜNG DẪN XÁC ĐỊNH (part-00, part-01…) — KHÔNG LIST:
           LIST là Advanced ops (nguyên nhân store Blob bị khóa quota — 25/11/2026) */
        const chunks = [];
        let total = 0;
        for(let i = 0; i < parts; i++){
          const path = 'tmp/jar/' + uidv + '/part-' + String(i).padStart(2, '0');
          let ch;
          try{ ch = await C.blobGetRaw(path, 45000); }
          catch(e){ return {out: {ok:false, msg:'Thiếu phần ' + i + ' — tải lại phần đó rồi bấm hoàn tất.'}}; }
          if(total + ch.length > JAR_MAX) return {out: {ok:false, msg:'File vượt giới hạn 80MB.'}};
          chunks.push(ch); total += ch.length;
        }
        const buf = Buffer.concat(chunks, total);
        const r = await finalizeJar(me, buf, {pkg: body.pkg, version: body.version, changelog: body.changelog, fileName: body.fileName, uid: uidv, parts});
        return {out: r};
      }
      if(act === 'jar-latest'){
        const rel = (st.jarReleases || []).find(x => x.id === body.id);
        if(!rel) return {out: {ok:false, msg:'Không tìm thấy phiên bản trong lịch sử.'}};
        for(const r of st.jarReleases) if(r.pkg === rel.pkg) r.latest = false;
        rel.latest = true; rel.restoredAt = C.vnStr(); rel.restoredBy = me.username;
        const pl = (st.plugins || []).find(p => p.id === JAR_PLUGIN[rel.pkg]);
        if(pl){ pl.fileKey = rel.fileKey; pl.fileUrl = rel.fileUrl; pl.fileName = rel.fileName; pl.fileSize = rel.size; pl.version = rel.version; pl.versionUpdatedAt = C.vnStr(); }
        S.jarLog = S.jarLog || [];
        S.jarLog.unshift({id: C.uid('JL'), at: C.vnStr(), by: me.username, act: 'set-latest', pkg: rel.pkg, version: rel.version, releaseId: rel.id, fileName: rel.fileName, size: rel.size, sha256: rel.sha256});
        if(S.jarLog.length > 200) S.jarLog.length = 200;
        O.notify(st, 'admins', 'jar', 'Đặt lại bản mới nhất: ' + rel.pkg.toUpperCase() + ' v' + rel.version, me.username + ' đã đặt ' + rel.fileName + ' (upload ' + rel.at + ') trở thành bản mới nhất của gói ' + rel.pkg.toUpperCase() + '.');
        return {out: {ok:true, msg:'📌 Đã đặt ' + rel.pkg.toUpperCase() + ' v' + rel.version + ' (upload ' + rel.at + ') làm bản MỚI NHẤT — người dùng tải sẽ nhận đúng bản này.'}};
      }

      /* ---------- đánh giá ---------- */
      if(act === 'review-set'){
        const rv = (st.reviews || []).find(r => r.id === body.id);
        if(!rv) return {out: {ok:false, msg:'Không tìm thấy đánh giá.'}};
        if(body.status !== undefined) rv.status = body.status === 'visible' ? 'visible' : 'hidden';
        if(body.reply !== undefined) rv.reply = C.cleanStr(body.reply, 400);
        return {out: {ok:true, msg:'Đã cập nhật đánh giá ' + rv.id}};
      }
      if(act === 'review-del'){
        st.reviews = (st.reviews || []).filter(r => r.id !== body.id);
        return {out: {ok:true, msg:'Đã xóa đánh giá'}};
      }

      /* ---------- broadcast + changelog ---------- */
      if(act === 'broadcast'){
        const title = C.cleanStr(body.title, 100), text = C.cleanStr(body.body, 400);
        if(!title || !text) return {out: {ok:false, msg:'Thiếu tiêu đề/nội dung.'}};
        st.notifications.unshift({id: C.uid('n'), to:'all', type: ['update','promo','system'].includes(body.type) ? body.type : 'system', title, body: text, date: C.vnDate(), at: now, by: me.username});
        return {out: {ok:true, msg:'📢 Đã gửi broadcast tới mọi tài khoản: ' + title}};
      }
      if(act === 'changelog-new'){
        const version = C.cleanStr(body.version, 30), title = C.cleanStr(body.title, 100);
        if(!version || !title) return {out: {ok:false, msg:'Thiếu version/tiêu đề.'}};
        st.changelog.unshift({version, date: C.cleanStr(body.date, 10) || C.vnDate(), title, items: String(body.items || '').split('\n').map(x => C.cleanStr(x, 150)).filter(Boolean)});
        st.notifications.unshift({id: C.uid('n'), to:'all', type:'update', title:'Đã phát hành phiên bản ' + version, body:'Vào mục Changelog xem chi tiết.', date: C.vnDate(), at: now, by: me.username});
        return {out: {ok:true, msg:'Đã đăng changelog v' + version}};
      }

      /* ---------- referral ---------- */
      if(act === 'referral-set'){
        const r = (st.referrals || []).find(x => x.id === body.id);
        if(!r) return {out: {ok:false, msg:'Không tìm thấy referral.'}};
        if(!['approved','rejected','paid'].includes(body.st)) return {out: {ok:false, msg:'Trạng thái không hợp lệ.'}};
        if(r.status === body.st) return {out: {ok:false, msg:'Referral đã ở trạng thái này.'}};
        r.status = body.st;
        if(body.st === 'approved'){
          const u = (st.users || []).find(x => x.username === r.referrer);
          if(u) O.walletAdd(st, u, r.commission, 'referral', 'Hoa hồng giới thiệu đơn ' + r.order, r.id);
        }
        if(body.st === 'rejected') O.notify(st, (st.users.find(u => u.username === r.referrer) || {}).id, 'system', 'Referral ' + r.id + ' bị từ chối', 'Đơn ' + r.order + ' không đủ điều kiện hoa hồng.');
        return {out: {ok:true, msg:'Đã cập nhật ' + r.id + ' → ' + body.st}};
      }

      /* ---------- ticket admin ---------- */
      if(act === 'ticket-reply'){
        const t = (st.tickets || []).find(x => x.id === body.id);
        if(!t) return {out: {ok:false, msg:'Không tìm thấy ticket.'}};
        const text = C.cleanStr(body.body, 1000);
        if(!text) return {out: {ok:false, msg:'Nội dung trống.'}};
        t.replies.push({by:'admin', at: now, body: text});
        t.status = 'Đang xử lý';
        O.notify(st, t.userId, 'ticket', 'Admin trả lời ticket ' + t.id, text.slice(0, 150));
        return {out: {ok:true, msg:'Đã trả lời ticket ' + t.id}};
      }
      if(act === 'ticket-close'){
        const t = (st.tickets || []).find(x => x.id === body.id);
        if(!t) return {out: {ok:false, msg:'Không tìm thấy ticket.'}};
        t.status = 'Đã đóng';
        t.replies.push({by:'admin', at: now, body:'Ticket đã được đóng.'});
        return {out: {ok:true, msg:'Đã đóng ticket ' + t.id}};
      }

      /* ---------- cấu hình ---------- */
      if(act === 'rates'){
        const r = S.topupRates = S.topupRates || {global: 20, carriers: {}};
        r.global = C.clampInt(body.global, 0, 90, 20);
        r.carriers = r.carriers || {};
        let set = 0;
        for(const c of O.CARRIERS){
          const k = c.toLowerCase(), v = (body.carriers || {})[k];
          if(v === '' || v === null || v === undefined) delete r.carriers[k];
          else { r.carriers[k] = C.clampInt(v, 0, 90, r.global); set++; }
        }
        return {out: {ok:true, msg:'🏷 Đã lưu chiết khấu: chung ' + r.global + '%' + (set ? ' + riêng ' + set + ' nhà mạng' : '')}};
      }
      if(act === 'pricing'){
        /* A13 mới: sửa TỪNG MỐC thời hạn — số ngày (0 = vĩnh viễn), giá, % giảm giá riêng cho mốc đó */
        const tiers = S.licenseTiers = Array.isArray(S.licenseTiers) && S.licenseTiers.length ? S.licenseTiers : O.tierDefaults();
        const inTiers = Array.isArray(body.tiers) ? body.tiers : [];
        let changed = 0;
        for(const t of tiers){
          const inp = inTiers.find(x => x && x.id === t.id) || inTiers[tiers.indexOf(t)] || {};
          if(inp.days !== undefined){ t.days = C.clampInt(inp.days, 0, 3650, t.days); }
          if(inp.price !== undefined){ t.price = C.clampInt(inp.price, 0, 1000000000, t.price); }
          if(inp.sale !== undefined){ t.sale = C.clampInt(inp.sale, 0, 100, t.sale); }
          changed++;
        }
        const sum = tiers.map(t => O.tierLabel(t.days) + ' → ' + (t.sale ? Math.round(t.price * (100 - t.sale) / 100).toLocaleString('vi-VN') : t.price.toLocaleString('vi-VN')) + 'đ (' + t.sale + '% giảm)').join(' · ');
        return {out: {ok:true, msg:'💾 Đã lưu ' + changed + ' mốc thời hạn: ' + sum}};
      }

      /* ---------- license & key (nâng cấp VIP, tạo key thủ công) ---------- */
      if(act === 'grant-vip' || act === 'mint-key'){
        /* A20 nâng cấp VIP cho user / A21 tạo key thủ công — không qua thanh toán */
        const tiers = Array.isArray(S.licenseTiers) && S.licenseTiers.length ? S.licenseTiers : O.tierDefaults();
        const tier = tiers.find(t => t.id === body.tierId);
        if(!tier) return {out: {ok:false, msg:'Chọn mốc thời hạn hợp lệ (30/180/365 ngày hoặc Vĩnh viễn).'}};
        let user = null;
        if(act === 'grant-vip' || body.who){
          const q = C.cleanStr(body.who, 60).toLowerCase();
          user = (st.users || []).find(x => x.username.toLowerCase() === q || (x.email || '').toLowerCase() === q);
          if(!user) return {out: {ok:false, msg:'Không tìm thấy tài khoản "' + body.who + '" theo username hoặc email.'}};
          if(user.banned) return {out: {ok:false, msg:'Tài khoản ' + user.username + ' đang bị khóa — mở khóa trước khi cấp license.'}};
        }
        const fromLv = user ? C.userLevel(st, user) : null;   /* log: từ gì -> vip */
        const lic = O.makeLicense(st, tier, user, act === 'grant-vip' ? 'admin-grant:' + me.username : 'admin-mint:' + me.username);
        const label = lic.package;
        S.grantLog = S.grantLog || [];
        S.grantLog.unshift({at: now, by: me.username, act, key: lic.key, who: user ? user.username : '(key rời — chưa gán)', package: label, days: Number(tier.days) || 0});
        if(S.grantLog.length > 100) S.grantLog.length = 100;
        if(user){
          /* 24/11/2026: nhật ký đổi cấp (nâng Free -> VIP bởi admin) */
          O.logLevel(st, {by: me.username, act: 'upgrade (admin)', who: user.username, from: fromLv, to: 'vip', keys: [lic.key], reason: C.cleanStr(body.reason, 120) || 'Admin nâng cấp trực tiếp'});
          O.notify(st, user.id, 'license', 'Bạn được cấp license ' + label + ' từ quản trị viên', 'Key của bạn (ẩn một phần: ' + lic.key.split('-').slice(0, 3).join('-') + '-****-' + lic.key.split('-').pop() + ') đã gán vào tài khoản ' + user.username + '. Lý do: ' + (C.cleanStr(body.reason, 100) || 'hỗ trợ/khuyến mãi từ admin') + '. Vào "Tra cứu key" nhập key để xem chi tiết.');
          return {out: {ok:true, msg:'⬆ Đã NÂNG CẤP ' + user.username + ' lên ' + label + ' — key: ' + lic.key + (lic.expires ? ' (hết hạn ' + lic.expires + ')' : ' (không bao giờ hết hạn)')}};
        }
        return {out: {ok:true, msg:'🔑 Đã tạo key ' + label + ' RỜI (chưa gán ai): ' + lic.key + ' — giao cho người dùng sau, hoặc gán tại ô "Gán key cho tài khoản".'}};
      }
      /* 24/11/2026 — A22 HẠ CẤP VIP -> FREE thủ công: thu hồi license VIP (giữ bản ghi, không xóa dữ liệu),
         cấp key bản FREE nếu chưa có, ghi nhật ký đầy đủ + thông báo khách */
      if(act === 'demote-free'){
        const q = C.cleanStr(body.who, 60).toLowerCase();
        const user = (st.users || []).find(x => x.username.toLowerCase() === q || (x.email || '').toLowerCase() === q);
        if(!user) return {out: {ok:false, msg:'Không tìm thấy tài khoản "' + body.who + '" theo username hoặc email.'}};
        if(user.role === 'admin') return {out: {ok:false, msg:'Không hạ cấp tài khoản quản trị.'}};
        const fromLv = C.userLevel(st, user);
        const vips = (st.licenses || []).filter(l => l.userId === user.id && C.isVipKey(l.key) && !l.revoked);
        if(fromLv === 'free' && !vips.length) return {out: {ok:false, msg:'Tài khoản này đã là bản FREE và không có license VIP nào để thu hồi.'}};
        const keys = [];
        for(const l of vips){
          l.revoked = true; l.revokedAt = now; l.revokedBy = me.username;
          l.revokedReason = C.cleanStr(body.reason, 120) || 'Admin hạ cấp về FREE';
          keys.push(l.key);
        }
        const df = O.ensureFreeKey(st, user);
        O.logLevel(st, {by: me.username, act: 'demote (admin)', who: user.username, from: fromLv, to: 'free', keys, reason: C.cleanStr(body.reason, 120) || 'Admin hạ cấp thủ công'});
        O.notify(st, user.id, 'license', 'Tài khoản đã chuyển về bản FREE', 'License VIP (' + (keys.join(', ') || 'không có') + ') đã được thu hồi bởi quản trị viên. KEY bản FREE (' + df.key + ') vẫn giữ nguyên — tải Plugin bản FREE trong "Tải file". Mua lại VIP bất cứ lúc nào.');
        return {out: {ok:true, msg:'⬇ Đã HẠ ' + user.username + ' từ ' + fromLv.toUpperCase() + ' về FREE — thu hồi ' + keys.length + ' license VIP' + (keys.length ? ' (' + keys.join(', ') + ')' : '') + ' — key FREE: ' + df.key}};
      }
      if(act === 'assign-key'){
        const lic = (st.licenses || []).find(l => l.key === C.cleanStr(body.key, 40).toUpperCase());
        if(!lic) return {out: {ok:false, msg:'Không tìm thấy key.'}};
        if(lic.userId) return {out: {ok:false, msg:'Key này đã gán cho một tài khoản rồi.'}};
        const q = C.cleanStr(body.who, 60).toLowerCase();
        const user = (st.users || []).find(x => x.username.toLowerCase() === q || (x.email || '').toLowerCase() === q);
        if(!user) return {out: {ok:false, msg:'Không tìm thấy tài khoản "' + body.who + '".'}};
        lic.userId = user.id;
        S.grantLog = S.grantLog || [];
        S.grantLog.unshift({at: now, by: me.username, act:'assign-key', key: lic.key, who: user.username, package: lic.package, days: lic.days});
        O.notify(st, user.id, 'license', 'Key ' + lic.package + ' được gán vào tài khoản bạn', 'Admin đã gán key ' + lic.key.split('-').slice(0, 3).join('-') + '-****-' + lic.key.split('-').pop() + ' (' + lic.package + ') vào tài khoản của bạn.');
        return {out: {ok:true, msg:'✅ Đã gán key ' + lic.package + ' cho ' + user.username}};
      }
      if(act === 'bank'){
        S.bank = {bin: C.cleanStr(body.bin, 6).replace(/\D/g,''), account: C.cleanStr(body.account, 20).replace(/\s/g,''),
          name: C.cleanStr(body.name, 60).toUpperCase(), shortName: C.cleanStr(body.shortName, 20), isSample: false};
        if(!/^\d{6}$/.test(S.bank.bin) || !S.bank.account) return {out: {ok:false, msg:'BIN ngân hàng (6 số) và số tài khoản là bắt buộc.'}};
        return {out: {ok:true, msg:'🏦 Đã lưu thông tin tài khoản nhận tiền — QR sinh từ giờ dùng tài khoản thật của bạn.'}};
      }
      if(act === 'gate'){
        const code = C.cleanStr(body.code, 6).replace(/\D/g,''), pass = String(body.password || '');
        if(code.length !== 6 || pass.length < 6) return {out: {ok:false, msg:'Mã 6 số + mật khẩu quản trị (≥6 ký tự) là bắt buộc.'}};
        S.adminGate = {code, password: pass};
        return {out: {ok:true, msg:'🔐 Đã đổi cổng quản trị — dùng mã + mật khẩu mới từ lần mở tiếp theo.'}};
      }

      /* ---------- MIGRATE DỮ LIỆU KHÁCH TỪ WEB CHÍNH v1 (web-v2-promote) ---------- */
      /* act=migrate-v1 — chỉ chạy khi DRIVER=postgres. dry=true (mặc định) chỉ ĐỌC nguồn
         public.* (SELECT thuần, bảng whitelist) + trả BÁO CÁO ĐỐI CHIẾU; dry=false +
         confirm='MIGRATE-V1' mới thay dữ liệu. Ghi nhận đầy đủ vào st.migrateV1. */
      if(act === 'migrate-v1'){
        if(C.DRIVER !== 'postgres' || !C.pg) return {out: {ok:false, msg:'Migration chỉ chạy ở chế độ kho POSTGRES (DATABASE_URL). Preview hiện không có kho Postgres — gắn DATABASE_URL (Neon branch bản sao dữ liệu thật) vào Preview rồi thử lại.'}};
        const M = require('./_lib/migrate-v1.js');
        const warnings = [];
        let src, counts, byStatus, sumApproved, srcChecksum;
        try{
          ({src, counts, byStatus, sumApproved, checksum: srcChecksum} = await M.readSource(C.pg, warnings));
        }catch(e){
          return {out: {ok:false, msg:'Không đọc được DB nguồn (public.*): ' + String(e.message).slice(0, 160) + ' — kiểm tra DATABASE_URL/Neon trước khi migrate.'}};
        }
        const mapped = M.mapPackages(src);
        const ctx = M.buildContext(src, mapped);
        const dry = body.dry !== false;
        const report = M.buildReport(src, counts, byStatus, sumApproved, srcChecksum, mapped, ctx, st);
        if(warnings.length) report.warnings = warnings.concat(report.warnings || []);
        if(dry){
          return {out: {ok:true, dryRun:true, msg:'ĐỌC THỬ nguồn web chính xong (KHÔNG ghi gì) — xem chi tiết trong báo cáo kèm theo.', report}};
        }
        if(String(body.confirm || '') !== 'MIGRATE-V1'){
          return {out: {ok:false, msg:'Thiếu confirm="MIGRATE-V1" — đây là thao tác THAY DỮ LIỆU, bắt buộc gõ confirm đầy đủ. Hãy chạy dry=true trước để xem báo cáo đối chiếu.'}};
        }
        if(st.migrateV1 && !body.force){
          return {out: {ok:false, msg:'Đã migrate lúc ' + st.migrateV1.at + ' rồi. Chạy lại cần body.force=true (migrate có idempotent — keyHash/đơn trùng sẽ bị bỏ qua, không nhân đôi).'}};
        }
        const bank = M.mapBank(src.settings, st);
        const applied = M.applyCommit(st, src, ctx, mapped, bank, {counts, srcChecksum});
        report.dryRun = false;
        report.applied = applied;
        report.bank = bank;
        return {out: {ok:true, msg:'✅ MIGRATE xong: +' + applied.licenses.added + ' license, +' + applied.orders.added + ' đơn, +' + applied.users.addedCount + ' tài khoản (merge ' + applied.users.merged.length + '). Xem st.migrateV1 + report đối chiếu.', report}};
      }

      /* ---------- backup / restore ---------- */
      if(act === 'backup-get'){
        return {out: {ok:true, state: JSON.parse(JSON.stringify(Object.assign({}, st, {sessions: {}})))}};
      }
      if(act === 'restore'){
        try{
          const obj = typeof body.json === 'string' ? JSON.parse(body.json) : body.json;
          if(!obj.users || !obj.plugins || !obj.orders) return {out: {ok:false, msg:'Backup không đúng cấu trúc (thiếu users/plugins/orders).'}};
          const sessions = st.sessions;
          for(const k of Object.keys(st)) if(k !== 'rev' && k !== 'sessions') delete st[k];
          Object.assign(st, obj);
          st.sessions = sessions;
          O.notify(st, me.id, 'system', 'Khôi phục dữ liệu thành công', 'Backup đã ghi đè toàn bộ dữ liệu lúc ' + now);
          return {out: {ok:true, msg:'✅ Khôi phục thành công — ' + (obj.users || []).length + ' users, ' + (obj.orders || []).length + ' đơn.'}};
        }catch(e){ return {out: {ok:false, msg:'JSON không hợp lệ: ' + e.message}}; }
      }

      return {out: {ok:false, msg:'Hành động quản trị không hợp lệ: ' + act}};
    });
    return C.json(res, out.auth ? 403 : 200, out);
  }catch(e){
    return C.fail(res, 500, 'Lỗi server: ' + e.message);
  }
};
