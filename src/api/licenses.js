/* /api/licenses — tra cứu key công khai + BỘ HỢP ĐỒNG PLUGIN PREMIUM
   ---------------------------------------------------------------------
   26/11/2026 — nhánh web-v2-promote: Vercel Hobby chỉ cho 12 serverless
   functions (file này đã là 1 trong 12). Ba đường plugin của web chính
   vì vậy được REWRITE về đúng file này qua src/vercel.json:

     /api/license/activate   → /api/licenses?via=activate
     /api/license/heartbeat  → /api/licenses?via=heartbeat
     /api/verify-key         → /api/licenses?via=verifykey

  Plugin KHÔNG cần build lại: path, body, mã lý do, cấu trúc vé ký
   (Ed25519 + RSA-2048) đều GIỐNG HỆT web chính — thuật toán nằm ở
   _lib/license-contract.js (port 1:1 từ src/lib/license-server.ts +
   keys.ts của repo main, đối chiếu từng hằng số).
   Hợp đồng HTTP (giữ nguyên như v3.15.5 của web chính):
     · MỌI từ chối LOGIC license → HTTP 200 + {ok:false, reason:"…"}
     · Chỉ lỗi HẠ TẦNG → HTTP 500 {ok:false, reason:"LOI_SERVER"} (plugin
       coi status ≥400 là "mất kết nối" — phải giữ đúng). */
'use strict';
const C = require('./_lib/core.js');
const O = require('./_lib/ops.js');
const LC = require('./_lib/license-contract.js');

module.exports = async (req, res) => {
  const via = String(C.qOf(req).via || '');
  try{
    if(via === 'activate') return await handleActivate(req, res);
    if(via === 'heartbeat') return await handleHeartbeat(req, res);
    if(via === 'verifykey') return await handleVerifyKey(req, res);
    return await handleLookup(req, res);
  }catch(e){
    /* lỗi HẠ TẦNG → 500 đúng hợp đồng; logic-denial thì 200 ở từng handler */
    if(via === 'verifykey') return C.json(res, 500, {error: 'Lỗi kiểm key', detail: String(e).slice(0, 200)});
    if(via) return C.json(res, 500, {ok: false, reason: 'LOI_SERVER', detail: String(e).slice(0, 200)});
    return C.fail(res, 500, 'Lỗi tra cứu: ' + e.message);
  }
};

/* ================== shared (đọc license từ state doc v2) ================== */
/* Tìm license theo key: khớp PLAINTEXT trước (key cũ web chính giữ plaintext),
   sau đó khớp BĂM SHA-256 (key premium mới của web chính chỉ lưu băm — người
   dùng gõ key thô, server hash rồi so keyHash — y hệt findLicense của v1). */
function findLicRows(st, key){
  const k = String(key || '').trim().toUpperCase();
  if(!k) return [];
  const h = LC.keyHash(k);
  return (st.licenses || []).filter(l => (l.key && String(l.key).toUpperCase() === k) || (l.keyHash && l.keyHash === h));
}
function licRevoked(l){ return l.revoked === true || l.v1Status === 'revoked'; }
function licExpiry(l){
  const e = l.expires != null ? String(l.expires) : '';
  return /^\d{4}-\d{2}-\d{2}/.test(e) ? e.slice(0, 10) : '';
}
function licBuyer(st, l){
  if(l.buyer) return String(l.buyer);
  const u = l.userId ? (st.users || []).find(x => x.id === l.userId) : null;
  return u ? u.username : 'Khách VIP';
}
/* số ID license dùng trong vé (l) — bản migrate GIỮ NGUYÊN id v1 (vé đang tuần hành
   của khách không đổi nghĩa); key mới của v2 được cấp nid tuần tự lần đầu activate */
function ensureNid(st, l){
  if(l.nid) return Number(l.nid);
  if(l.v1Id){ l.nid = Number(l.v1Id); return l.nid; }
  let top = 1000;
  for(const x of (st.licenses || [])){
    top = Math.max(top, Number(x.nid) || 0, Number(x.v1Id) || 0);
  }
  st.nextLicNid = Math.max(Number(st.nextLicNid) || top, top);
  l.nid = ++st.nextLicNid;
  return l.nid;
}
function maskName(s){
  const t = String(s || '');
  if(t.length <= 2) return t + '***';
  return t.slice(0, 2) + '***';
}
function keyMaskOf(l){
  if(l.key) return LC.maskKey(l.key);
  const pfx = l.keyPrefix || 'DL';
  return pfx + '-****-' + (l.keyLast4 || '????');
}
function readBody(req, max){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if(size > max){ reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }catch(e){ resolve({}); } });
    req.on('error', reject);
  });
}

/* ================== 1) tra cứu công khai (act=lookup — giữ contract SPA) ================== */
async function handleLookup(req, res){
  let body = {};
  if(req.method === 'POST'){
    try{ body = await readBody(req, 4000); }catch(e){ return C.fail(res, 400, 'Body không hợp lệ.'); }
  }
  const act = body.act || C.qOf(req).act || '';
  if(act !== 'lookup') return C.fail(res, 400, 'Hành động không hợp lệ.');
  const key = String(body.key || '').trim().toUpperCase().replace(/\s+/g, '');
  /* LỆNH 24/11/2026: tra cứu phải nhận CẢ tiền tố cũ lẫn mới —
     · VIP: DL-... (không đổi)
     · FREE mới: DF-XXXX-XXXX (VD DF-A1B2-C3D9)
     · FREE cũ (v2 ban đầu): DF-FREE-0001 — vẫn tra được
     · FREE cũ nhất (web chính v1): FREE-XXXX-XXXX-XXXX — regex chấp nhận; key premium
       của web chính dạng DL-XXXX-XXXX-XXXX-XXXX cũng chấp nhận (tra bằng băm). */
  if(!/^(DL|DF|FREE)-[A-Z0-9][A-Z0-9.-]{5,48}$/.test(key)){
    return C.json(res, 200, {ok:false, found:false, msg:'Định dạng key không hợp lệ — VIP bắt đầu bằng DL- (VD: DL-VIP-9F2K-8817), bản FREE bắt đầu bằng DF- (VD: DF-A1B2-C3D9) hoặc FREE- (key cũ web chính).'});
  }
  const st = await C.getState();
  const lic = findLicRows(st, key)[0];
  if(!lic){
    if(key.startsWith('FREE-')){
      return C.json(res, 200, {ok:true, found:false, otherSystem:true,
        msg:'Key "FREE-" là key cũ của WEB CHÍNH (hệ thống v1) — không nằm trong dữ liệu web v2 này. Key cũ vẫn còn hiệu lực như trước, không bị ảnh hưởng. Để tra trạng thái chính xác, tra cứu tại web chính: dau-la-dai-luc-livid.vercel.app/kiem-tra.'});
    }
    return C.json(res, 200, {ok:true, found:false, msg:'Không tìm thấy key này trong hệ thống (kiểm tra lại chính tả — VIP dạng DL-VIP-9F2K-8817, FREE dạng DF-A1B2-C3D9).'});
  }
  const valid = !licRevoked(lic) && (!lic.expires || new Date(lic.expires + 'T23:59:59+07:00').getTime() >= Date.now());
  const daysLeft = lic.expires ? Math.ceil((new Date(lic.expires + 'T23:59:59+07:00').getTime() - Date.now()) / 86400000) : null;
  return C.json(res, 200, {
    ok: true,
    found: true,
    key: keyMaskOf(lic),
    package: lic.package || lic.tierLabel || 'License',
    expires: lic.expires || null,
    daysLeft,
    status: licRevoked(lic) ? 'Đã thu hồi' : (valid ? (lic.expires ? (daysLeft <= 14 ? 'Còn hạn — sắp hết hạn' : 'Còn hạn') : 'Vĩnh viễn') : 'Hết hạn'),
    valid,
    servers: (lic.servers || []).length,
    maxServers: lic.maxServers || 0,
    assigned: !!lic.userId
  });
}

/* ================== 2) /api/license/activate ================== */
async function handleActivate(req, res){
  let body = {};
  try{ body = await readBody(req, 4000); }catch(e){ body = {}; }
  const key = String(body.key || '').trim();
  const hwid = String(body.hwid || '').trim().slice(0, 40);
  const nonce = String(body.nonce || '').trim().slice(0, 64);
  if(!key) return C.json(res, 200, {ok: false, reason: 'KEY_TRONG'});
  if(!hwid) return C.json(res, 200, {ok: false, reason: 'THIEU_HWID'});
  /* key bản thường không dùng cho Premium (FREE- của web chính + DF- của web v2) */
  const kUp = key.toUpperCase();
  if(kUp.startsWith('FREE-') || kUp.startsWith('DF-')) return C.json(res, 200, {ok: false, reason: 'KEY_BAN_THUONG'});
  /* key định dạng cũ (payload.chữ-ký HMAC) đã ngừng cấp vé */
  if(key.includes('.')) return C.json(res, 200, {ok: false, reason: 'KEY_DANG_CU'});
  /* v3.5.0 — chống dò key: khóa thử 10 lần lỗi/15 phút */
  const knorm = kUp;
  if(LC.keyRateLimited(knorm)) return C.json(res, 200, {ok: false, reason: 'QUA_NHIEU_LOI_THU', detail: 'Thu lai sau 15 phut'});
  const isMaster = LC.MASTER_KEYS.includes(knorm);

  const st0 = await C.getState();
  const lic0 = findLicRows(st0, key)[0] || null;
  if(!lic0 && !isMaster){
    LC.noteKeyFail(knorm);
    return C.json(res, 200, {ok: false, reason: 'KEY_KHONG_TON_TAI'});
  }
  if(lic0 && licRevoked(lic0)){
    LC.noteKeyFail(knorm);
    return C.json(res, 200, {ok: false, reason: 'KEY_DA_THU_HOI'});
  }
  let expiry0 = lic0 ? licExpiry(lic0) : LC.LIFETIME;
  if(!expiry0) expiry0 = LC.LIFETIME;   /* license không ghi hạn (key vĩnh viễn v2) */
  const lifetime0 = isMaster || expiry0 === LC.LIFETIME;
  if(!lifetime0 && LC.isExpired(expiry0)){
    LC.noteKeyFail(knorm);
    return C.json(res, 200, {ok: false, reason: 'KEY_HET_HAN', expires_at: expiry0});
  }

  /* bind/đổi máy: GIỮ NGUYÊN logic v1 — bound = server_id ?? fingerprint,
     cửa sổ 30 ngày reset lượt, đổi máy tối đa REBIND_LIMIT lần.
     GHI CHỈ KHI CẦN (bên v1: UPDATE chỉ khi bind lần đầu/đổi máy/wm lệch —
     còn lại chỉ đọc và ký vé, không đụng DB). */
  const bound0 = lic0 ? (lic0.serverId || lic0.fingerprint || null) : null;
  const changedAt0 = lic0 && lic0.serverChangedAt ? new Date(lic0.serverChangedAt) : null;
  let changes0 = lic0 ? Number(lic0.serverChanges || 0) : 0;
  if(changedAt0 && Date.now() - changedAt0.getTime() > 30 * 24 * 3600e3) changes0 = 0;
  /* đổi máy quá lượt → TỪ CHỐI TRƯỚC, không ghi gì (đúng v1) */
  if(lic0 && !isMaster && bound0 && bound0 !== hwid && changes0 >= LC.REBIND_LIMIT){
    return C.json(res, 200, {ok: false, reason: 'DOI_MAY_HET_LUOT', detail: 'Da doi ' + changes0 + '/' + LC.REBIND_LIMIT + ' lan trong 30 ngay'});
  }
  const needBind = !!lic0 && !isMaster && !bound0;
  const needRebind = !!lic0 && !isMaster && bound0 && bound0 !== hwid;
  const needNid = !!lic0 && !lic0.nid;
  const nid0 = lic0 && !isMaster ? (Number(lic0.nid) || Number(lic0.v1Id) || 0) : 0;
  const wm0 = nid0 > 0 ? LC.wmForLicense(nid0) : 0;
  const needWm = nid0 > 0 && Number(lic0.wm || 0) !== wm0;

  let lic = lic0, expiry = expiry0, lifetime = lifetime0;
  if(needBind || needRebind || needNid || needWm){
    /* CAS ghi qua kho v2 — bên trong áp dụng ĐÚNG logic bind của v1 */
    await C.withState(async st => {
      const l2 = findLicRows(st, key)[0];
      if(!l2) return;
      const b2 = l2.serverId || l2.fingerprint || null;
      const ca2 = l2.serverChangedAt ? new Date(l2.serverChangedAt) : null;
      let ch2 = Number(l2.serverChanges || 0);
      if(ca2 && Date.now() - ca2.getTime() > 30 * 24 * 3600e3) ch2 = 0;
      if(!b2){
        l2.serverId = hwid; l2.serverChangedAt = new Date().toISOString(); l2.serverChanges = 0;
        if(!l2.fingerprint) l2.fingerprint = hwid;
      }else if(b2 !== hwid && ch2 < LC.REBIND_LIMIT){
        l2.serverId = hwid; l2.serverChangedAt = new Date().toISOString(); l2.serverChanges = ch2 + 1; l2.fingerprint = hwid;
      }
      const nid = ensureNid(st, l2);
      const wm = LC.wmForLicense(nid);
      if(Number(l2.wm || 0) !== wm) l2.wm = wm;
      /* hiển thị v2: danh sách server đang bind */
      l2.servers = Array.isArray(l2.servers) ? l2.servers : [];
      if(!l2.servers.some(s => s.ip === hwid)) l2.servers.push({ip: hwid, lastSeen: C.vnStr()});
      l2.lastSeenAt = C.vnStr();
      lic = l2; expiry = licExpiry(l2) || LC.LIFETIME;
      lifetime = isMaster || expiry === LC.LIFETIME;
    });
  }
  const licId = lic && !isMaster ? (Number(lic.nid) || Number(lic.v1Id) || ensureNidSync(lic)) : 0;
  const buyer = lic ? licBuyer(st0, lic) : 'Chủ Shop';
  const wm = licId > 0 ? LC.wmForLicense(licId) : 0;
  const issuedAt = Date.now();
  const session = LC.signSession({
    l: licId,
    n: String(buyer).slice(0, 40),
    e: lifetime ? LC.LIFETIME : String(expiry),
    f: hwid,
    s: issuedAt,
    d: LC.SESSION_MINUTES,
    g: LC.GRACE_HOURS,
    pb: LC.premiumBlobB64(),
    w: wm || undefined,
    v: 3,
    i: issuedAt,
    c: nonce || undefined,
    kh: isMaster ? undefined : LC.keyHash(key).slice(0, 16),
  });
  LC.keyNoteOk(knorm);
  return C.json(res, 200, {
    ok: true, session, rs: LC.rsaSignSession(session), nonce, expires_at: expiry, lifetime,
    ticket_minutes: LC.SESSION_MINUTES, grace_hours: LC.GRACE_HOURS,
    wm,
  });
}
function ensureNidSync(lic){ return Number(lic.v1Id) || Number(lic.nid) || 1; }

/* ================== 3) /api/license/heartbeat ================== */
async function handleHeartbeat(req, res){
  /* FIX 26/11 (bắt được bằng E2E trên Postgres thật): vé chứa blob premium
     premium-profile.json (~5KB JSON → ~7,2KB base64url) — cap 4KB của body
     làm MỌI heartbeat thật bị TICKET_TRONG. Trần an toàn 64KB (vé ~7,2KB
     + tm ≤300 + dự phòng). */
  let body = {};
  try{ body = await readBody(req, 65536); }catch(e){ body = {}; }
  const ticket = String(body.ticket || '').trim();
  const hwid = String(body.hwid || '').trim().slice(0, 40);
  const tm = String(body.tm || '').trim().slice(0, 300);
  const wmIn = Number(body.wm != null ? body.wm : 0);
  /* v3.15.5 — thiếu trường trả 200 (status ≥400 = mất kết nối với plugin) */
  if(!ticket) return C.json(res, 200, {ok: false, reason: 'TICKET_TRONG'});
  if(!ticket.includes('.')) return C.json(res, 200, {ok: false, reason: 'TICKET_KHONG_HOP_LE'});
  const s = LC.verifySession(ticket);
  if(!s) return C.json(res, 200, {ok: false, reason: 'TICKET_KHONG_HOP_LE'});

  /* 1) kill switch — ưu tiên cao nhất */
  let expiry = s.e;
  let lic = null;
  let boundServerId = null;
  const st = await C.getState();
  if(s.l > 0){
    lic = (st.licenses || []).find(x => Number(x.nid || x.v1Id || 0) === s.l) || null;
    if(!lic) return C.json(res, 200, {ok: false, reason: 'KEY_KHONG_TON_TAI'});
    if(licRevoked(lic)) return C.json(res, 200, {ok: false, reason: 'KEY_DA_THU_HOI'});
    expiry = licExpiry(lic) || LC.LIFETIME;
    boundServerId = lic.serverId || lic.fingerprint || null;
  }
  if(expiry !== LC.LIFETIME && LC.isExpired(expiry)) return C.json(res, 200, {ok: false, reason: 'KEY_HET_HAN'});
  /* 2) vé quá tuổi thọ ngắn hạn → plugin tự kích hoạt lại */
  if(LC.isTicketStale(s)) return C.json(res, 200, {ok: false, reason: 'TICKET_HET_HAN'});
  /* 3) máy: vé phải khớp hwid gửi kèm + khớp server đã bind */
  if(hwid && s.f && hwid !== s.f) return C.json(res, 200, {ok: false, reason: 'KEY_GAN_MAY_KHAC'});
  if(boundServerId && s.f && boundServerId !== s.f) return C.json(res, 200, {ok: false, reason: 'KEY_GAN_MAY_KHAC'});

  /* 4) v3.0.1 — TELEMETRY ÂM THẦM: chỉ GHI kho khi có dấu vết bất thường
     (bên v1 INSERT mỗi nhịp — bản v2 tiết kiệm quota: thường-giờ không ghi) */
  let flags = [];
  if(s.l > 0 && lic){
    const licWm = Number(lic.wm || 0);
    if(tm){
      const parts = tm.split('|');
      const tPrint = parts[4] || '', mPrint = parts[5] || '', licPrint = parts[6] || '';
      const agentN = Number(parts[1] || 0);
      const dbg = parts[2] === '1';
      const expect = LC.buildHashes();
      if(expect.t && tPrint && tPrint !== '-' && tPrint !== expect.t.slice(0, 16)) flags.push('T_HASH_LECH');
      if(expect.m && mPrint && mPrint !== '-' && mPrint !== expect.m.slice(0, 16)) flags.push('M_HASH_LECH');
      const bcEnv = LC.licenseClassHashes();
      if(bcEnv && licPrint && licPrint !== '-'){
        const want = bcEnv.split(',').map(x => (x.split(':')[1] || '').slice(0, 16));
        const got = licPrint.split(',');
        if(want.some((w, i) => w && got[i] && got[i] !== '-' && got[i] !== w)) flags.push('LIC_CLASS_LECH');
      }
      if(agentN > 0) flags.push('AGENT_' + agentN);
      if(dbg) flags.push('DEBUG');
    }
    const wmMatch = wmIn > 0 ? (licWm > 0 ? wmIn === licWm : null) : null;
    const wmSai = wmMatch === false;
    if(wmSai) flags.push('WM_SAI(' + wmIn + '≠' + licWm + ')');
    if(flags.length){
      try{
        await C.withState(st2 => {
          const l2 = (st2.licenses || []).find(x => Number(x.nid || x.v1Id || 0) === s.l);
          if(!l2) return;
          st2.telemetry = st2.telemetry || [];
          st2.telemetry.unshift({at: C.vnStr(), licenseId: s.l, hwid, tm: tm.slice(0, 300), wm: wmIn, wmMatch, flags: flags.join(',').slice(0, 200)});
          if(st2.telemetry.length > 200) st2.telemetry.length = 200;
          if(wmSai && !l2.suspicious){ l2.suspicious = true; l2.suspiciousWhy = 'wm heartbeat sai — khả năng chia sẻ key / vé chép tay'; }
          else if((flags.includes('T_HASH_LECH') || flags.includes('M_HASH_LECH') || flags.includes('LIC_CLASS_LECH')) && !l2.suspicious){
            l2.suspicious = true; l2.suspiciousWhy = 'vân tay T/M/class license lệch build — jar đã bị sửa';
          }
        });
      }catch(e){ /* không bao giờ để telemetry làm hỏng heartbeat */ }
    }
  }

  const session = LC.signSession({
    l: s.l,
    n: s.n,
    e: expiry,
    f: s.f,
    s: Date.now(),
    d: LC.SESSION_MINUTES,
    g: LC.GRACE_HOURS,
    pb: LC.premiumBlobB64(),
    w: s.w,
    v: 3,
  });
  /* v3.2 — bc = hash BUILD class license; plugin re-hash runtime và so ngầm */
  const bc = LC.licenseClassHashes();
  const resp = {
    ok: true, session, rs: LC.rsaSignSession(session), expires_at: expiry,
    lifetime: expiry === LC.LIFETIME,
    ticket_minutes: LC.SESSION_MINUTES, grace_hours: LC.GRACE_HOURS,
  };
  if(bc) resp.bc = bc;
  return C.json(res, 200, resp);
}

/* ================== 4) /api/verify-key ================== */
async function handleVerifyKey(req, res){
  let key = '';
  if(req.method === 'POST'){
    const b = await readBody(req, 4000).catch(() => ({}));
    key = String(b.key || '');
  }else{
    key = String(C.qOf(req).key || '');
  }
  if(!key.trim()) return C.json(res, 200, {valid: false, reason: 'KEY_TRONG'});
  const st = await C.getState();
  return C.json(res, 200, verifyKeyState(st, key));
}
function verifyKeyState(st, key){
  const k = String(key).trim().toUpperCase();
  /* ---- nhánh KEY BẢN THƯỜNG (FREE-…) — quà đăng ký tài khoản web chính ---- */
  if(k.startsWith('FREE-')){
    if(!LC.FREE_KEY_RE.test(k)) return {valid: false, reason: 'KEY_SAI_DINH_DANG'};
    const lic = findLicRows(st, k)[0];
    if(!lic) return {valid: false, reason: 'KEY_KHONG_TON_TAI'};
    if(licRevoked(lic)) return {valid: false, reason: 'KEY_DA_THU_HOI'};
    return {
      valid: true,
      plan: lic.package || 'BẢN THƯỜNG (FREE)',
      expires_at: null,
      lifetime: true,
      holder: maskName(licBuyer(st, lic) || 'thành viên'),
    };
  }
  /* ---- nhánh KEY SHOP v2.3 (DL-XXXX-XXXX-XXXX-XXXX) — hạn nằm trong DB/licence ---- */
  if(LC.SHOP_KEY_RE.test(k)){
    const lic = findLicRows(st, k)[0];
    if(!lic) return {valid: false, reason: 'KEY_KHONG_TON_TAI'};
    if(licRevoked(lic)) return {valid: false, reason: 'KEY_DA_THU_HOI'};
    const exp = licExpiry(lic);
    if(LC.isExpired(exp == null ? null : exp)) return {valid: false, reason: 'KEY_HET_HAN', expires_at: exp.slice(0, 10)};
    return {
      valid: true,
      plan: lic.package || 'PREMIUM',
      expires_at: exp.slice(0, 10),
      lifetime: exp.slice(0, 10) === '2275-12-31',
      holder: maskName(licBuyer(st, lic) || 'Khách VIP'),
    };
  }
  /* ---- key định dạng cũ (24 ký tự base32 / payload.chữ-ký HMAC) ---- */
  const d = LC.decodeAny(key);
  if(!d.ok) return {valid: false, reason: d.reason};
  if(!d.dotted && LC.isMasterKey(key)) return {valid: true, plan: 'KEY CHỦ — vĩnh viễn', expires_at: d.expiry, lifetime: true, holder: 'Chủ Shop'};
  const lic = findLicRows(st, String(key).trim())[0];
  if(lic && licRevoked(lic)) return {valid: false, reason: 'KEY_DA_THU_HOI'};
  if(d.expired) return {valid: false, reason: 'KEY_HET_HAN', expires_at: d.expiry};
  const holder = lic ? licBuyer(st, lic) : null;
  return {
    valid: true,
    plan: (lic && (lic.package || lic.tierLabel)) || 'PREMIUM',
    expires_at: d.expiry,
    lifetime: d.lifetime,
    holder: holder ? maskName(holder) : maskName(d.name || '(ngoài sổ)'),
  };
}
