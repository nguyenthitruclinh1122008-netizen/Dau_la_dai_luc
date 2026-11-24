/* /api/file — phục vụ FILE CÔNG KHAI từ kho Postgres (schema v2beta).
   25/11/2026: WHITELIST CHỈ ảnh đại diện (prefix files/avatar-). Mọi đường dẫn khác
   (files/jar-*, files/PL-*, tmp/*…) bị TỪ CHƠI — file trả phí chỉ tải qua /api/download
   có kiểm tra license tại server. */
'use strict';
const C = require('./_lib/core.js');

const ALLOWED_PREFIX = 'files/avatar-';

module.exports = async (req, res) => {
  try{
    if(req.method !== 'GET' && req.method !== 'HEAD') return C.fail(res, 405, 'Chỉ hỗ trợ GET.');
    if(C.DRIVER !== 'postgres') return C.fail(res, 404, 'Không có kho file nội bộ.');
    const p = C.cleanStr(C.qOf(req).p, 300);
    if(!p) return C.fail(res, 400, 'Thiếu tham số file.');
    let decoded = p;
    try{ decoded = decodeURIComponent(p); }catch(e){}
    if(decoded.indexOf(ALLOWED_PREFIX) !== 0 || decoded.includes('..')) return C.fail(res, 403, 'Loại file này không mở công khai.');
    let buf;
    try{ buf = await C.blobGetRaw(decoded, 15000); }
    catch(e){ return C.fail(res, 404, 'Không tìm thấy file.'); }
    if(!buf || !buf.length) return C.fail(res, 404, 'File rỗng.');
    /* mime theo đuôi đã kiểm magic bytes khi upload (png/jpg/webp) */
    const kind = /\.png$/i.test(decoded) ? 'image/png' : (/\.jpe?g$/i.test(decoded) ? 'image/jpeg' : (/\.webp$/i.test(decoded) ? 'image/webp' : 'application/octet-stream'));
    res.writeHead(200, {
      'Content-Type': kind,
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(req.method === 'HEAD' ? undefined : buf);
  }catch(e){
    return C.fail(res, 500, 'Lỗi đọc file: ' + e.message);
  }
};
