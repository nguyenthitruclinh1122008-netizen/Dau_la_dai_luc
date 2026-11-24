/* Đấu La Đại Lục — helper xác thực cho các endpoint */
'use strict';
const C = require('./core.js');

/* session từ cookie -> user */
function getAuth(req, st){
  const cookies = C.parseCookies(req);
  const token = cookies.dl_sess;
  if(!token) return null;
  const sess = (st.sessions || {})[token];
  if(!sess || sess.exp < C.nowMs()) return null;
  const user = (st.users || []).find(u => u.id === sess.uid);
  return user || null;
}
/* admin: session + role + gate ticket trong header x-admin-ticket */
function getAdmin(req, st){
  const user = getAuth(req, st);
  if(!user || user.role !== 'admin') return null;
  const ticket = req.headers['x-admin-ticket'] || '';
  if(!C.adminTicketValid(user.id, ticket)) return null;
  return user;
}
function safeUser(u){
  return {
    id: u.id, username: u.username, email: u.email || '', role: u.role, banned: !!u.banned,
    banReason: u.banReason || '', createdAt: u.createdAt, points: u.points || 0,
    pointLog: u.pointLog || [], balance: u.balance || 0, referralCode: u.referralCode,
    referredBy: u.referredBy || null, twoFA: {enabled: !!(u.twoFA && u.twoFA.enabled)},
    readNotifs: u.readNotifs || [], avatar: u.avatar || '', displayName: u.displayName || ''
  };
}
function safePlugin(p){
  return {
    id: p.id, slug: p.slug, name: p.name, category: p.category, kind: p.kind, pkg: p.pkg || null,
    licensing: !!p.licensing,   /* bán theo MỐC THỜI HẠN — client lấy giá từ licenseTiers theo tierId */
    version: p.version, versionUpdatedAt: p.versionUpdatedAt || '', price: p.price, sale: p.sale || 0, published: !!p.published, best: !!p.best,
    image: p.image || '', description: p.description || '', features: p.features || [],
    installGuide: p.installGuide || '', usageGuide: p.usageGuide || '',
    hasFile: !!(p.fileUrl || p.fileKey), fileName: p.fileName || '', fileSize: p.fileSize || 0,
    createdAt: p.createdAt || ''
  };
}
module.exports = {getAuth, getAdmin, safeUser, safePlugin};
