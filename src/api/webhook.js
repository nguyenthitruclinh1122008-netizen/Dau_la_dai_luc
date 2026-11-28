/* /api/webhook — webhook tự động xác minh thanh toán
   1) ?key=<BANK_WEBHOOK_SECRET> body {content, amount} — từ dịch vụ đọc thông báo ngân hàng (Casso, app automation...)
   2) ?key=<CARD_GATEWAY_SECRET>&type=card body theo cổng thẻ cào gọi lại */
'use strict';
const C = require('./_lib/core.js');
const O = require('./_lib/ops.js');

module.exports = async (req, res) => {
  if(req.method !== 'POST') return C.fail(res, 405, 'Chỉ hỗ trợ POST.');
  let body;
  try{ body = await require('./auth.js').readBody(req, 100000); }catch(e){ return C.fail(res, 400, 'Body không hợp lệ.'); }
  const q = C.qOf(req);
  try{
    /* ---- webhook ngân hàng: khớp nội dung chuyển khoản -> tự xác nhận ---- */
    if(q.key && q.key === (process.env.BANK_WEBHOOK_SECRET || '')){
      const content = C.cleanStr(body.content || body.description || body.addInfo || body.memo, 80);
      const amount = C.clampInt(body.amount || body.creditAmount || body.value, 0, 10000000000, 0);
      if(!content || !amount) return C.fail(res, 400, 'Thiếu content/amount.');
      const result = await C.withState(st => {
        const target = O.findPendingByContent(st, content);
        if(!target) return {out: {ok:false, msg:'Không tìm thấy yêu cầu thanh toán nào khớp nội dung: ' + content}};
        const conf = O.confirmPayment(st, target, amount, 'webhook', content);
        return {out: conf};
      });
      return C.json(res, 200, result.out || result);
    }
    /* ---- callback cổng thẻ cào (nếu cổng hỗ trợ gọi lại) ---- */
    if(q.type === 'card' && q.key && q.key === (process.env.CARD_GATEWAY_SECRET || '')){
      const out = await C.withState(async st => {
        const dep = (st.deposits || []).find(d => d.id === C.cleanStr(body.request_id || body.depositId, 24) && d.kind === 'card');
        if(!dep) return {out: {ok:false, msg:'Không tìm thấy giao dịch nạp thẻ.'}};
        if(dep.status === 'Thành công') return {out: {ok:true, msg:'Đã xử lý trước đó.'}};
        const success = body.status === 1 || body.success === true || body.code === 0;
        if(!success){
          dep.status = 'Thất bại';
          dep.gatewayMsg = C.cleanStr(body.message, 200);
          return {out: {ok:false, msg:'Cổng báo thẻ thất bại: ' + dep.gatewayMsg}};
        }
        dep.status = 'Thành công';
        dep.confirmedAt = C.vnStr();
        dep.confirmedBy = 'cổng thẻ cào (callback)';
        const user = (st.users || []).find(u => u.id === dep.userId);
        if(!user) return {out: {ok:false, msg:'Không tìm thấy user.'}};
        const tx = O.walletAdd(st, user, dep.credit, 'deposit', 'Nạp thẻ ' + dep.carrier + ' (callback cổng)', dep.id);
        dep.balanceAfter = tx.balanceAfter;
        O.notify(st, user.id, 'deposit', 'Nạp thẻ thành công +' + dep.credit.toLocaleString('vi-VN') + 'đ', 'Số dư mới: ' + tx.balanceAfter.toLocaleString('vi-VN') + 'đ.');
        return {out: {ok:true, msg:'Đã cộng tiền.'}};
      });
      return C.json(res, 200, result.out || result);
    }
    return C.fail(res, 401, 'Webhook key không hợp lệ.');
  }catch(e){
    return C.fail(res, 500, 'Lỗi webhook: ' + e.message);
  }
};
