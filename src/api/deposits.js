/* /api/deposits — nạp tiền: QR ngân hàng theo yêu cầu + thẻ cào qua cổng thật/manual, ví tiền */
'use strict';
const C = require('./_lib/core.js');
const A = require('./_lib/api.js');
const O = require('./_lib/ops.js');

module.exports = async (req, res) => {
  let body = {};
  if(req.method === 'POST'){
    try{ body = await require('./auth.js').readBody(req, 200000); }catch(e){ return C.fail(res, 400, 'Body không hợp lệ.'); }
  }
  const act = body.act || C.qOf(req).act || '';
  try{
    if(act === 'bank'){
      const out = await C.withState(async st => {
        const me = A.getAuth(req, st);
        if(!me) return {out: {ok:false, auth:true, msg:'Bạn cần đăng nhập để nạp tiền.'}};
        const amount = C.clampInt(body.amount, 10000, 100000000, 0);
        if(amount < 10000 || amount % 1000 !== 0) return {out: {ok:false, msg:'Số tiền nạp tối thiểu 10.000đ và phải là bội số của 1.000đ.'}};
        const id = C.uid('NT');
        const content = ('NAP ' + me.username + ' ' + id.split('-')[1]).toUpperCase();
        const dep = {id, userId: me.id, user: me.username, kind:'bank', amount, credit: amount, rate: 0,
          paymentContent: content, status:'Chờ chuyển khoản', createdAt: C.vnStr(), at: C.vnStr(), orderId: C.cleanStr(body.orderId, 24) || null};
        (st.deposits = st.deposits || []).unshift(dep);
        const bank = (st.settings || {}).bank || {};
        return {out: {ok:true, deposit: dep, qrPayload: O.napasQR(bank, amount, content),
          bank: {bin: bank.bin, account: bank.account, name: bank.name, shortName: bank.shortName}}};
      });
      return C.json(res, 200, out.out || out);
    }
    if(act === 'card'){
      const out = await C.withState(async st => {
        const me = A.getAuth(req, st);
        if(!me) return {out: {ok:false, auth:true, msg:'Bạn cần đăng nhập để nạp tiền.'}};
        if(me.banned) return {out: {ok:false, msg:'Tài khoản đã bị khóa.'}};
        const carrier = C.cleanStr(body.carrier, 20);
        if(!O.CARRIERS.includes(carrier)) return {out: {ok:false, msg:'Chọn nhà mạng hợp lệ.'}};
        const denom = C.clampInt(body.denom, 10000, 1000000, 0);
        if(!O.DENOMS.includes(denom)) return {out: {ok:false, msg:'Mệnh giá không hợp lệ.'}};
        const serial = C.cleanStr(body.serial, 20).toUpperCase();
        const code = C.cleanStr(body.code || body.pin, 20).toUpperCase();
        if(!/^[A-Z0-9]{8,16}$/.test(serial)) return {out: {ok:false, msg:'Serial không đúng định dạng (8–16 chữ/số).'}};
        if(!/^[A-Z0-9]{4,14}$/.test(code)) return {out: {ok:false, msg:'Mã PIN không đúng định dạng (4–14 chữ/số).'}};
        if((st.deposits || []).some(d => d.serial === serial && d.code === code && d.status !== 'Thất bại'))
          return {out: {ok:false, msg:'Thẻ này đã được gửi nạp trước đó.'}};
        const rates = (st.settings || {}).topupRates || {global: 20, carriers: {}};
        const ov = (rates.carriers || {})[carrier.toLowerCase()];
        const rate = (ov === 0 || ov) ? ov : (rates.global || 0);
        const credit = Math.round(denom * (100 - rate) / 100);
        const id = C.uid('NT');
        const gw = await O.cardGatewayCheck(carrier, denom, serial, code);
        const dep = {id, userId: me.id, user: me.username, kind:'card', carrier, denom, rate, credit, serial, code: mask(code),
          status: gw.status === 'success' ? 'Thành công' : (gw.status === 'failed' ? 'Thất bại' : 'Chờ duyệt'),
          gateway: gw.mode, gatewayRef: gw.ref || '', gatewayMsg: gw.msg || '',
          orderId: C.cleanStr(body.orderId, 24) || null,
          createdAt: C.vnStr(), at: C.vnStr(), confirmedBy: gw.status === 'success' ? 'cổng thẻ cào (tự động)' : null};
        (st.deposits = st.deposits || []).unshift(dep);
        if(gw.status === 'success'){
          const tx = O.walletAdd(st, me, credit, 'deposit', 'Nạp thẻ ' + carrier + ' ' + denom.toLocaleString('vi-VN') + 'đ (−' + rate + '%)', id);
          dep.balanceAfter = tx.balanceAfter;
          O.notify(st, me.id, 'deposit', 'Nạp thẻ thành công +' + credit.toLocaleString('vi-VN') + 'đ', carrier + ' mệnh giá ' + denom.toLocaleString('vi-VN') + 'đ, chiết khấu ' + rate + '%. Số dư mới: ' + tx.balanceAfter.toLocaleString('vi-VN') + 'đ.');
          payOrderFromDeposit(st, dep, me);
          return {out: {ok:true, status:'success', msg:'Nạp thành công +' + credit.toLocaleString('vi-VN') + 'đ vào ví.', deposit: dep, balanceAfter: tx.balanceAfter}};
        }
        if(gw.status === 'failed'){
          return {out: {ok:false, msg: gw.msg || 'Cổng thanh toán từ chối thẻ — kiểm tra lại serial/mã PIN.'}};
        }
        O.notify(st, me.id, 'deposit', 'Yêu cầu nạp thẻ ' + id + ' đang chờ xử lý', carrier + ' ' + denom.toLocaleString('vi-VN') + 'đ — ' + (gw.mode === 'gateway' ? 'cổng đang xử lý' : 'admin sẽ xác minh và cộng tiền khi thẻ hợp lệ') + '.');
        O.notify(st, 'admins', 'deposit', 'Duyệt nạp thẻ ' + id + ' — ' + me.username, carrier + ' ' + denom.toLocaleString('vi-VN') + 'đ → thực nhận ' + credit.toLocaleString('vi-VN') + 'đ. Serial ' + serial + '. Vào A16.');
        return {out: {ok:true, status:'pending', msg: gw.msg, deposit: dep}};
      });
      return C.json(res, 200, out.out || out);
    }
    if(act === 'claim'){
      const out = await C.withState(async st => {
        const me = A.getAuth(req, st);
        if(!me) return {out: {ok:false, auth:true}};
        const dep = (st.deposits || []).find(d => d.id === body.id && d.userId === me.id);
        if(!dep) return {out: {ok:false, msg:'Không tìm thấy yêu cầu nạp.'}};
        if(dep.status !== 'Chờ chuyển khoản') return {out: {ok:false, msg:'Yêu cầu này đã được xử lý.'}};
        dep.status = 'Chờ xác nhận';
        dep.claimedAt = C.vnStr();
        O.notify(st, 'admins', 'deposit', 'Khách báo đã chuyển khoản — NAP ' + dep.id, me.username + ' nạp ' + dep.amount.toLocaleString('vi-VN') + 'đ, nội dung "' + dep.paymentContent + '". Vào A16 xác nhận.');
        return {out: {ok:true, msg:'Đã ghi nhận — admin/webhook ngân hàng sẽ xác nhận. Yêu cầu ' + dep.id + ': Chờ xác nhận.'}};
      });
      return C.json(res, 200, out.out || out);
    }
    if(act === 'check'){
      const st = await C.getState();
      const me = A.getAuth(req, st);
      if(!me) return C.json(res, 401, {ok:false, auth:true});
      const dep = (st.deposits || []).find(d => d.id === body.id && d.userId === me.id);
      if(!dep) return C.fail(res, 404, 'Không tìm thấy yêu cầu nạp.');
      return C.json(res, 200, {ok:true, status: dep.status});
    }
    return C.fail(res, 400, 'Hành động không hợp lệ.');
  }catch(e){
    return C.fail(res, 500, 'Lỗi server: ' + e.message);
  }
};

/* nạp gắn với đơn hàng: khi nạp thành công thì tự thanh toán đơn đó từ ví */
function payOrderFromDeposit(st, dep, me){
  if(!dep.orderId) return;
  const order = (st.orders || []).find(o => o.id === dep.orderId && o.userId === me.id);
  if(!order || order.status === 'Đã thanh toán' || order.status === 'Đã hủy') return;
  if((me.balance || 0) >= order.total){
    O.walletAdd(st, me, -order.total, 'purchase', 'Thanh toán đơn ' + order.id + ' từ tiền nạp thẻ', order.id);
    O.grantOrder(st, order, me);
    O.notify(st, me.id, 'order', 'Đơn ' + order.id + ' đã thanh toán', 'Thanh toán tự động từ tiền nạp thẻ — vào "Kho Plugin đã mua" để tải.');
  }
}
function mask(code){ return String(code).slice(0, 2) + '*'.repeat(Math.max(0, String(code).length - 4)) + String(code).slice(-2); }
