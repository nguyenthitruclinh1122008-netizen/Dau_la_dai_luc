/* /api/notify — thông báo của người dùng (đánh dấu đã đọc) */
'use strict';
const C = require('./_lib/core.js');
const A = require('./_lib/api.js');

module.exports = async (req, res) => {
  if(req.method !== 'POST') return C.fail(res, 405, 'Chỉ hỗ trợ POST.');
  let body;
  try{ body = await require('./auth.js').readBody(req, 20000); }catch(e){ return C.fail(res, 400, 'Body không hợp lệ.'); }
  try{
    const out = await C.withState(async st => {
      const me = A.getAuth(req, st);
      if(!me) return {out: {ok:false, auth:true, msg:'Bạn chưa đăng nhập.'}};
      me.readNotifs = me.readNotifs || [];
      if(body.act === 'readall'){
        for(const n of (st.notifications || [])) if(n.to === 'all' || n.to === me.id){
          if(!me.readNotifs.includes(n.id)) me.readNotifs.push(n.id);
        }
        return {out: {ok:true, msg:'Đã đọc tất cả thông báo.'}};
      }
      const n = (st.notifications || []).find(x => x.id === body.id);
      if(!n) return {out: {ok:false, msg:'Không tìm thấy thông báo.'}};
      if(!me.readNotifs.includes(n.id)) me.readNotifs.push(n.id);
      return {out: {ok:true, msg:'Đã đánh dấu đã đọc.'}};
    });
    return C.json(res, 200, out.out || out);
  }catch(e){
    return C.fail(res, 500, 'Lỗi server: ' + e.message);
  }
};
