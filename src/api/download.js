/* /api/download — tải file: CHỈ khi đã thanh toán/được cấp quyền (purchase hoặc license hợp lệ) */
'use strict';
const C = require('./_lib/core.js');
const A = require('./_lib/api.js');
const O = require('./_lib/ops.js');

module.exports = async (req, res) => {
  try{
    const q = C.qOf(req);
    const st = await C.getState();
    const me = A.getAuth(req, st);
    if(!me) return C.json(res, 401, {ok:false, auth:true, msg:'Bạn cần đăng nhập để tải file.'});
    let target = null;
    /* 1) tải theo purchase (Plugin đã mua) */
    if(q.pv){
      const pv = (st.purchases || []).find(p => p.id === q.pv && p.userId === me.id);
      if(!pv) return C.json(res, 404, {ok:false, msg:'Không tìm thấy quyền tải này (chỉ tải được Plugin bạn đã mua).'});
      const pl = (st.plugins || []).find(p => p.id === pv.pluginId);
      if(!pl) return C.json(res, 404, {ok:false, msg:'Plugin không còn tồn tại.'});
      if(!pl.fileUrl) return C.json(res, 404, {ok:false, msg:'Admin chưa upload file cho Plugin này — thử lại sau.'});
      target = {fileUrl: pl.fileUrl, fileName: pl.fileName || (pl.slug + '.zip'), purchaseId: pv.id};
    }
    /* 2) tải theo license — 24/11/2026 mô hình mới: VIP chỉ 1 mục (f=vip), FREE chỉ 1 mục (f=free) */
    else if(q.lic && q.f){
      const lic = (st.licenses || []).find(l => l.key === q.lic && l.userId === me.id);
      if(!lic) return C.json(res, 404, {ok:false, msg:'License không tồn tại hoặc không phải của bạn.'});
      if(lic.revoked) return C.json(res, 404, {ok:false, msg:'License đã bị thu hồi (tài khoản đã chuyển về bản FREE) — dùng key bản FREE (DF-) để tải, hoặc liên hệ admin.'});
      const expOk = C.licActive(lic);
      if(!expOk) return C.json(res, 404, {ok:false, msg:'License đã hết hạn — gia hạn để tải tiếp.'});
      if(q.f === 'vip'){
        /* Plugin bản VIP (file mới nhất) — CHỈ license VIP (DL-) còn hạn; key bản FREE bị từ chối tại SERVER */
        if(!C.isVipKey(lic.key)) return C.json(res, 403, {ok:false, msg:'Key này không phải license VIP (DL-) — file VIP chỉ tải bằng license VIP còn hạn.'});
        /* MỤC 7: ưu tiên bản jar VIP MỚI NHẤT admin upload (jarReleases) —fallback theo Plugin PL-MAIN */
        const rel = (st.jarReleases || []).find(r => r.pkg === 'vip' && r.latest);
        const pl = (st.plugins || []).find(p => p.id === 'PL-MAIN');
        const url = (rel && rel.fileUrl) || (pl && pl.fileUrl);
        const name = (rel && rel.fileName) || (pl && pl.fileName) || 'DauLaDaiLuc-VIP-latest.jar';
        if(!url) return C.json(res, 404, {ok:false, msg:'File Plugin VIP chưa sẵn sàng — liên hệ admin.'});
        target = {fileUrl: url, fileName: name, purchaseId: null, rel};
      }
      else if(q.f === 'free'){
        /* Plugin bản FREE (file mới nhất) — cần key bản FREE (DF-) của chính tài khoản; mọi tài khoản đăng ký đều được cấp DF */
        if(!C.isFreeKey(lic.key) && !/^FREE-/.test(lic.key)) return C.json(res, 403, {ok:false, msg:'File bản FREE tải bằng KEY FREE (DF-) của bạn — check email thông báo hoặc trang "Tải file".'});
        /* MỤC 7: ưu tiên bản jar FREE MỚI NHẤT admin upload — fallback Plugin PL-FREE / site chính */
        const rel = (st.jarReleases || []).find(r => r.pkg === 'free' && r.latest);
        const pl = (st.plugins || []).find(p => p.id === 'PL-FREE');
        const url = (rel && rel.fileUrl) || (pl && pl.fileUrl) || O.FREE_PLUGIN_URL;
        const name = (rel && rel.fileName) || (pl && pl.fileName) || 'DauLaDaiLuc-Free-latest.jar';
        target = {fileUrl: url, fileName: name, purchaseId: null, rel};
      }
      else{
        /* link cũ (rp-full/add-on/rp-free) giữ hoạt động theo quyền tương ứng */
        const map = {'rp-full': 'PL-MAIN', 'rp-free': 'PL-RPFREE', 'add-on': 'PL-LAMDIEN'};
        if(q.f === 'rp-full' && !C.isVipKey(lic.key)) return C.json(res, 403, {ok:false, msg:'Plugin FULL chỉ tải bằng license VIP (DL-) còn hạn.'});
        const pl = (st.plugins || []).find(p => p.id === map[q.f]);
        if(!pl || !pl.fileUrl) return C.json(res, 404, {ok:false, msg:'File chưa sẵn sàng — liên hệ admin.'});
        target = {fileUrl: pl.fileUrl, fileName: pl.fileName || (q.f + '.zip'), purchaseId: null};
      }
    }
    else return C.json(res, 400, {ok:false, msg:'Tham số tải không hợp lệ.'});

    /* proxy file từ kho — URL file KHÔNG bao giờ lộ ra client.
       25/11/2026: URL nội bộ '/api/file?p=…' (kho Postgres v2beta) đọc thẳng từ DB;
       URL http (Blob công khai) fetch như cũ (timeout 30s) */
    let buf;
    if(String(target.fileUrl).indexOf('/') === 0){
      try{ buf = await C.blobGetRaw(target.fileUrl, 60000); }
      catch(e){ return C.fail(res, 502, 'File nguồn lỗi: ' + e.message); }
    }else{
      const r = await C.fetchT(target.fileUrl, undefined, 30000);
      if(!r.ok) return C.fail(res, 502, 'File nguồn lỗi (' + r.status + ').');
      buf = Buffer.from(await r.arrayBuffer());
    }
    if(target.purchaseId){
      await C.withState(st2 => {
        const pv = (st2.purchases || []).find(p => p.id === target.purchaseId);
        if(pv) pv.downloads = (pv.downloads || 0) + 1;
      });
    }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="' + (target.fileName || 'file.zip') + '"',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
      /* MỤC 7: khách đối chiếu được bản tải về (kèm SHA-256 hiển thị trên trang Tải file) */
      'X-Plugin-Version': (target.rel && target.rel.version) || '',
      'X-Plugin-Sha256': (target.rel && target.rel.sha256) || ''
    });
    return res.end(buf);
  }catch(e){
    return C.fail(res, 500, 'Lỗi tải file: ' + e.message);
  }
};
