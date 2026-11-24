/* /api/state — bootstrap dữ liệu theo quyền */
'use strict';
const C = require('./_lib/core.js');
const A = require('./_lib/api.js');
const O = require('./_lib/ops.js');

module.exports = async (req, res) => {
  try{
    const st = await C.getState();
    const me = A.getAuth(req, st);
    const admin = me && me.role === 'admin';
    const settings = st.settings || {};
    /* FIX 24/11/2026: settings.bank có thể THIẾU trong state cũ — truy cập an toàn, tránh 500 -> trang trắng */
    const bank = settings.bank || {};
    /* 24/11/2026 — HẠ CẤP TỰ ĐỘNG VIP -> FREE khi license hết hạn: đánh dấu + ghi log ĐÚNG 1 LẦN mỗi license */
    if(me){
      const expiredVip = (st.licenses || []).filter(l => l.userId === me.id && C.isVipKey(l.key) && l.expires && !l.revoked && !l.expiredHandled && new Date(l.expires + 'T23:59:59+07:00').getTime() < Date.now());
      if(expiredVip.length){
        try{
          await C.withState(st2 => {
            const u2 = (st2.users || []).find(x => x.id === me.id);
            if(!u2) return;
            const keys = [];
            for(const ev of expiredVip){
              const l2 = (st2.licenses || []).find(l => l.key === ev.key && l.userId === u2.id);
              if(l2 && !l2.expiredHandled){ l2.expiredHandled = true; keys.push(l2.key); }
            }
            if(keys.length){
              const df = O.ensureFreeKey(st2, u2);
              O.logLevel(st2, {by: 'auto (server)', act: 'auto-expiry', who: u2.username, from: 'vip', to: 'free', keys, reason: 'License VIP hết hạn ' + expiredVip[0].expires + ' — tự động chuyển về bản FREE'});
              O.notify(st2, u2.id, 'expiry', 'License VIP đã hết hạn — tài khoản chuyển về bản FREE', 'KEY bản FREE (' + df.key + ') vẫn giữ nguyên, tải được Plugin bản FREE trong "Tải file". Mua mốc thời hạn mới tại cửa hàng để lên lại VIP.');
            }
          });
        }catch(e){ /* lỗi ghi log không chặn việc trả state */ }
      }
    }
    const data = {
      ok: true,
      serverTime: C.vnStr(),
      public: {
        licenseTiers: (settings.licenseTiers && settings.licenseTiers.length) ? settings.licenseTiers : O.tierDefaults(),
        bank: {bin: bank.bin, account: bank.account, name: bank.name, shortName: bank.shortName, isSample: !!bank.isSample},
        topupRates: settings.topupRates || {global: 20, carriers: {}},
        couponsActive: (st.coupons || []).filter(c => c.active).map(c => ({code: c.code, percent: c.percent, expires: c.expires})),
        changelog: st.changelog || []
      },
      plugins: (st.plugins || []).filter(p => p.published || admin).map(A.safePlugin),
      reviews: (st.reviews || []).filter(r => r.status === 'visible' || admin)
    };
    if(me){
      data.me = A.safeUser(me, st);
      data.myOrders = (st.orders || []).filter(o => o.userId === me.id);
      data.myDeposits = (st.deposits || []).filter(d => d.userId === me.id);
      data.myPurchases = (st.purchases || []).filter(p => p.userId === me.id);
      data.myLicenses = (st.licenses || []).filter(l => l.userId === me.id);
      data.myTickets = (st.tickets || []).filter(t => t.userId === me.id);
      data.myReferrals = (st.referrals || []).filter(r => r.referrer === me.username);
      data.myWallet = (st.walletLog || []).filter(t => t.userId === me.id);
      data.notifications = (st.notifications || []).filter(n => n.to === 'all' || n.to === me.id);
    }
    if(admin){
      data.admin = {
        users: (st.users || []).map(u => A.safeUser(u, st)),
        allOrders: st.orders || [],
        allDeposits: st.deposits || [],
        allPurchases: st.purchases || [],
        allTickets: st.tickets || [],
        allReferrals: st.referrals || [],
        allLicenses: st.licenses || [],
        grantLog: settings.grantLog || [],
        levelLog: settings.levelLog || [],
        coupons: st.coupons || [],
        reviewsAll: st.reviews || [],
        creditLog: settings.creditLog || [],
        topupLog: st.deposits ? st.deposits.slice(0, 100) : [],
        walletLog: (st.walletLog || []).slice(0, 200),
        revenue: revenueStats(st)
      };
    }
    C.json(res, 200, data);
  }catch(e){
    C.fail(res, 500, 'Không đọc được dữ liệu server: ' + e.message);
  }
};

function revenueStats(st){
  const days = [];
  for(let i = 13; i >= 0; i--){
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0,10);
    const rev = (st.orders || []).filter(o => o.date === d && o.status === 'Đã thanh toán').reduce((s, o) => s + o.total, 0);
    const cnt = (st.orders || []).filter(o => o.date === d && o.status === 'Đã thanh toán').length;
    days.push({date: d, revenue: rev, orders: cnt});
  }
  const paid = (st.orders || []).filter(o => o.status === 'Đã thanh toán');
  const byProduct = {};
  for(const o of paid) for(const l of o.items || []){
    byProduct[l.name] = byProduct[l.name] || {name: l.name, revenue: 0, qty: 0};
    byProduct[l.name].revenue += l.lineTotal; byProduct[l.name].qty += l.qty;
  }
  return {
    days,
    totalRevenue: paid.reduce((s, o) => s + o.total, 0),
    totalOrders: paid.length,
    pendingOrders: (st.orders || []).filter(o => o.status === 'Chờ thanh toán' || o.status === 'Chờ xác nhận').length,
    totalUsers: (st.users || []).length,
    totalDeposited: (st.deposits || []).filter(d => d.status === 'Thành công').reduce((s, d) => s + d.credit, 0),
    walletTotal: (st.users || []).reduce((s, u) => s + (u.balance || 0), 0),
    byProduct: Object.values(byProduct).sort((a, b) => b.revenue - a.revenue)
  };
}
