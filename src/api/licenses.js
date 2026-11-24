/* /api/licenses — TRA CỨU LICENSE KEY công khai: ai giữ đúng key mới xem được trạng thái.
   KHÔNG trả username/chủ key, KHÔNG trả key đầy đủ — chỉ trạng thái + số server đang dùng. */
'use strict';
const C = require('./_lib/core.js');
const O = require('./_lib/ops.js');

function maskKey(key){
  const segs = String(key).split('-');
  if(segs.length < 3) return key.slice(0, 3) + '-****';
  const last = segs[segs.length - 1];
  return segs[0] + '-' + segs[1] + '-****-' + last;
}

module.exports = async (req, res) => {
  let body = {};
  if(req.method === 'POST'){
    try{ body = await require('./auth.js').readBody(req, 4000); }catch(e){ return C.fail(res, 400, 'Body không hợp lệ.'); }
  }
  const act = body.act || C.qOf(req).act || '';
  try{
    if(act === 'lookup'){
      const key = String(body.key || '').trim().toUpperCase().replace(/\s+/g, '');
      /* key bản VIP: DL-XXXX-XXXX (DL-VIP-9F2K-8817) · key bản FREE: DF-XXXX-XXXX (DF-FREE-0001, DF-A1B2-4837) */
      if(!/^(DL|DF)-[A-Z0-9][A-Z0-9-]{5,40}$/.test(key)){
        return C.json(res, 200, {ok:false, found:false, msg:'Định dạng key không hợp lệ — VIP bắt đầu bằng DL- (VD: DL-VIP-9F2K-8817), bản FREE bắt đầu bằng DF- (VD: DF-A1B2-4837).'});
      }
      const st = await C.getState();
      const lic = (st.licenses || []).find(l => l.key === key);
      if(!lic) return C.json(res, 200, {ok:true, found:false, msg:'Không tìm thấy key này trong hệ thống (kiểm tra lại chính tả — VIP dạng DL-VIP-9F2K-8817, FREE dạng DF-A1B2-4837).'});
      const valid = !lic.expires || new Date(lic.expires + 'T23:59:59+07:00').getTime() >= Date.now();
      const daysLeft = lic.expires ? Math.ceil((new Date(lic.expires + 'T23:59:59+07:00').getTime() - Date.now()) / 86400000) : null;
      return C.json(res, 200, {
        ok: true,
        found: true,
        key: maskKey(lic.key),
        package: lic.package,
        expires: lic.expires || null,
        daysLeft,
        status: valid ? (lic.expires ? (daysLeft <= 14 ? 'Còn hạn — sắp hết hạn' : 'Còn hạn') : 'Vĩnh viễn') : 'Hết hạn',
        valid,
        servers: (lic.servers || []).length,
        maxServers: lic.maxServers || 0,
        assigned: !!lic.userId
      });
    }
    return C.fail(res, 400, 'Hành động không hợp lệ.');
  }catch(e){
    return C.fail(res, 500, 'Lỗi tra cứu: ' + e.message);
  }
};
