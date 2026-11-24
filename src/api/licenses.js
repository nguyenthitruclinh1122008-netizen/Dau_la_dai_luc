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
      /* LỆNH 24/11/2026: tra cứu phải nhận CẢ tiền tố cũ lẫn mới —
         · VIP: DL-... (không đổi)
         · FREE mới: DF-XXXX-XXXX (VD DF-A1B2-C3D9)
         · FREE cũ (v2 ban đầu): DF-FREE-0001 — vẫn tra được
         · FREE cũ nhất (web chính v1): FREE-XXXX-XXXX-XXXX — regex chấp nhận, nếu không có trong DB v2
           thì báo rõ key này thuộc web chính + hướng dẫn tra cứu tại web chính (KHÔNG đụng dữ liệu web chính) */
      if(!/^(DL|DF|FREE)-[A-Z0-9][A-Z0-9.-]{5,48}$/.test(key)){
        return C.json(res, 200, {ok:false, found:false, msg:'Định dạng key không hợp lệ — VIP bắt đầu bằng DL- (VD: DL-VIP-9F2K-8817), bản FREE bắt đầu bằng DF- (VD: DF-A1B2-C3D9) hoặc FREE- (key cũ web chính).'});
      }
      const st = await C.getState();
      const lic = (st.licenses || []).find(l => l.key === key);
      if(!lic){
        if(key.startsWith('FREE-')){
          return C.json(res, 200, {ok:true, found:false, otherSystem:true,
            msg:'Key "FREE-" là key cũ của WEB CHÍNH (hệ thống v1) — không nằm trong dữ liệu web v2 này. Key cũ vẫn còn hiệu lực như trước, không bị ảnh hưởng. Để tra trạng thái chính xác, tra cứu tại web chính: dau-la-dai-luc-livid.vercel.app/kiem-tra.'});
        }
        return C.json(res, 200, {ok:true, found:false, msg:'Không tìm thấy key này trong hệ thống (kiểm tra lại chính tả — VIP dạng DL-VIP-9F2K-8817, FREE dạng DF-A1B2-C3D9).'});
      }
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
