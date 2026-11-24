/* Đấu La Đại Lục — ops: nghiệp vụ chia sẻ giữa các endpoint (orders, deposits, grants, notify) */
'use strict';
const C = require('./core.js');

const CARRIERS = ['Viettel','Mobifone','Vinaphone','Vietnamobile','Zing','Gate','Garena','VTC','Bit'];
const DENOMS = [10000,20000,50000,100000,200000,500000];

/* ---------- QR Napas/EMVCo thật (TLV + CRC16) ---------- */
function tlv(id, val){
  const v = String(val);
  const len = String(v.length).padStart(2,'0');
  return id + len + v;
}
function crc16(payload){
  let crc = 0xFFFF;
  for(let i = 0; i < payload.length; i++){
    crc ^= payload.charCodeAt(i) << 8;
    for(let b = 0; b < 8; b++){
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4,'0');
}
/* QR chuyển khoản Napas chuẩn 24-9: quét được bằng mọi app ngân hàng VN */
function napasQR(bank, amount, content){
  const bin = String(bank.bin || '').replace(/\D/g,'').slice(0,6);
  const acc = String(bank.account || '').replace(/\D/g,'');
  const consumer = (bin + acc).slice(0, 25);
  const merchant = tlv('00','A000000727') + tlv('01', consumer) + tlv('02','QRIBFTTA');
  let p = tlv('00','01') + tlv('01','11') + tlv('38', merchant) +
          tlv('53','703') +
          (amount > 0 ? tlv('54', String(Math.round(amount))) : '') +
          tlv('58','VN') +
          tlv('62', tlv('08', String(content || '').slice(0,25)));
  p += '6304';
  return p + crc16(p);
}

/* ---------- thanh toán thẻ cào: adapter cổng thật qua env ---------- */
async function cardGatewayCheck(carrier, denom, serial, code){
  const url = process.env.CARD_GATEWAY_URL;
  if(!url || !process.env.CARD_GATEWAY_SECRET){
    return {mode:'manual', status:'pending', msg:'Cổng thẻ cào chưa cấu hình — giao dịch vào hàng chờ, admin xác minh thủ công.'};
  }
  try{
    const body = {
      partner_id: process.env.CARD_GATEWAY_PARTNER || 'daula',
      partner_key: process.env.CARD_GATEWAY_SECRET,
      telco: String(carrier).toLowerCase(),
      code: String(code), serial: String(serial),
      declare_amount: Number(denom)
    };
    const r = await fetch(url, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)});
    const data = await r.json().catch(() => ({}));
    /* chuẩn phổ biến các cổng VN: status 1 = thành công */
    const st = data.status !== undefined ? Number(data.status) : (data.success === true ? 1 : Number(data.code) || -1);
    if(st === 1 || data.success === true){
      return {mode:'gateway', status:'success', ref: String(data.trans_ref || data.transaction_id || data.ref || ''), msg: data.message || 'Cổng xác nhận thẻ thành công.'};
    }
    if(st === 2 || data.pending === true || st === 99){
      return {mode:'gateway', status:'pending', ref: String(data.trans_ref || ''), msg: data.message || 'Cổng đang xử lý thẻ.'};
    }
    return {mode:'gateway', status:'failed', ref: String(data.trans_ref || ''), msg: data.message || ('Cổng từ chối thẻ (mã ' + st + ').')};
  }catch(e){
    return {mode:'gateway', status:'pending', ref:'', msg:'Không gọi được cổng thanh toán (' + e.message + ') — vào hàng chờ admin duyệt.'};
  }
}

/* ---------- ví ---------- */
function walletAdd(st, user, amount, kind, note, refId){
  user.balance = Math.round((user.balance || 0) + amount);
  const tx = {id: C.uid('TX'), at: C.vnStr(), user: user.username, userId: user.id, kind, amount: Math.round(amount), note: note || '', ref: refId || '', balanceAfter: user.balance};
  if(!st.walletLog) st.walletLog = [];
  st.walletLog.unshift(tx);
  if(st.walletLog.length > 400) st.walletLog.length = 400;
  return tx;
}
function notify(st, to, type, title, body){
  st.notifications.unshift({id: C.uid('n'), to, type, title: String(title).slice(0,120), body: String(body).slice(0,400), date: C.vnDate(), at: C.vnStr(), by:'server'});
  if(st.notifications.length > 200) st.notifications.length = 200;
}

/* ---------- đơn hàng ---------- */
function newOrderId(){
  return 'DH-' + Math.floor(1000 + Math.random() * 9000) + '-' + C.uid('X').slice(2,5);
}
function validateCoupon(coupon, subtotal){
  if(!coupon || !coupon.active) return {ok:false, msg:'Mã giảm giá không tồn tại hoặc đã tắt.'};
  if(coupon.expires && new Date(coupon.expires + 'T23:59:59+07:00').getTime() < Date.now()) return {ok:false, msg:'Mã giảm giá đã hết hạn.'};
  if((coupon.used || 0) >= coupon.maxUses) return {ok:false, msg:'Mã giảm giá đã hết lượt sử dụng.'};
  return {ok:true, percent: coupon.percent};
}
/* nhãn mốc thời hạn từ số ngày (0 = vĩnh viễn) */
function tierLabel(days){ return Number(days) === 0 ? 'Vĩnh viễn' : Number(days) + ' ngày'; }
/* 4 mốc mặc định — dùng khi DB cũ chưa có settings.licenseTiers */
function tierDefaults(){
  return [
    {id:'t30',  days:30,  price:99000,  sale:0,  best:false},
    {id:'t180', days:180, price:299000, sale:10, best:false},
    {id:'t365', days:365, price:499000, sale:20, best:true},
    {id:'tvv',  days:0,   price:849000, sale:10, best:false}
  ];
}
/* sinh license key — bản VIP dùng tiền tố DL (DL-VIP-XXXX-XXXX); bản FREE dùng tiền tố DF (DF-XXXX-XXXX) theo yêu cầu */
function makeKey(kind){
  const g = () => C.uid('K').slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  if(kind === 'FREE') return 'DF-' + g() + '-' + (1000 + Math.floor(Math.random() * 9000));
  return 'DL-' + kind + '-' + g() + '-' + (1000 + Math.floor(Math.random() * 9000));
}
/* URL dự phòng Plugin bản FREE (file mới nhất) — endpoint jar FREE của site chính,
   luôn trả bản mới nhất đang host (đọc plugin.yml trong jar_files DB). Dùng khi store chưa có Plugin PL-FREE. */
const FREE_PLUGIN_URL = 'https://dau-la-dai-luc-livid.vercel.app/api/download/free';
/* đảm bảo user có đúng 1 key bản FREE (DF) — cấp nếu chưa có (dùng cho: đăng ký mới, hạ cấp VIP→FREE, hết hạn VIP) */
function ensureFreeKey(st, u){
  let lic = (st.licenses || []).find(l => l.userId === u.id && C.isFreeKey(l.key));
  if(lic) return lic;
  let key = makeKey('FREE');
  while((st.licenses || []).some(l => l.key === key)) key = makeKey('FREE');
  lic = {key, userId: u.id, package: 'Bản FREE', tierId: null, days: 0, expires: null, maxServers: 1, servers: [], via: 'auto', createdAt: C.vnStr()};
  st.licenses.push(lic);
  return lic;
}
/* nhật ký đổi cấp độ (FREE/VIP): ai, lúc nào, từ gì sang gì, vì sao — ghi tại SERVER */
function logLevel(st, entry){
  const S = st.settings = st.settings || {};
  S.levelLog = S.levelLog || [];
  S.levelLog.unshift(Object.assign({at: C.vnStr()}, entry));
  if(S.levelLog.length > 300) S.levelLog.length = 300;
}
/* tạo license từ mốc thời hạn (tier) — gán cho user hoặc để key rời (userId null) phát sau */
function makeLicense(st, tier, user, via){
  const days = Number(tier.days) || 0;
  const lic = {
    key: makeKey('VIP'),
    userId: user ? user.id : null,
    package: tierLabel(days),
    tierId: tier.id || null,
    days,
    expires: days > 0 ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) : null,
    maxServers: days === 0 ? 2 : (days >= 180 ? 2 : 1),
    servers: [],
    via: via || ''
  };
  st.licenses.push(lic);
  return lic;
}
/* tạo đơn từ items + coupon — server tự tính giá theo DB (tier thời hạn), KHÔNG tin client */
function createOrder(st, user, items, couponCode, method){
  const tiers = (((st.settings || {}).licenseTiers) && st.settings.licenseTiers.length) ? st.settings.licenseTiers : tierDefaults();
  const lines = [];
  for(const it of items){
    const pl = (st.plugins || []).find(p => p.id === it.pluginId && p.published);
    if(!pl) return {ok:false, msg:'Sản phẩm không tồn tại hoặc đã ngừng bán: ' + it.pluginId};
    if(pl.licensing){
      /* sản phẩm bán theo THỜI HẠN: client chỉ gửi tierId, giá + số ngày lấy từ settings (admin chỉnh) */
      const tier = tiers.find(t => t.id === it.tierId);
      if(!tier) return {ok:false, msg:'Mốc thời hạn không hợp lệ — chọn lại 30/180/365 ngày hoặc Vĩnh viễn.'};
      const sale = tier.sale || 0;
      const unit = sale > 0 ? Math.round(tier.price * (100 - sale) / 100) : tier.price;
      const label = tierLabel(tier.days);
      lines.push({pluginId: pl.id, name: pl.name + ' (' + label + ')', kind:'license', tierId: tier.id, tierLabel: label, days: Number(tier.days) || 0,
        version: pl.version, price: tier.price, sale, unit, qty: 1, lineTotal: unit});
    } else {
      const qty = C.clampInt(it.qty, 1, 10, 1);
      const sale = pl.sale || 0;
      const unit = sale > 0 ? Math.round(pl.price * (100 - sale) / 100) : pl.price;
      lines.push({pluginId: pl.id, name: pl.name, kind: pl.kind, version: pl.version, price: pl.price, sale, unit, qty, lineTotal: unit * qty});
    }
  }
  if(!lines.length) return {ok:false, msg:'Giỏ hàng trống.'};
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  let discount = 0, couponUsed = null;
  const cc = C.cleanStr(couponCode, 24).toUpperCase();
  if(cc){
    const coupon = (st.coupons || []).find(x => x.code === cc);
    const v = validateCoupon(coupon, subtotal);
    if(!v.ok) return {ok:false, msg:v.msg};
    discount = Math.round(subtotal * v.percent / 100);
    couponUsed = cc;
  }
  const total = Math.max(0, subtotal - discount);
  const id = newOrderId();
  const order = {
    id, userId: user.id, username: user.username,
    items: lines, subtotal, discount, coupon: couponUsed, total,
    method: method === 'wallet' ? 'Ví tiền' : (method === 'card' ? 'Thẻ cào' : 'Chuyển khoản QR'),
    paymentContent: 'DAULA ' + id,
    status: total === 0 ? 'Đã thanh toán' : 'Chờ thanh toán',
    claimedAt: null, createdAt: C.vnStr(), date: C.vnDate(), paidAt: total === 0 ? C.vnStr() : null,
    license: '—', note: ''
  };
  st.orders.unshift(order);
  if(couponUsed){
    const coupon = st.coupons.find(x => x.code === couponUsed);
    coupon.used = (coupon.used || 0) + 1;
  }
  let autoGranted = null;
  if(total === 0) autoGranted = grantOrder(st, order, user);
  /* điểm thưởng +10% giá trị đơn khi hoàn tất */
  return {ok:true, order, autoGranted};
}
/* cấp quyền sau khi đơn PAID: license key theo THỜI HẠN đã chọn, purchase cho plugin thường */
function grantOrder(st, order, user){
  order.status = 'Đã thanh toán';
  order.paidAt = C.vnStr();
  const purchased = [];
  for(const line of order.items){
    if(line.kind === 'license' || line.kind === 'vip'){
      /* license mới: thời hạn tính từ NGÀY DUYỆT — days=0 (hoặc legacy months=0 không có days) là vĩnh viễn */
      const days = line.kind === 'license' ? (Number(line.days) || 0) : (line.months > 0 ? line.months * 30 : 0);
      const label = line.kind === 'license' ? (line.tierLabel || tierLabel(days)) : (line.pkg || tierLabel(days));
      const fromLv = C.userLevel(st, user);   /* ghi log nâng cấp: từ gì -> vip */
      const lic = {key: makeKey('VIP'), userId: user.id, package: label, tierId: line.tierId || null, days, expires: days > 0 ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) : null, maxServers: days === 0 ? 2 : (days >= 180 ? 2 : 1), servers: []};
      st.licenses.push(lic);
      logLevel(st, {by: 'purchase: ' + order.id, act: 'upgrade', who: user.username, from: fromLv, to: 'vip', keys: [lic.key], reason: 'Đơn ' + order.id + ' đã thanh toán — cấp ' + label});
      order.license = lic.key;
      purchased.push({name: line.name, kind:'license', key: lic.key, label, days});
    } else {
      const existing = st.purchases.find(pv => pv.userId === user.id && pv.pluginId === line.pluginId);
      if(!existing){
        const purchase = {id: C.uid('PV'), userId: user.id, username: user.username, pluginId: line.pluginId, orderId: order.id, qty: line.qty, downloads: 0, grantedAt: C.vnStr()};
        st.purchases.push(purchase);
        purchased.push({name: line.name, kind:'plugin', purchaseId: purchase.id});
      } else purchased.push({name: line.name, kind:'plugin', purchaseId: existing.id});
      /* bản FREE cũng phải có LICENSE KEY riêng (DF-XXXX-XXXX) — không cho dùng không key */
      if(line.price === 0 && !st.licenses.some(l => l.userId === user.id && C.isFreeKey(l.key))){
        const lic = ensureFreeKey(st, user);
        lic.package = 'Bản thử miễn phí';
        if(!order.license || order.license === '—') order.license = lic.key;
        purchased.push({name: 'License bản thử miễn phí (' + lic.key + ')', kind:'free-license', key: lic.key, label: 'Bản thử miễn phí', days: 0});
      }
    }
  }
  /* điểm thưởng + hoa hồng giới thiệu */
  const points = Math.round(order.total / 10);
  if(points > 0){
    user.points = (user.points || 0) + points;
    (user.pointLog = user.pointLog || []).unshift({at: C.vnDate(), delta: points, why: 'Đơn ' + order.id + ' (+10% giá trị đơn)'});
  }
  if(user.referredBy){
    const referrer = st.users.find(u => u.username === user.referredBy);
    if(referrer && order.total > 0){
      st.referrals.unshift({id: C.uid('RF'), referrer: referrer.username, buyer: user.username, order: order.id, amount: order.total, commission: Math.round(order.total * 0.2), status:'pending', date: C.vnDate()});
    }
  }
  notify(st, user.id, 'order', 'Đơn ' + order.id + ' đã thanh toán thành công', purchased.map(p => p.name).join(', ') + ' — vào "Kho Plugin đã mua" để tải file.');
  return purchased;
}
/* xác nhận thanh toán theo paymentContent (dùng bởi webhook + admin) */
function findPendingByContent(st, content){
  const c = C.cleanStr(content, 60).toUpperCase();
  const order = st.orders.find(o => (o.paymentContent || '').toUpperCase() === c && o.status !== 'Đã thanh toán' && o.status !== 'Đã hủy');
  if(order) return {type:'order', order};
  const dep = (st.deposits || []).find(d => (d.paymentContent || '').toUpperCase() === c && d.status === 'Chờ chuyển khoản');
  if(dep) return {type:'deposit', deposit: dep};
  return null;
}
function confirmPayment(st, target, paidAmount, source, paidContent){
  const time = C.vnStr();
  if(target.type === 'order'){
    const order = target.order, user = st.users.find(u => u.id === order.userId);
    if(!user) return {ok:false, msg:'Không tìm thấy người mua của đơn ' + order.id + '.'};
    if(paidAmount < order.total) return {ok:false, msg:'Số tiền nhận được (' + paidAmount + 'đ) nhỏ hơn giá trị đơn ' + order.id + ' (' + order.total + 'đ).'};
    if(order.status === 'Đã thanh toán') return {ok:false, msg:'Đơn đã thanh toán trước đó.'};
    order.method = source === 'webhook' ? 'Chuyển khoản QR (tự xác minh)' : 'Chuyển khoản QR';
    order.paidContent = C.cleanStr(paidContent, 80);
    const purchased = grantOrder(st, order, user);
    return {ok:true, kind:'order', id: order.id, purchased};
  } else {
    const dep = target.deposit, user = st.users.find(u => u.id === dep.userId);
    if(!user) return {ok:false, msg:'Không tìm thấy người nạp.'};
    if(dep.status !== 'Chờ chuyển khoản') return {ok:false, msg:'Yêu cầu nạp này đã được xử lý.'};
    if(paidAmount < dep.amount) return {ok:false, msg:'Số tiền nhận được nhỏ hơn yêu cầu nạp (' + dep.amount + 'đ).'};
    dep.status = 'Thành công';
    dep.confirmedAt = time;
    dep.confirmedBy = source === 'webhook' ? 'auto (webhook ngân hàng)' : 'admin';
    dep.paidContent = C.cleanStr(paidContent, 80);
    const tx = walletAdd(st, user, dep.credit, 'deposit', 'Nạp ' + (dep.kind === 'bank' ? 'QR ngân hàng' : 'thẻ cào ' + (dep.carrier||'')) + ' ' + dep.id, dep.id);
    dep.balanceAfter = tx.balanceAfter;
    notify(st, user.id, 'deposit', 'Nạp tiền thành công +' + dep.credit.toLocaleString('vi-VN') + 'đ', 'Yêu cầu ' + dep.id + ' đã được xác nhận. Số dư mới: ' + tx.balanceAfter.toLocaleString('vi-VN') + 'đ.');
    return {ok:true, kind:'deposit', id: dep.id, credit: dep.credit};
  }
}

module.exports = {CARRIERS, DENOMS, tlv, crc16, napasQR, cardGatewayCheck, walletAdd, notify, newOrderId, validateCoupon, tierLabel, tierDefaults, makeKey, makeLicense, createOrder, grantOrder, findPendingByContent, confirmPayment, FREE_PLUGIN_URL, ensureFreeKey, logLevel};
