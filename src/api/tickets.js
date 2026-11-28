/* /api/tickets — ticket + chat hỗ trợ (polling) */
'use strict';
const C = require('./_lib/core.js');
const A = require('./_lib/api.js');

module.exports = async (req, res) => {
  let body = {};
  if(req.method === 'POST'){
    try{ body = await require('./auth.js').readBody(req, 100000); }catch(e){ return C.fail(res, 400, 'Body không hợp lệ.'); }
  }
  const act = body.act || C.qOf(req).act || '';
  try{
    if(act === 'create'){
      const out = await C.withState(async st => {
        const me = A.getAuth(req, st);
        if(!me) return {out: {ok:false, auth:true, msg:'Bạn cần đăng nhập để gửi hỗ trợ.'}};
        if(!C.rateHit('ticket:' + me.id, 6, 60*60*1000)) return {out: {ok:false, msg:'Bạn gửi quá nhiều ticket — thử lại sau.'}};
        const subject = C.cleanStr(body.subject, 100);
        const text = C.cleanStr(body.body, 2000);
        const type = C.cleanStr(body.type, 24) || 'Hỗ trợ';
        if(subject.length < 4 || text.length < 5) return {out: {ok:false, msg:'Chủ đề và nội dung cần đủ chi tiết.'}};
        const t = {id: C.uid('TK'), userId: me.id, subject, type, status:'Chờ admin', createdAt: C.vnStr(), body: text, replies: []};
        (st.tickets = st.tickets || []).unshift(t);
        O_notifyAdmins(st, 'Ticket mới ' + t.id + ' — ' + me.username, subject + ' (' + type + ')');
        return {out: {ok:true, msg:'Đã gửi ticket ' + t.id + ' — admin sẽ trả lời sớm.', id: t.id}};
      });
      return C.json(res, 200, out.out || out);
    }
    if(act === 'reply'){
      const out = await C.withState(async st => {
        const me = A.getAuth(req, st);
        if(!me) return {out: {ok:false, auth:true}};
        const t = (st.tickets || []).find(x => x.id === body.id && x.userId === me.id);
        if(!t) return {out: {ok:false, msg:'Không tìm thấy ticket.'}};
        if(t.status === 'Đã đóng') return {out: {ok:false, msg:'Ticket đã đóng — tạo ticket mới nếu cần hỗ trợ thêm.'}};
        const text = C.cleanStr(body.body, 1000);
        if(!text) return {out: {ok:false, msg:'Nội dung trống.'}};
        t.replies.push({by:'user', at: C.vnStr(), body: text});
        t.status = 'Chờ admin';
        O_notifyAdmins(st, 'Khách trả lời ticket ' + t.id, me.username + ': ' + text.slice(0, 80));
        return {out: {ok:true, msg:'Đã gửi.'}};
      });
      return C.json(res, 200, out.out || out);
    }
    if(act === 'close'){
      const out = await C.withState(async st => {
        const me = A.getAuth(req, st);
        if(!me) return {out: {ok:false, auth:true}};
        const t = (st.tickets || []).find(x => x.id === body.id && x.userId === me.id);
        if(!t) return {out: {ok:false, msg:'Không tìm thấy ticket.'}};
        t.status = 'Đã đóng';
        t.replies.push({by:'user', at: C.vnStr(), body:'(khách đã đóng ticket)'});
        return {out: {ok:true, msg:'Đã đóng ticket ' + t.id + '.'}};
      });
      return C.json(res, 200, out.out || out);
    }
    return C.fail(res, 400, 'Hành động không hợp lệ.');
  }catch(e){
    return C.fail(res, 500, 'Lỗi server: ' + e.message);
  }
};

function O_notifyAdmins(st, title, body){
  for(const u of (st.users || [])){
    if(u.role === 'admin' && !u.banned){
      st.notifications.unshift({id: C.uid('n'), to: u.id, type:'ticket', title: String(title).slice(0,120), body: String(body).slice(0,300), date: C.vnDate(), at: C.vnStr(), by:'server'});
    }
  }
}
