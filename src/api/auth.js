/* /api/auth — đăng ký, đăng nhập, đổi mật khẩu/email, hồ sơ, 2FA */
'use strict';
const C = require('./_lib/core.js');
const A = require('./_lib/api.js');
const O = require('./_lib/ops.js');

module.exports = async (req, res) => {
  let body = {};
  try{ body = req.method === 'GET' ? {} : await readBody(req, 100000); }catch(e){ return C.fail(res, 400, 'Body không hợp lệ.'); }
  const act = body.act || C.qOf(req).act || '';

  try{
    if(req.method === 'GET' || act === 'me'){
      const me = await C.getState(); const mu = A.getAuth(req, me);
      return C.json(res, 200, {ok: true, me: mu && mu.id ? A.safeUser(mu) : null});
    }
    if(act === 'register'){
      if(!C.rateHit('reg:' + C.ipOf(req), 5, 30*60*1000)) return C.fail(res, 429, 'Đăng ký quá nhiều lần — thử lại sau 30 phút.');
      const username = C.cleanStr(body.username, 24);
      const email = C.cleanStr(body.email, 80);
      const password = String(body.password || '');
      if(!/^[A-Za-z0-9_.]{3,24}$/.test(username)) return C.fail(res, 400, 'Tên đăng nhập 3–24 ký tự (chữ, số, _ hoặc .).');
      if(password.length < 6) return C.fail(res, 400, 'Mật khẩu cần tối thiểu 6 ký tự.');
      const out = await C.withState(async st => {
        if((st.users || []).some(u => u.username.toLowerCase() === username.toLowerCase()))
          return {out: {ok:false, msg:'Tên đăng nhập "' + username + '" đã tồn tại — chọn tên khác.'}};
        if(email && (st.users || []).some(u => (u.email || '').toLowerCase() === email.toLowerCase()))
          return {out: {ok:false, msg:'Email này đã được dùng cho tài khoản khác.'}};
        let referredBy = null;
        const refCode = C.cleanStr(body.ref, 20).toUpperCase();
        if(refCode){
          const r = (st.users || []).find(x => (x.referralCode || '').toUpperCase() === refCode);
          if(r && r.username.toLowerCase() !== username.toLowerCase()) referredBy = r.username;
        }
        const nu = {
          id: C.uid('u'), username, email, role:'user', banned: false,
          passHash: C.hashPassword(password),
          createdAt: C.vnDate(), points: 0, pointLog: [], balance: 0,
          referralCode: 'DL-' + crypto2(4), referredBy,
          twoFA: {enabled: false, secret: ''}, readNotifs: [], avatar: '', displayName: ''
        };
        st.users.push(nu);
        const token = C.newSessionToken();
        st.sessions[token] = {uid: nu.id, exp: C.nowMs() + 30*86400000};
        O.notify(st, nu.id, 'system', 'Chào mừng ' + username + ' đến Đấu La Đại Lục!', 'Tài khoản đã sẵn sàng: mua Plugin, nạp ví, tích điểm và nhận hoa hồng giới thiệu.');
        return {out: {ok:true, username: nu.username, token, setCookie: C.sessionCookie(token)}};
      });
      if(!out.ok) return C.json(res, 200, out);
      res.setHeader('Set-Cookie', out.setCookie);
      return C.json(res, 200, {ok: true, username: out.username});
    }
    if(act === 'login'){
      const username = C.cleanStr(body.username, 24);
      const password = String(body.password || '');
      const code = C.cleanStr(body.code, 8);
      if(!C.rateHit('login:' + C.ipOf(req) + ':' + username.toLowerCase(), 8, 10*60*1000))
        return C.fail(res, 429, 'Bạn đã sai quá nhiều lần — thử lại sau 10 phút.');
      const out = await C.withState(async st => {
        const u = (st.users || []).find(x => x.username.toLowerCase() === username.toLowerCase());
        if(!u || !C.checkPassword(password, u.passHash)) return {out: {ok:false, msg:'Sai tên đăng nhập hoặc mật khẩu.'}};
        if(u.banned) return {out: {ok:false, msg:'Tài khoản đã bị khóa: ' + (u.banReason || 'vi phạm quy định.')}};
        if(u.twoFA && u.twoFA.enabled){
          if(!code) return {out: {ok:false, need2fa:true, msg:'Tài khoản bật 2FA — nhập mã 6 số.'}};
          if(!C.verify2fa(u.twoFA.secret, code)) return {out: {ok:false, need2fa:true, msg:'Mã 2FA không đúng, thử lại.'}};
        }
        const token = C.newSessionToken();
        st.sessions[token] = {uid: u.id, exp: C.nowMs() + 30*86400000};
        pruneSessions(st);
        return {out: {ok:true, username: u.username, role: u.role, token, setCookie: C.sessionCookie(token)}};
      });
      if(!out.ok) return C.json(res, 200, out);
      res.setHeader('Set-Cookie', out.setCookie);
      return C.json(res, 200, {ok: true, username: out.username, role: out.role});
    }
    if(act === 'logout'){
      const token = C.parseCookies(req).dl_sess;
      await C.withState(st => { if(token && st.sessions) delete st.sessions[token]; });
      res.setHeader('Set-Cookie', C.clearCookie());
      return C.json(res, 200, {ok: true});
    }
    /* các hành động cần đăng nhập */
    const out = await C.withState(async st => {
      const me = A.getAuth(req, st);
      if(!me) return {out: {ok:false, auth:true, msg:'Bạn chưa đăng nhập.'}};
      if(act === 'password'){
        if(!C.checkPassword(String(body.old || ''), me.passHash)) return {out: {ok:false, msg:'Mật khẩu hiện tại không đúng.'}};
        if(String(body.nw || '').length < 6) return {out: {ok:false, msg:'Mật khẩu mới cần tối thiểu 6 ký tự.'}};
        me.passHash = C.hashPassword(String(body.nw));
        return {out: {ok:true, msg:'Đã đổi mật khẩu thành công.'}};
      }
      if(act === 'email'){
        const email = C.cleanStr(body.email, 80);
        if(email && (st.users || []).some(u => u.id !== me.id && (u.email || '').toLowerCase() === email.toLowerCase()))
          return {out: {ok:false, msg:'Email đã được dùng cho tài khoản khác.'}};
        me.email = email;
        return {out: {ok:true, msg:'Đã cập nhật email.', email}};
      }
      if(act === 'profile'){
        me.displayName = C.cleanStr(body.displayName, 40);
        me.avatar = C.cleanStr(body.avatar, 8);
        return {out: {ok:true, msg:'Đã lưu hồ sơ cá nhân.', displayName: me.displayName, avatar: me.avatar}};
      }
      if(act === '2fa-start'){
        if(!me.twoFAPending) me.twoFAPending = C.genSecret32();
        return {out: {ok:true, secret: me.twoFAPending, otpauth: 'otpauth://totp/DauLa:' + me.username + '?secret=' + me.twoFAPending + '&issuer=DauLaDaiLuc'}};
      }
      if(act === '2fa-on'){
        const secret = me.twoFAPending;
        if(!secret) return {out: {ok:false, msg:'Chưa khởi tạo secret 2FA.'}};
        if(!C.verify2fa(secret, C.cleanStr(body.code, 8))) return {out: {ok:false, msg:'Mã 6 số không đúng — kiểm tra lại app authenticator.'}};
        me.twoFA = {enabled: true, secret};
        me.twoFAPending = null;
        return {out: {ok:true, msg:'Đã bật 2FA cho tài khoản.'}};
      }
      if(act === '2fa-off'){
        if(!me.twoFA || !me.twoFA.enabled) return {out: {ok:false, msg:'2FA đang tắt.'}};
        if(!C.verify2fa(me.twoFA.secret, C.cleanStr(body.code, 8))) return {out: {ok:false, msg:'Mã 6 số không đúng.'}};
        me.twoFA = {enabled: false, secret: ''};
        return {out: {ok:true, msg:'Đã tắt 2FA.'}};
      }
      if(act === 'points-redeem'){
        if((me.points || 0) < 500) return {out: {ok:false, msg:'Cần tối thiểu 500 điểm.'}};
        me.points -= 500;
        const code = 'DIEM-' + crypto2(5);
        (me.pointLog = me.pointLog || []).unshift({at: C.vnDate(), delta: -500, why: 'Đổi lấy mã giảm giá ' + code});
        st.coupons.unshift({code, percent: 10, maxUses: 1, used: 0, expires: new Date(Date.now() + 365*86400000).toISOString().slice(0,10), active: true, fromPoints: me.id});
        return {out: {ok:true, msg:'Đổi thành công! Mã giảm 10%: ' + code, code}};
      }
      return {out: {ok:false, msg:'Hành động không hợp lệ.'}};
    });
    return C.json(res, 200, out);
  }catch(e){
    return C.fail(res, 500, 'Lỗi server: ' + e.message);
  }
};

function pruneSessions(st){
  const now = C.nowMs();
  for(const k of Object.keys(st.sessions || {})) if(st.sessions[k].exp < now) delete st.sessions[k];
  if(Object.keys(st.sessions).length > 500){
    const keys = Object.keys(st.sessions).slice(0, 250);
    const keep = {};
    for(const k of keys) keep[k] = st.sessions[k];
    st.sessions = keep;
  }
}
function crypto2(n){ return require('crypto').randomBytes(3).toString('hex').toUpperCase().slice(0, n); }
function readBody(req, max){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if(size > max){ reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }catch(e){ resolve({}); } });
    req.on('error', reject);
  });
}
module.exports.readBody = readBody;
