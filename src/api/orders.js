/* /api/orders — tạo đơn, trả tiền bằng ví, báo đã chuyển khoản, hủy, poll trạng thái */
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
    if(act === 'create'){
      const out = await C.withState(async st => {
        const me = A.getAuth(req, st);
        if(!me) return {out: {ok:false, auth:true, msg:'Bạn cần đăng nhập để đặt hàng.'}};
        if(me.banned) return {out: {ok:false, msg:'Tài khoản đã bị khóa.'}};
        const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
        const method = ['qr','wallet','card'].includes(body.method) ? body.method : 'qr';
        const made = O.createOrder(st, me, items, body.coupon, method);
        if(!made.ok) return {out: made};
        const order = made.order;
        const bank = (st.settings || {}).bank || {};
        const qrPayload = O.napasQR(bank, order.total, order.paymentContent);
        if(method === 'wallet'){
          if((me.balance || 0) < order.total) return {out: {ok:false, msg:'Số dư ví không đủ (' + (me.balance||0).toLocaleString('vi-VN') + 'đ < ' + order.total.toLocaleString('vi-VN') + 'đ) — nạp thêm ví hoặc chọn QR ngân hàng.'}};
          O.walletAdd(st, me, -order.total, 'purchase', 'Thanh toán đơn ' + order.id, order.id);
          /* đơn 0đ (bản FREE) đã được grantOrder tự chạy trong createOrder — dùng lại kết quả đó, KHÔNG cấp 2 lần */
          const purchased = made.autoGranted || O.grantOrder(st, order, me);
          return {out: {ok:true, order: stripOrder(order), paid: true, purchased}};
        }
        return {out: {ok:true, order: stripOrder(order), paid: false, qrPayload, bank: {bin: bank.bin, account: bank.account, name: bank.name, shortName: bank.shortName}}};
      });
      return C.json(res, 200, out.out || out);
    }
    /* LỆNH ƯU TIÊN 1 (24/11/2026) — nút "Nhận miễn phí" ở Cửa hàng: cấp NGAY key bản FREE (DF-…)
       cho tài khoản đang đăng nhập, kèm đơn 0đ để có đơn hàng + nhật ký. KHÔNG cần admin duyệt. */
    if(act === 'claim-free'){
      const out = await C.withState(async st => {
        const me = A.getAuth(req, st);
        if(!me) return {out: {ok:false, auth:true, msg:'Bạn cần đăng nhập để nhận key bản FREE.'}};
        if(me.banned) return {out: {ok:false, msg:'Tài khoản đã bị khóa.'}};
        if(!C.rateHit('freec:' + me.id, 5, 3600 * 1000)) return {out: {ok:false, msg:'Bấm nhận quá nhiều lần — thử lại sau.'}};
        const df = O.ensureFreeKey(st, me);
        /* đơn 0đ lưu lịch sử (giống mẫu DH-1035) — chỉ tạo đơn khi CHƯA có đơn FREE của tài khoản này */
        const had = (st.orders || []).find(o => o.userId === me.id && (o.items || []).some(i => i.pluginId === 'PL-FREE'));
        let orderId = null;
        if(!had){
          const freePl = (st.plugins || []).find(p => p.id === 'PL-FREE');
          const id = O.newOrderId();
          st.orders.unshift({
            id, userId: me.id, username: me.username,
            package: 'Bản FREE',
            items: [{pluginId: 'PL-FREE', name: (freePl && freePl.name) || 'Đấu La Đại Lục — Plugin bản FREE', kind: 'plugin', version: (freePl && freePl.version) || '', price: 0, sale: 0, unit: 0, qty: 1, lineTotal: 0}],
            subtotal: 0, discount: 0, total: 0, method: '—',
            paymentContent: 'DAULA ' + id, status: 'Đã thanh toán',
            claimedAt: null, createdAt: C.vnStr(), date: C.vnDate(), paidAt: C.vnStr(),
            license: df.key, note: 'Nhận miễn phí tại Cửa hàng'
          });
          orderId = id;
          O.logLevel(st, {by: 'cửa hàng (nhận miễn phí)', act: 'claim-free', who: me.username, from: '(chưa có key FREE)', to: 'free', keys: [df.key], reason: 'Bấm "Nhận miễn phí" tại Cửa hàng'});
          O.notify(st, me.id, 'license', 'Bạn nhận KEY BẢN FREE: ' + df.key, 'Key dùng VĨNH VIỄN — tải Plugin bản FREE trong mục "Tải file". Đơn xác nhận: ' + id + '.');
        }
        return {out: {ok:true, freeKey: df.key, masked: df.key.split('-')[0] + '-' + df.key.split('-')[1] + '-****-' + df.key.split('-').pop(), orderId, repeat: !!had}};
      });
      return C.json(res, 200, out.out || out);
    }
    if(act === 'claim'){
      const out = await C.withState(async st => {
        const me = A.getAuth(req, st);
        if(!me) return {out: {ok:false, auth:true, msg:'Bạn chưa đăng nhập.'}};
        const order = (st.orders || []).find(o => o.id === body.id && o.userId === me.id);
        if(!order) return {out: {ok:false, msg:'Không tìm thấy đơn hàng.'}};
        if(order.status !== 'Chờ thanh toán') return {out: {ok:false, msg:'Đơn không ở trạng thái chờ thanh toán.'}};
        order.status = 'Chờ xác nhận';
        order.claimedAt = C.vnStr();
        O.notify(st, 'admin-only', 'payment', 'Khách báo đã chuyển khoản — đơn ' + order.id, me.username + ' báo đã CK ' + order.total.toLocaleString('vi-VN') + 'đ, nội dung "' + order.paymentContent + '". Vào A15 xác nhận.');
        return {out: {ok:true, msg:'Đã ghi nhận — admin sẽ kiểm tra và xác nhận. Đơn ' + order.id + ': Chờ xác nhận.'}};
      });
      return C.json(res, 200, out.out || out);
    }
    if(act === 'check'){
      const st = await C.getState();
      const me = A.getAuth(req, st);
      if(!me) return C.json(res, 401, {ok:false, auth:true});
      const order = (st.orders || []).find(o => o.id === body.id && o.userId === me.id);
      if(!order) return C.fail(res, 404, 'Không tìm thấy đơn hàng.');
      return C.json(res, 200, {ok:true, status: order.status, license: order.license});
    }
    if(act === 'cancel'){
      const out = await C.withState(async st => {
        const me = A.getAuth(req, st);
        if(!me) return {out: {ok:false, auth:true}};
        const order = (st.orders || []).find(o => o.id === body.id && o.userId === me.id);
        if(!order) return {out: {ok:false, msg:'Không tìm thấy đơn hàng.'}};
        if(order.status !== 'Chờ thanh toán' && order.status !== 'Chờ xác nhận') return {out: {ok:false, msg:'Chỉ hủy được đơn chưa thanh toán.'}};
        order.status = 'Đã hủy';
        return {out: {ok:true, msg:'Đã hủy đơn ' + order.id + '.'}};
      });
      return C.json(res, 200, out.out || out);
    }
    if(act === 'pay-wallet'){
      const out = await C.withState(async st => {
        const me = A.getAuth(req, st);
        if(!me) return {out: {ok:false, auth:true}};
        const order = (st.orders || []).find(o => o.id === body.id && o.userId === me.id);
        if(!order) return {out: {ok:false, msg:'Không tìm thấy đơn hàng.'}};
        if(order.status === 'Đã thanh toán') return {out: {ok:false, msg:'Đơn đã thanh toán trước đó.'}};
        if(order.status === 'Đã hủy') return {out: {ok:false, msg:'Đơn đã hủy.'}};
        if((me.balance || 0) < order.total) return {out: {ok:false, msg:'Số dư ví không đủ (' + (me.balance||0).toLocaleString('vi-VN') + 'đ < ' + order.total.toLocaleString('vi-VN') + 'đ).'}};
        O.walletAdd(st, me, -order.total, 'purchase', 'Thanh toán đơn ' + order.id, order.id);
        order.method = 'Ví tiền';
        const purchased = O.grantOrder(st, order, me);
        return {out: {ok:true, msg:'Đã thanh toán đơn ' + order.id + ' bằng ví — đã cấp: ' + purchased.map(p=>p.name).join(', ')}};
      });
      return C.json(res, 200, out.out || out);
    }
    return C.fail(res, 400, 'Hành động không hợp lệ.');
  }catch(e){
    return C.fail(res, 500, 'Lỗi server: ' + e.message);
  }
};

function stripOrder(o){
  return {id: o.id, items: o.items, subtotal: o.subtotal, discount: o.discount, coupon: o.coupon, total: o.total,
    method: o.method, paymentContent: o.paymentContent, status: o.status, license: o.license, createdAt: o.createdAt, date: o.date};
}
