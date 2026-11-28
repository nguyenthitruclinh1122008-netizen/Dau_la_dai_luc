/* /api/auth — đăng ký, đăng nhập, đổi mật khẩu/email, hồ sơ, 2FA */
'use strict';
const C = require('./_lib/core.js');
const A = require('./_lib/api.js');
const O = require('./_lib/ops.js');

module.exports = async (req, res) => {
  let body = {};
  /* FIX 25/11/2026: 100.000 → 4.000.000 — trước đây ảnh đại diện ≤2MB (fileB64 ~2,7MB) luôn bị
     chặn "Body không hợp lệ" do giới hạn body cũ chỉ 100KB (mục 8 không thể dùng thật) */
  try{ body = req.method === 'GET' ? {} : await readBody(req, 4000000); }catch(e){ return C.fail(res, 400, 'Body quá lớn hoặc không hợp lệ (tối đa ~3MB dữ liệu ảnh).'); }
  const act = body.act || C.qOf(req).act || '';

  try{
    if(req.method === 'GET' || act === 'me'){
      const me = await C.getState(); const mu = A.getAuth(req, me);
      return C.json(res, 200, {ok: true, me: mu && mu.id ? A.safeUser(mu, me) : null});
    }
    if(act === 'register'){
      if(!C.rateHit('reg:' + C.ipOf(req), 5, 30*60*1000)) return C.fail(res, 429, 'Đăng ký quá nhiều lần — thử lại sau 30 phút.');
      const username = C.cleanStr(body.username, 24);
      const email = C.cleanStr(body.email, 80);
      const password = String(body.password || '');
      if(!/^[A-Za-z0-9_.]{3,24}$/.test(username)) return C.fail(res, 400, 'Tên đăng nhập 3–24 ký tự (chữ, số, _ hoặc .).');
      if(password.length < 6) return C.fail(res, 400, 'Mật khẩu cần tối thiểu 6 ký tự.');
      const out = await C.withState(async st => {
        if((st.users || []).some(u => u.username.toLowerCase() === username.toLowerCase()))
          return {out: {ok:false, msg:'Tên đăng nhập "' + username + '" đã tồn tại — chọn tên khác.'}};
        if(email && (st.users || []).some(u => (u.email || '').toLowerCase() === email.toLowerCase()))
          return {out: {ok:false, msg:'Email này đã được dùng cho tài khoản khác.'}};
        let referredBy = null;
        const refCode = C.cleanStr(body.ref, 20).toUpperCase();
        if(refCode){
          const r = (st.users || []).find(x => (x.referralCode || '').toUpperCase() === refCode);
          if(r && r.username.toLowerCase() !== username.toLowerCase()) referredBy = r.username;
        }
        const nu = {
          id: C.uid('u'), username, email, role:'user', banned: false,
          passHash: C.hashPassword(password),
          createdAt: C.vnDate(), points: 0, pointLog: [], balance: 0,
          referralCode: 'DL-' + crypto2(4), referredBy,
          twoFA: {enabled: false, secret: ''}, readNotifs: [], avatar: '', displayName: ''
        };
        st.users.push(nu);
        /* 24/11/2026 — YÊU CẦU CHỦ SHOP: đăng ký xong tự cấp 1 KEY FREE tiền tố DF,
           dùng vĩnh viễn, không cần mua hay làm gì thêm. Log + thông báo ngay.
           FIX 25/11/2026: dùng CHUỖI key (freeKeyStr) trong notify/log/response — trước đây
           truyền cả object license → thông báo hiện "[object Object]". */
        const freeKeyStr = O.ensureFreeKey(st, nu).key;
        O.logLevel(st, {by: 'auto (đăng ký)', act: 'register-free', who: nu.username, from: '(tài khoản mới)', to: 'free', keys: [freeKeyStr], reason: 'Tự cấp KEY FREE khi đăng ký'});
        const token = C.newSessionToken();
        st.sessions[token] = {uid: nu.id, exp: C.nowMs() + 30*86400000};
        O.notify(st, nu.id, 'license', 'Bạn được tặng KEY BẢN FREE: ' + freeKeyStr, 'Key bản FREE dùng VĨNH VIỄN, tải được Plugin bản FREE trong mục "Tải file". Nâng cấp VIP bất cứ lúc nào tại cửa hàng.');
        return {out: {ok:true, username: nu.username, token, setCookie: C.sessionCookie(token), freeKey: freeKeyStr}};
      });
      if(!out.ok) return C.json(res, 200, out);
      res.setHeader('Set-Cookie', out.setCookie);
      return C.json(res, 200, {ok: true, username: out.username, freeKey: out.freeKey || null});
    }
    if(act === 'login'){
      const username = C.cleanStr(body.username, 24);
      const password = String(body.password || '');
      const code = C.cleanStr(body.code, 8);
      if(!C.rateHit('login:' + C.ipOf(req) + ':' + username.toLowerCase(), 8, 10*60*1000))
        return C.fail(res, 429, 'Bạn đã sai quá nhiều lần — thử lại sau 10 phút.');
      const out = await C.withState(async st => {
        const u = (st.users || []).find(x => x.username.toLowerCase() === username.toLowerCase());
        /* 26/11/2026 (web-v2-promote) — CẦU NỐI MẬT KHẨU web chính v1: tài khoản migrate giữ
           passV1 = {salt, hash} (scrypt 64 byte, chuẩn users.ts của v1). Sai hash v2 → thử v1;
           đúng thì TỰ NÂNG CẤP sang hash v2 và xóa passV1 (khách không phải làm gì). */
        const LC = require('./_lib/license-contract.js');
        let okLogin = u ? C.checkPassword(password, u.passHash) : false;
        let v1Upgrade = false;
        if(!okLogin && u && u.passV1 && u.passV1.salt && u.passV1.hash){
          okLogin = LC.checkPasswordV1(password, u.passV1.salt, u.passV1.hash);
          if(okLogin){
            u.passHash = C.hashPassword(password);
            u.passV1 = null;
            v1Upgrade = true;
          }
        }
        if(!u || !okLogin) return {out: {ok:false, msg:'Sai tên đăng nhập hoặc mật khẩu.'}};
        if(u.banned) return {out: {ok:false, msg:'Tài khoản đã bị khóa: ' + (u.banReason || 'vi phạm quy định.')}};
        if(u.twoFA && u.twoFA.enabled){
          if(!code) return {out: {ok:false, need2fa:true, msg:'Tài khoản bật 2FA — nhập mã 6 số.'}};
          if(!C.verify2fa(u.twoFA.secret, code)) return {out: {ok:false, need2fa:true, msg:'Mã 2FA không đúng, thử lại.'}};
        }
        const token = C.newSessionToken();
        st.sessions[token] = {uid: u.id, exp: C.nowMs() + 30*86400000};
        pruneSessions(st);
        return {out: {ok:true, username: u.username, role: u.role, token, setCookie: C.sessionCookie(token)}};
      });
      if(!out.ok) return C.json(res, 200, out);
      res.setHeader('Set-Cookie', out.setCookie);
      return C.json(res, 200, {ok: true, username: out.username, role: out.role});
    }
    if(act === 'logout'){
      const token = C.parseCookies(req).dl_sess;
      await C.withState(st => { if(token && st.sessions) delete st.sessions[token]; });
      res.setHeader('Set-Cookie', C.clearCookie());
      return C.json(res, 200, {ok: true});
    }
    /* các hành động cần đăng nhập */
    const out = await C.withState(async st => {
      const me = A.getAuth(req, st);
      if(!me) return {out: {ok:false, auth:true, msg:'Bạn chưa đăng nhập.'}};
      if(act === 'password'){
        /* MỤC 8 (24/11/2026): đổi mật khẩu — server kiểm mật khẩu cũ, mới tối thiểu 8 ký tự,
           GIỚI HẠN số lần nhập sai (5 lần/15 phút), và ĐĂNG XUẤT mọi phiên đăng nhập KHÁC */
        if(!C.rateHit('pw:' + me.id, 5, 15 * 60 * 1000)) return {out: {ok:false, msg:'Bạn đã thử đổi mật khẩu quá 5 lần trong 15 phút — chờ rồi thử lại.'}};
        /* 26/11/2026: mật khẩu hiện tại — chấp nhận cả hash v2 lẫn hash v1 (tài khoản migrate) */
        const LCx = require('./_lib/license-contract.js');
        let oldOk = C.checkPassword(String(body.old || ''), me.passHash);
        if(!oldOk && me.passV1 && me.passV1.salt && me.passV1.hash) oldOk = LCx.checkPasswordV1(String(body.old || ''), me.passV1.salt, me.passV1.hash);
        if(!oldOk){
          return {out: {ok:false, msg:'Mật khẩu hiện tại không đúng.'}};
        }
        if(String(body.nw || '').length < 8) return {out: {ok:false, msg:'Mật khẩu mới cần tối thiểu 8 ký tự.'}};
        me.passHash = C.hashPassword(String(body.nw));
        /* đăng xuất mọi phiên khác: xóa mọi session của user TRỪ phiên hiện tại */
        const curToken = C.parseCookies(req).dl_sess;
        let killed = 0;
        for(const k of Object.keys(st.sessions || {})){
          if(st.sessions[k].uid === me.id && k !== curToken){ delete st.sessions[k]; killed++; }
        }
        O.notify(st, me.id, 'system', 'Bạn vừa đổi mật khẩu thành công', killed > 0
          ? 'Đã đổi mật khẩu lúc ' + C.vnStr() + ' và ĐĂNG XUẤT ' + killed + ' phiên đăng nhập khác trên thiết bị khác. Nếu không phải bạn thực hiện — liên hệ admin ngay.'
          : 'Đã đổi mật khẩu lúc ' + C.vnStr() + '. Nếu không phải bạn thực hiện — liên hệ admin ngay.');
        return {out: {ok:true, msg:'✅ Đã đổi mật khẩu thành công.' + (killed > 0 ? ' Đã đăng xuất ' + killed + ' phiên đăng nhập khác.' : ''), killedSessions: killed}};
      }
      /* MỤC 8 (24/11/2026): ảnh đại diện THẬT — server kiểm tra loại file thật (magic bytes),
         chỉ nhận PNG/JPG/WebP ≤ 2MB, kích thước đúng 256×256 (trình duyệt đã cắt vuông trước khi gửi) */
      if(act === 'avatar-upload'){
        if(!C.rateHit('avatar:' + me.id, 20, 3600 * 1000)) return {out: {ok:false, msg:'Đổi ảnh quá nhiều lần trong 1 giờ — thử lại sau.'}};
        let buf;
        try{ buf = Buffer.from(String(body.fileB64 || ''), 'base64'); }catch(e){ return {out: {ok:false, msg:'Dữ liệu ảnh không hợp lệ.'}}; }
        if(!buf.length) return {out: {ok:false, msg:'Chưa chọn ảnh.'}};
        if(buf.length > 2 * 1024 * 1024) return {out: {ok:false, msg:'Ảnh vượt 2MB — hãy chọn ảnh nhỏ hơn.'}};
        const sn = C.sniffImage(buf);
        if(!sn.ok) return {out: {ok:false, msg: sn.why || 'File không phải ảnh PNG/JPG/WebP.'}};
        if(sn.w !== 256 || sn.h !== 256) return {out: {ok:false, msg:'Ảnh phải đúng 256×256 (trang đã tự cắt vuông — thử lại).'}};
        const file = await C.putFile('avatar-' + me.id, 'avatar-' + sn.kind + '.' + sn.kind, buf, sn.kind === 'png' ? 'image/png' : (sn.kind === 'jpg' ? 'image/jpeg' : 'image/webp'));
        if(me.avatarKey) await C.blobDelete(me.avatarKey);
        me.avatar = file.fileUrl; me.avatarKey = file.fileKey; me.avatarAt = C.vnStr();
        return {out: {ok:true, msg:'✅ Đã cập nhật ảnh đại diện (PNG/JPG/WebP 256×256, lưu trên server).', avatar: me.avatar}};
      }
      if(act === 'avatar-del'){
        if(me.avatarKey) await C.blobDelete(me.avatarKey);
        me.avatar = ''; me.avatarKey = null; me.avatarAt = null;
        return {out: {ok:true, msg:'🗑 Đã xóa ảnh đại diện — về mặc định.'}};
      }
      if(act === 'email'){
        const email = C.cleanStr(body.email, 80);
        if(email && (st.users || []).some(u => u.id !== me.id && (u.email || '').toLowerCase() === email.toLowerCase()))
          return {out: {ok:false, msg:'Email đã được dùng cho tài khoản khác.'}};
        me.email = email;
        return {out: {ok:true, msg:'Đã cập nhật email.', email}};
      }
      if(act === 'profile'){
        me.displayName = C.cleanStr(body.displayName, 40);
        if(body.avatar !== undefined && !/^https:/.test(String(body.avatar || ''))) me.avatar = C.cleanStr(body.avatar, 8);   /* emoji — không cho ghi đè URL ảnh qua form này */
        return {out: {ok:true, msg:'Đã lưu hồ sơ cá nhân.', displayName: me.displayName, avatar: me.avatar}};
      }
      if(act === '2fa-start'){
        if(!me.twoFAPending) me.twoFAPending = C.genSecret32();
        return {out: {ok:true, secret: me.twoFAPending, otpauth: 'otpauth://totp/DauLa:' + me.username + '?secret=' + me.twoFAPending + '&issuer=DauLaDaiLuc'}};
      }
      if(act === '2fa-on'){
        const secret = me.twoFAPending;
        if(!secret) return {out: {ok:false, msg:'Chưa khởi tạo secret 2FA.'}};
        if(!C.verify2fa(secret, C.cleanStr(body.code, 8))) return {out: {ok:false, msg:'Mã 6 số không đúng — kiểm tra lại app authenticator.'}};
        me.twoFA = {enabled: true, secret};
        me.twoFAPending = null;
        return {out: {ok:true, msg:'Đã bật 2FA cho tài khoản.'}};
      }
      if(act === '2fa-off'){
        if(!me.twoFA || !me.twoFA.enabled) return {out: {ok:false, msg:'2FA đang tắt.'}};
        if(!C.verify2fa(me.twoFA.secret, C.cleanStr(body.code, 8))) return {out: {ok:false, msg:'Mã 6 số không đúng.'}};
        me.twoFA = {enabled: false, secret: ''};
        return {out: {ok:true, msg:'Đã tắt 2FA.'}};
      }
      if(act === 'points-redeem'){
        if((me.points || 0) < 500) return {out: {ok:false, msg:'Cần tối thiểu 500 điểm.'}};
        me.points -= 500;
        const code = 'DIEM-' + crypto2(5);
        (me.pointLog = me.pointLog || []).unshift({at: C.vnDate(), delta: -500, why: 'Đổi lấy mã giảm giá ' + code});
        st.coupons.unshift({code, percent: 10, maxUses: 1, used: 0, expires: new Date(Date.now() + 365*86400000).toISOString().slice(0,10), active: true, fromPoints: me.id});
        return {out: {ok:true, msg:'Đổi thành công! Mã giảm 10%: ' + code, code}};
      }
      return {out: {ok:false, msg:'Hành động không hợp lệ.'}};
    });
    return C.json(res, 200, out);
  }catch(e){
    return C.fail(res, 500, 'Lỗi server: ' + e.message);
  }
};

function pruneSessions(st){
  const now = C.nowMs();
  for(const k of Object.keys(st.sessions || {})) if(st.sessions[k].exp < now) delete st.sessions[k];
  if(Object.keys(st.sessions).length > 500){
    const keys = Object.keys(st.sessions).slice(0, 250);
    const keep = {};
    for(const k of keys) keep[k] = st.sessions[k];
    st.sessions = keep;
  }
}
function crypto2(n){ return require('crypto').randomBytes(3).toString('hex').toUpperCase().slice(0, n); }
function readBody(req, max){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if(size > max){ reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }catch(e){ resolve({}); } });
    req.on('error', reject);
  });
}
module.exports.readBody = readBody;
