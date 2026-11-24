/* /api/review — đánh giá + nhận xét Plugin (chỉ user đã đăng nhập; chỉ mua mới được đánh giá nếu yêu cầu) */
'use strict';
const C = require('./_lib/core.js');
const A = require('./_lib/api.js');

module.exports = async (req, res) => {
  if(req.method !== 'POST') return C.fail(res, 405, 'Chỉ hỗ trợ POST.');
  let body;
  try{ body = await require('./auth.js').readBody(req, 30000); }catch(e){ return C.fail(res, 400, 'Body không hợp lệ.'); }
  try{
    const out = await C.withState(async st => {
      const me = A.getAuth(req, st);
      if(!me) return {out: {ok:false, auth:true, msg:'Bạn cần đăng nhập để đánh giá.'}};
      if(me.banned) return {out: {ok:false, msg:'Tài khoản đã bị khóa.'}};
      const pluginId = C.cleanStr(body.pluginId, 24);
      const pl = (st.plugins || []).find(p => p.id === pluginId);
      if(!pl) return {out: {ok:false, msg:'Plugin không tồn tại.'}};
      const rating = C.clampInt(body.rating, 1, 5, 0);
      if(!rating) return {out: {ok:false, msg:'Chọn số sao (1–5).'}};
      const comment = C.cleanStr(body.comment, 500);
      if(comment.length < 4) return {out: {ok:false, msg:'Nội dung nhận xét cần cụ thể hơn.'}};
      if(!C.rateHit('review:' + me.id, 8, 60*60*1000)) return {out: {ok:false, msg:'Bạn đánh giá quá nhiều — thử lại sau.'}};
      const rv = {id: C.uid('RV'), pluginId, userId: me.id, username: me.username, rating, comment, status:'visible', createdAt: C.vnStr(), reply: ''};
      (st.reviews = st.reviews || []).unshift(rv);
      return {out: {ok:true, msg:'Cảm ơn bạn đã đánh giá ' + pl.name + '!', review: rv}};
    });
    return C.json(res, 200, out.out || out);
  }catch(e){
    return C.fail(res, 500, 'Lỗi server: ' + e.message);
  }
};
