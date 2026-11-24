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
        const pl = (st.plugins || []).find(p => p.id === 'PL-MAIN');
        if(!pl || !pl.fileUrl) return C.json(res, 404, {ok:false, msg:'File Plugin VIP chưa sẵn sàng — liên hệ admin.'});
        target = {fileUrl: pl.fileUrl, fileName: pl.fileName || 'DauLaDaiLuc-Plugin-VIP-latest.zip', purchaseId: null};
      }
      else if(q.f === 'free'){
        /* Plugin bản FREE (file mới nhất) — cần key bản FREE (DF-) của chính tài khoản; mọi tài khoản đăng ký đều được cấp DF */
        if(!C.isFreeKey(lic.key)) return C.json(res, 403, {ok:false, msg:'File bản FREE tải bằng KEY FREE (DF-) của bạn — check email thông báo hoặc trang "Tải file".'});
        const pl = (st.plugins || []).find(p => p.id === 'PL-FREE');
        const url = (pl && pl.fileUrl) || O.FREE_PLUGIN_URL;
        const name = (pl && pl.fileName) || 'DauLaDaiLuc-Free-latest.jar';
        target = {fileUrl: url, fileName: name, purchaseId: null};
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

    /* proxy file từ Blob — URL file KHÔNG bao giờ lộ ra client (fetch có timeout 30s) */
    const r = await C.fetchT(target.fileUrl, undefined, 30000);
    if(!r.ok) return C.fail(res, 502, 'File nguồn lỗi (' + r.status + ').');
    const buf = Buffer.from(await r.arrayBuffer());
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
      'Cache-Control': 'no-store'
    });
    return res.end(buf);
  }catch(e){
    return C.fail(res, 500, 'Lỗi tải file: ' + e.message);
  }
};
