/* /api/gate — cổng quản trị 2 lớp (mã 6 số + mật khẩu quản trị) → cấp admin ticket */
'use strict';
const C = require('./_lib/core.js');
const A = require('./_lib/api.js');

module.exports = async (req, res) => {
  if(req.method !== 'POST') return C.fail(res, 405, 'Chỉ hỗ trợ POST.');
  let body;
  try{ body = await require('./auth.js').readBody(req, 10000); }catch(e){ return C.fail(res, 400, 'Body không hợp lệ.'); }
  if(!C.rateHit('gate:' + C.ipOf(req), 6, 10*60*1000)) return C.fail(res, 429, 'Thử quá nhiều lần — chờ 10 phút.');
  try{
    const out = await C.withState(async st => {
      const me = A.getAuth(req, st);
      if(!me) return {out: {ok:false, auth:true, msg:'Bạn chưa đăng nhập.'}};
      if(me.role !== 'admin') return {out: {ok:false, msg:'Tài khoản của bạn không có quyền quản trị.'}};
      const g = (st.settings || {}).adminGate || {};
      if(String(body.code || '').trim() !== String(g.code || '') || String(body.pass || '') !== String(g.password || ''))
        return {out: {ok:false, msg:'Sai mã 6 chữ số hoặc mật khẩu quản trị.'}};
      return {out: {ok:true, ticket: C.adminTicket(me.id), username: me.username}};
    });
    return C.json(res, 200, out);
  }catch(e){
    return C.fail(res, 500, 'Lỗi server: ' + e.message);
  }
};
