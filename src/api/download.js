/* /api/download — tải file: CHỈ khi đã thanh toán/được cấp quyền (purchase hoặc license hợp lệ) */
'use strict';
const C = require('./_lib/core.js');
const A = require('./_lib/api.js');

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
    /* 2) tải resource pack theo license (U3 cũ) */
    else if(q.lic && q.f){
      const lic = (st.licenses || []).find(l => l.key === q.lic && l.userId === me.id);
      if(!lic) return C.json(res, 404, {ok:false, msg:'License không tồn tại hoặc không phải của bạn.'});
      const expOk = !lic.expires || new Date(lic.expires + 'T23:59:59+07:00').getTime() >= Date.now();
      if(!expOk) return C.json(res, 404, {ok:false, msg:'License đã hết hạn — gia hạn để tải tiếp.'});
      const map = {'rp-full': 'PL-MAIN', 'rp-free': 'PL-RPFREE', 'add-on': 'PL-LAMDIEN'};
      const pl = (st.plugins || []).find(p => p.id === map[q.f]);
      if(!pl || !pl.fileUrl) return C.json(res, 404, {ok:false, msg:'File chưa sẵn sàng — liên hệ admin.'});
      target = {fileUrl: pl.fileUrl, fileName: pl.fileName || (q.f + '.zip'), purchaseId: null};
    }
    else return C.json(res, 400, {ok:false, msg:'Tham số tải không hợp lệ.'});

    /* proxy file từ Blob — URL file KHÔNG bao giờ lộ ra client */
    const r = await fetch(target.fileUrl);
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
