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
    const data = {
      ok: true,
      serverTime: C.vnStr(),
      public: {
        licenseTiers: (settings.licenseTiers && settings.licenseTiers.length) ? settings.licenseTiers : O.tierDefaults(),
        bank: {bin: settings.bank.bin, account: settings.bank.account, name: settings.bank.name, shortName: settings.bank.shortName, isSample: !!settings.bank.isSample},
        topupRates: settings.topupRates || {global: 20, carriers: {}},
        couponsActive: (st.coupons || []).filter(c => c.active).map(c => ({code: c.code, percent: c.percent, expires: c.expires})),
        changelog: st.changelog || []
      },
      plugins: (st.plugins || []).filter(p => p.published || admin).map(A.safePlugin),
      reviews: (st.reviews || []).filter(r => r.status === 'visible' || admin)
    };
    if(me){
      data.me = A.safeUser(me);
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
        users: (st.users || []).map(A.safeUser),
        allOrders: st.orders || [],
        allDeposits: st.deposits || [],
        allPurchases: st.purchases || [],
        allTickets: st.tickets || [],
        allReferrals: st.referrals || [],
        allLicenses: st.licenses || [],
        grantLog: settings.grantLog || [],
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
