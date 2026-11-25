/* Đấu La Đại Lục — core server lib (store Blob, auth, util) */
'use strict';
const crypto = require('crypto');

/* ---------- util ---------- */
function json(res, code, obj){
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}
function ok(res, obj){ json(res, 200, Object.assign({ok:true}, obj||{})); }
function fail(res, code, msg, extra){ json(res, code, Object.assign({ok:false, msg:String(msg||'Lỗi không xác định')}, extra||{})); }
function uid(p){ return p + '-' + crypto.randomBytes(3).toString('hex').toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase(); }
function nowMs(){ return Date.now(); }
function isoDate(ms){ const d = new Date(ms || nowMs()); return d.toISOString().slice(0,10); }
function vnNow(){ const d = new Date(); return new Date(d.getTime() + 7*3600*1000); }
function vnDate(){ return vnNow().toISOString().slice(0,10); }
function vnStr(){
  const d = vnNow(); const p = n => String(n).padStart(2,'0');
  return d.toISOString().slice(0,10) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function nowStr(){ return vnStr(); }
function clampInt(v, min, max, def){
  v = Math.round(Number(v));
  if(!isFinite(v)) v = def === undefined ? min : def;
  return Math.min(max, Math.max(min, v));
}
function cleanStr(s, max){
  return String(s == null ? '' : s).trim().slice(0, max || 500);
}

/* ---------- kho dữ liệu: POSTGRES hoặc BLOB (chọn TỰ ĐỘNG theo env) ----------
   25/11/2026 — SỬA GỐC RỄ QUOTA BLOB (store daula-shop bị suspend vì vượt
   "Advanced Operations" 2,2k/2k của gói Hobby):
   · Kiến trúc CŨ: mỗi lần ĐỌC state = LIST + GET, mỗi lần GHI = LIST + PUT + LIST (+DELETE dọn) —
     LIST/DELETE tính Advanced ops, quota 2k/tháng → vài chục thao tác test là treo store.
   · Chế độ POSTGRES (mới — ưu tiên nếu có DATABASE_URL): state nằm 1 dòng jsonb trong schema
     `v2beta` (RIÊNG TUYỆT với schema public của web chính — mọi câu lệnh đều gọi bảng đủ tên
     `v2beta.*`, không bao giờ đụng dữ liệu Production). File jar/ảnh lưu bytea cùng schema.
   · Chế độ BLOB (mới — không có DATABASE_URL): state nằm 1 pathname CỐ ĐỊNH db/state.json:
     ĐỌC = GET qua CDN (miễn phí, không tính op), GHI = 1 PUT (Simple op). KHÔNG LIST, không
     tự DELETE → không bao giờ chạm Advanced ops; quota 10k Simple ops/tháng ≈ 300 ghi/ngày. */
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
const STATE_PATH = 'db/daula-state-v1.json';
const BLOB_API = process.env.BLOB_API_BASE || 'https://blob.vercel-storage.com';
const DRIVER = (/^postgres(ql)?:\/\//.test(String(process.env.DATABASE_URL || ''))) ? 'postgres' : 'blob';
const pg = DRIVER === 'postgres' ? require('./pg.js') : null;
if(pg) pg.init(process.env.DATABASE_URL);

/* FIX 24/11/2026 — NGUYÊN NHÂN TRANG TRẮNG (chẩn đoán trên BETA thật): fetch() trần đến
   Blob đôi khi treo vĩnh viễn (network stall) → lambda không bao giờ trả response →
   /api/state treo → SPA đợi fetchState mãi → body trắng, chỉ còn footer tĩnh.
   MỌI fetch đến Blob từ giờ đều có AbortController timeout. */
function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }
function fetchT(url, opts, ms){
  const ac = new AbortController();
  /* FIX 25/11: abort kèm LÝ DO TIẾNG VIỆT — khách thấy "Kho dữ liệu không phản hồi trong 3500ms"
     thay vì "This operation was aborted" khó hiểu (đã thấy trên BETA thật). */
  const timer = setTimeout(() => ac.abort(new Error('Kho dữ liệu không phản hồi trong ' + (ms || 5000) + 'ms — thử lại sau ít phút')), ms || 5000);
  return fetch(url, Object.assign({}, opts, {signal: ac.signal})).finally(() => clearTimeout(timer));
}
const BLOB_TIMEOUT = 3500;

async function blobFetch(path, opts){
  const r = await fetchT(BLOB_API + path, Object.assign({}, opts, {
    headers: Object.assign({}, (opts && opts.headers) || {}, {authorization: 'Bearer ' + BLOB_TOKEN})
  }), BLOB_TIMEOUT);
  return r;
}

/* ============ CHẾ ĐỘ POSTGRES (schema v2beta) ============ */
function validState(st){
  return st && Array.isArray(st.users) && st.settings && st.settings.adminGate;
}
async function pgEnsure(){ await pg.ensureSchema(); }
/* migrate 1 lần: nếu bảng state trống → thử đọc state cũ trên Blob (best effort 1 lần/instance) */
let _pgMigrated = false;
async function pgGetState(){
  await pgEnsure();
  const r = await pg.query('SELECT doc FROM v2beta.state WHERE id = 1', []);
  if(r.rows.length){
    const doc = typeof r.rows[0].doc === 'string' ? JSON.parse(r.rows[0].doc) : r.rows[0].doc;   /* jsonb về dạng text */
    if(validState(doc)) return doc;
  }
  if(!_pgMigrated){
    _pgMigrated = true;
    try{
      const leg = await blobLegacyReadLatest();
      if(leg && validState(leg.st)){
        await pg.query('INSERT INTO v2beta.state (id, doc, rev) VALUES (1, $1::jsonb, $2) ON CONFLICT (id) DO NOTHING',
          [JSON.stringify(leg.st), String(Math.max(1, leg.st.rev || leg.rev || 1))]);
        return leg.st;
      }
    }catch(e){ /* Blob đang suspend / không có state cũ — dùng seed */ }
  }
  const st = seedState();
  st.rev = 1;
  await pg.query('INSERT INTO v2beta.state (id, doc, rev) VALUES (1, $1::jsonb, 1) ON CONFLICT (id) DO NOTHING', [JSON.stringify(st)]);
  const r2 = await pg.query('SELECT doc FROM v2beta.state WHERE id = 1', []);
  if(r2.rows.length){ const d2 = typeof r2.rows[0].doc === 'string' ? JSON.parse(r2.rows[0].doc) : r2.rows[0].doc; if(validState(d2)) return d2; }
  return st;
}
async function pgWithState(mutator, tries){
  await pgEnsure();
  const n = tries || 6;
  for(let i = 0; i < n; i++){
    const base = await pg.query('SELECT doc, rev FROM v2beta.state WHERE id = 1', []);
    let st, rev;
    if(base.rows.length){
      st = typeof base.rows[0].doc === 'string' ? JSON.parse(base.rows[0].doc) : base.rows[0].doc;
      rev = Number(base.rows[0].rev) || 1;
    }
    if(st && validState(st)){ /* dùng st, rev */ }
    else{
      st = await pgGetState(); rev = Math.max(1, st.rev || 1);
    }
    const result = await mutator(st);
    const next = (result && result.next) ? result.next : st;
    next.rev = rev + 1;
    const upd = await pg.query('UPDATE v2beta.state SET doc = $1::jsonb, rev = $2, updated = now() WHERE id = 1 AND rev = $3',
      [JSON.stringify(next), String(rev + 1), String(rev)]);
    if(upd.rowCount >= 1) return (result && result.out !== undefined) ? result.out : {state: next};
    /* có người ghi song song — làm lại từ bản mới nhất */
  }
  throw new Error('Kho dữ liệu bận — thử lại sau vài giây.');
}
async function pgPutFileRaw(path, buf, contentType){
  await pgEnsure();
  await pg.query('INSERT INTO v2beta.files (path, data, ctype, size, updated) VALUES ($1, $2, $3, $4, now()) ' +
    'ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, ctype = EXCLUDED.ctype, size = EXCLUDED.size, updated = now()',
    [path, buf, contentType || 'application/octet-stream', String(buf.length)]);
  return '/api/download?p=' + encodeURIComponent(path);
}
async function pgGetRawByPath(path, ms){
  await pgEnsure();
  const r = await pg.query('SELECT data, ctype FROM v2beta.files WHERE path = $1', [path]);
  if(!r.rows.length) throw new Error('File không tồn tại: ' + path);
  return r.rows[0].data;
}
async function pgDeleteRaw(path){
  await pgEnsure();
  await pg.query('DELETE FROM v2beta.files WHERE path = $1', [path]);
  return true;
}
async function pgListRaw(prefix){
  await pgEnsure();
  const r = await pg.query('SELECT path FROM v2beta.files WHERE path LIKE $1 ORDER BY path', [prefix.replace(/[%_]/g, '\\$&') + '%']);
  return r.rows.map(x => x.path);
}

/* ============ CHẾ ĐỘ BLOB — chỉ Simple ops (PUT/GET), KHÔNG LIST ============ */
const STATE_FIXED = 'db/state.json';
let _legacyChecked = false;
/* chỉ dùng cho MIGRATE 1 lần khi db/state.json chưa tồn tại — đọc state cũ kiểu pathname-đuổi */
async function blobLegacyReadLatest(){
  const revs = await listRevs();
  /* FIX 25/11: chỉ quét TỐI ĐA 3 bản MỚI NHẤT, mỗi bản GET đúng 1 lần — quét TOÀN BỘ danh sách
     (mỗi file tới ~10,5s khi kho treo) là nguyên nhân /api/state treo nhiều phút → trang trắng
     (xác nhận trên BETA thật 25/11). Hàm này chỉ chạy 1 lần/instance để migrate, nhưng vẫn phải có trần. */
  const top = revs.slice(-3);
  for(let i = top.length - 1; i >= 0; i--){
    try{
      const st = await fetchUrl(top[i].url, 1);
      if(validState(st)) return {st, rev: Math.max(1, st.rev || top[i].key % 1e8)};
    }catch(e){ /* file này chưa propagate / bị mất — thử file liền dưới */ }
  }
  return null;
}
async function blobGetFixed(tries){
  const busted = BLOB_API + '/' + STATE_FIXED + '?r=' + nowMs() + crypto.randomBytes(4).toString('hex');
  const n = tries || 2;
  let lastErr = null;
  for(let i = 0; i < n; i++){
    try{
      const r = await fetchT(busted, undefined, BLOB_TIMEOUT);
      if(r.ok) return JSON.parse(await r.text());
      if(r.status === 404 || r.status === 410) return null;
      lastErr = new Error('Blob GET state -> ' + r.status);
    }catch(e){ lastErr = e; }
    await sleep(300 * (i + 1));
  }
  throw lastErr || new Error('Blob GET state thất bại');
}
async function blobPutFixed(doc){
  const r = await blobFetch('/' + STATE_FIXED, {
    method: 'PUT',
    headers: {'x-add-random-suffix': '0', 'x-content-type': 'application/json'},
    body: JSON.stringify(doc)
  });
  if(!r.ok) throw new Error('Blob PUT state -> ' + r.status);
  return true;
}
/* đọc state KHÔNG ghi — sort key cho file state kiểu legacy (state-r00NN / state-<ms><rand>) */
const STATE_DIR = 'db';
function stateKey(pathname){
  let m = pathname.match(/state-r(\d+)\.json$/);
  if(m) return parseInt(m[1], 10);
  m = pathname.match(/state-(\d{13})[a-f0-9]*\.json$/);
  if(m) return 1e15 + parseInt(m[1], 10);
  return -1;
}
async function listRevs(){
  let lastErr = null;
  for(let i = 0; i < 2; i++){
    try{
      const r = await fetchT(BLOB_API + '?limit=100&prefix=' + encodeURIComponent(STATE_DIR + '/state'), {
        headers: {authorization: 'Bearer ' + BLOB_TOKEN}
      }, BLOB_TIMEOUT);
      if(!r.ok) throw new Error('Blob list ' + r.status);
      const d = await r.json();
      const out = [];
      for(const b of (d.blobs || [])){
        const k = stateKey(b.pathname || '');
        if(k >= 0) out.push({key: k, url: b.url});
      }
      out.sort((a, b) => a.key - b.key);
      return out;
    }catch(e){ lastErr = e; await sleep(350 * (i + 1)); }
  }
  throw lastErr || new Error('Blob list thất bại');
}
async function fetchUrl(url, tries){
  /* cache-buster: query là 1 phần của cache key CDN — query mới = MISS = luôn đọc origin */
  const busted = url + (url.includes('?') ? '&' : '?') + 'r=' + nowMs() + crypto.randomBytes(3).toString('hex');
  const n = tries || 3;
  let lastErr = null;
  for(let i = 0; i < n; i++){
    try{
      const r = await fetchT(busted, undefined, BLOB_TIMEOUT);
      if(r.ok) return JSON.parse(await r.text());
      lastErr = new Error('Blob GET ' + url.slice(-30) + ' -> ' + r.status);
      if(r.status !== 404 && r.status !== 410) throw lastErr;
    }catch(e){ lastErr = e; }
    await sleep(350 * (i + 1));
  }
  throw lastErr || new Error('Blob GET thất bại');
}
async function blobReadLatestState(){
  let err1 = null, err2 = null, leg = null;
  let fixed = null;
  try{ fixed = await blobGetFixed(); }catch(e){ err1 = e; }
  if(fixed && validState(fixed)) return {st: fixed, rev: Math.max(1, fixed.rev || 1)};
  /* migrate legacy — chỉ dò LIST đúng 1 lần mỗi instance (tránh đốt quota Advanced ops) */
  if(!_legacyChecked){
    _legacyChecked = true;
    try{
      leg = await blobLegacyReadLatest();
      if(leg && validState(leg.st)){
        try{ await blobPutFixed(leg.st); }catch(e){ /* migrate sang fixed-path lỗi (vd store khóa GHI) — vẫn dùng state thật */ }
        return leg;
      }
    }catch(e){ err2 = e; /* store suspend / chưa có state cũ */ }
  }
  /* 25/11/2026: nếu KHÔNG đọc được state vì LỖI KHO (vd store bị khóa quota) → NÉM để
     /api/state trả cờ degraded (banner bảo trì) — KHÔNG trả seed lặng lẽ làm khách tưởng chạy bình thường */
  if(!leg && (err1 || err2)) throw (err1 || err2);
  return null;
}
async function getState(){
  if(DRIVER === 'postgres') return pgGetState();
  const r = await blobReadLatestState();
  return r ? r.st : seedState();
}
/* state doc CAS: đọc bản mới nhất -> mutate -> ghi -> xác nhận rev của mình còn ở top */
async function withState(mutator, tries){
  if(DRIVER === 'postgres') return pgWithState(mutator, tries);
  const n = tries || 5;
  for(let i = 0; i < n; i++){
    const base = await blobReadLatestState();
    const st = base && validState(base.st) ? base.st : seedState();
    const rev = base ? base.rev : 0;
    const result = await mutator(st);
    const next = (result && result.next) ? result.next : st;
    next.rev = rev + 1;
    try{
      await blobPutFixed(next);
    }catch(e){
      /* 25/11/2026: store khóa GHI (quota Vercel) hoặc stall — ném lỗi TIẾNG VIỆT RÕ, KHÔNG retry
         (retry chỉ dành cho xung đột rev sau khi PUT thành công — thấy ở bước xác nhận bên dưới) */
      if(/403|suspended/i.test(e.message)) throw new Error('Kho dữ liệu đang bị KHÓA GHI theo quota Vercel (Blob store tự mở lại 24/12/2026). Vui lòng thử lại sau hoặc liên hệ admin.');
      throw new Error('Kho dữ liệu tạm thời không ghi được (' + String(e.message).slice(0, 60) + ') — thử lại sau vài giây.');
    }
    /* xác nhận: đọc lại — rev của mình còn top thì xong; người khác ghi đè giữa chừng thì làm lại */
    try{
      const back = await blobGetFixed(1);
      if(back && back.rev === next.rev) return (result && result.out !== undefined) ? result.out : {state: next};
    }catch(e){ return (result && result.out !== undefined) ? result.out : {state: next}; }
  }
  throw new Error('Kho dữ liệu bận — thử lại sau vài giây.');
}

/* ---------- FILE (jar / ảnh đại diện / đính kèm) — dispatch theo DRIVER ---------- */
async function blobPut(pathname, data, contentType){
  if(DRIVER === 'postgres'){
    const url = await pgPutFileRaw(pathname, data, contentType);
    return {downloadUrl: url, url};
  }
  const r = await blobFetch('/' + pathname, {
    method: 'PUT',
    headers: {
      'x-add-random-suffix': '0',
      'x-content-type': contentType || 'application/octet-stream'
    },
    body: data
  });
  if(!r.ok){ throw new Error('Blob PUT ' + pathname + ' -> ' + r.status); }
  return r.json();
}
async function blobDelete(pathname){
  if(DRIVER === 'postgres'){ try{ return await pgDeleteRaw(pathname); }catch(e){ return false; } }
  try{
    const r = await blobFetch('/' + pathname, {method: 'DELETE'});
    return r.ok;
  }catch(e){ return false; }
}
/* liệt kê theo prefix (jar-done dùng số phần do client khai báo nên không cần LIST trong luồng chính;
   hàm này vẫn giữ cho kiểm tra hành chính/legacy) */
async function blobList(prefix){
  if(DRIVER === 'postgres'){
    const paths = await pgListRaw(prefix);
    return paths.map(p => ({pathname: p, url: '/api/file?p=' + encodeURIComponent(p)}));
  }
  const r = await fetchT(BLOB_API + '?limit=100&prefix=' + encodeURIComponent(prefix), {headers: {authorization: 'Bearer ' + BLOB_TOKEN}}, BLOB_TIMEOUT * 2);
  if(!r.ok) throw new Error('Blob list ' + r.status);
  return (await r.json()).blobs || [];
}
/* đọc 1 blob trả về Buffer NHỊ PHÂN (không JSON.parse — dùng cho part/ảnh/jar)
   Nhận 3 dạng: pathname, URL '/api/file?p=…' (postgres), hoặc URL Blob đầy đủ (state cũ sau migrate) */
async function blobGetRaw(pathOrUrl, ms){
  const s = String(pathOrUrl || '');
  if(DRIVER === 'postgres'){
    const m = /[?&]p=([^&]+)/.exec(s);
    if(s.indexOf('/api/download?p=') === 0 && m){ return pgGetRawByPath(decodeURIComponent(m[1]), ms); }
    if(s.indexOf('/api/file?p=') === 0 && m){ return pgGetRawByPath(decodeURIComponent(m[1]), ms); }   /* tên URL cũ */
    if(s.startsWith('http')){
      /* file cũ còn trỏ URL Blob công khai (state legacy) — đọc xuyên qua */
      const r = await fetchT(s, undefined, ms || 30000);
      if(!r.ok) throw new Error('GET ' + s.slice(-40) + ' -> ' + r.status);
      return Buffer.from(await r.arrayBuffer());
    }
    return pgGetRawByPath(s, ms);
  }
  const url = s.startsWith('http') ? s : BLOB_API + '/' + s;
  const r = await fetchT(url, {headers: {authorization: 'Bearer ' + BLOB_TOKEN}}, ms || 30000);
  if(!r.ok) throw new Error('Blob GET ' + s.slice(-40) + ' -> ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
function qLookup(url, key){
  try{ return new URL(url, 'http://x').searchParams.get(key) || ''; }catch(e){ return ''; }
}
/* file plugin / tài liệu đính kèm — trả {fileKey, fileUrl, fileName, fileSize} theo driver */
async function putFile(productId, fileName, buf, contentType){
  const safe = String(fileName).replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
  const path = 'files/' + productId + '/' + crypto.randomBytes(6).toString('hex') + '_' + safe;
  const meta = await blobPut(path, buf, contentType || 'application/octet-stream');
  const url = DRIVER === 'postgres'
    ? '/api/download?p=' + encodeURIComponent(path)
    : (meta.downloadUrl || meta.url);
  return {fileKey: path, fileUrl: url, fileName: safe, fileSize: buf.length};
}

/* ---------- mật khẩu + session + 2FA ---------- */
function hashPassword(pw){
  const salt = crypto.randomBytes(12).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return salt + '$' + hash;
}
function checkPassword(pw, stored){
  try{
    const parts = String(stored || '').split('$');
    if(parts.length !== 2) return false;
    const hash = crypto.scryptSync(String(pw), parts[0], 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(parts[1]));
  }catch(e){ return false; }
}
function newSessionToken(){ return crypto.randomBytes(24).toString('hex'); }
function hashEqual(a, b){
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if(ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
/* TOTP chuẩn (RFC 6238, HMAC-SHA1, 30s) */
function base32Decode(s){
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '', out = [];
  s = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  for(const c of s){ const i = A.indexOf(c); if(i < 0) continue; bits += i.toString(2).padStart(5,'0'); }
  for(let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i+8), 2));
  return Buffer.from(out);
}
function totpCode(secretBase32, timeStepOffset){
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now()/30000) + (timeStepOffset || 0);
  const buf = Buffer.alloc(8); buf.writeUInt32BE(Math.floor(counter / 2**32), 0); buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const off = hmac[hmac.length-1] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off+1] << 16) | (hmac[off+2] << 8) | hmac[off+3];
  return String(code % 1000000).padStart(6,'0');
}
function verify2fa(secret, code){
  return [-1,0,1].some(o => totpCode(secret, o) === String(code).trim());
}
function genSecret32(){ const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let s=''; for(let i=0;i<16;i++) s += A[crypto.randomInt(32)]; return s; }

/* cookie */
function parseCookies(req){
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if(i > 0) out[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1).trim());
  });
  return out;
}
function sessionCookie(token, maxAge){
  return 'dl_sess=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + (maxAge || 2592000);
}
function clearCookie(){ return 'dl_sess=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'; }

/* admin gate ticket: HMAC(blobToken, uid|exp) */
function adminTicket(uidv, ttlMs){
  const exp = nowMs() + (ttlMs || 30*60*1000);
  const mac = crypto.createHmac('sha256', BLOB_TOKEN || 'daula').update(uidv + '|' + exp).digest('hex').slice(0,32);
  return exp + '.' + mac;
}
function adminTicketValid(uidv, ticket){
  try{
    const parts = String(ticket || '').split('.');
    if(parts.length !== 2) return false;
    const exp = Number(parts[0]);
    if(!(exp > nowMs())) return false;
    const mac = crypto.createHmac('sha256', BLOB_TOKEN || 'daula').update(uidv + '|' + exp).digest('hex').slice(0,32);
    return hashEqual(mac, parts[1]);
  }catch(e){ return false; }
}

/* rate limit nhẹ theo instance */
const RATE = {};
function rateHit(key, limit, windowMs){
  const now = nowMs();
  const arr = (RATE[key] = RATE[key] || []).filter(t => now - t < (windowMs || 10*60*1000));
  if(arr.length >= limit){ RATE[key] = arr; return false; }
  arr.push(now);
  return true;
}

function ipOf(req){
  const h = req.headers;
  return (h['x-real-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

/* ---------- cấp độ tài khoản FREE / VIP (24/11/2026) ---------- */
/* key VIP: DL-... · key FREE: DF-... */
function isVipKey(k){ return String(k || '').startsWith('DL-'); }
function isFreeKey(k){ return String(k || '').startsWith('DF-'); }
/* license còn quyền tải: không bị thu hồi + chưa hết hạn (kiểm tra ở SERVER) */
function licActive(l){
  if(!l || l.revoked) return false;
  return !l.expires || new Date(l.expires + 'T23:59:59+07:00').getTime() >= Date.now();
}
/* cấp độ theo license: có ít nhất 1 license VIP (DL-) còn hạn => vip, ngược lại free */
function userLevel(st, u){
  const vip = (st.licenses || []).some(l => l.userId === u.id && isVipKey(l.key) && licActive(l));
  return vip ? 'vip' : 'free';
}
/* ---------- kiểm tra file ở SERVER (24/11/2026 — mục 7 & 8) ---------- */
/* SHA-256 tính tại SERVER trên byte thật của file (không tin hash do client gửi) */
function sha256Hex(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
/* file .jar/.zip là file zip: magic bytes PK\x03\x04 (bản thường), PK\x05\x06 (zip rỗng), PK\x07\x08 (spanned) */
function isZipBytes(buf){
  if(!buf || buf.length < 4) return false;
  const b = buf;
  return (b[0] === 0x50 && b[1] === 0x4B) && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) && (b[3] === 0x04 || b[3] === 0x06 || b[3] === 0x08);
}
/* phát hiện loại ảnh THẬT theo magic bytes + kích thước — KHÔNG tin đuôi file hay MIME client gửi.
   Trả về {ok, kind:'png'|'jpg'|'webp', w, h} hoặc {ok:false, why}. SVG/GIF/BMP bị từ chối. */
function sniffImage(buf){
  try{
    const b = buf;
    if(!b || b.length < 24) return {ok:false, why:'File quá nhỏ — không phải ảnh hợp lệ.'};
    /* PNG: 89 50 4E 47 0D 0A 1A 0A — IHDR w/h ở byte 16..23 */
    if(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47){
      return {ok:true, kind:'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20)};
    }
    /* JPEG: FF D8 FF — quét marker SOF để lấy kích thước */
    if(b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF){
      let off = 2;
      while(off + 9 < b.length){
        if(b[off] !== 0xFF){ off++; continue; }
        const marker = b[off + 1];
        if(marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9)){ off += 2; continue; }
        const len = b.readUInt16BE(off + 2);
        if(marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC){
          return {ok:true, kind:'jpg', h: b.readUInt16BE(off + 5), w: b.readUInt16BE(off + 7)};
        }
        off += 2 + len;
      }
      return {ok:false, why:'File JPEG lỗi — không đọc được kích thước.'};
    }
    /* WebP: "RIFF"...."WEBP" rồi chunk VP8/VP8L/VP8X */
    if(b.slice(0,4).toString('ascii') === 'RIFF' && b.slice(8,12).toString('ascii') === 'WEBP'){
      const fourcc = b.slice(12,16).toString('ascii');
      if(fourcc === 'VP8 '){ return {ok:true, kind:'webp', w: b.readUInt16LE(26) & 0x3FFF, h: b.readUInt16LE(28) & 0x3FFF}; }
      if(fourcc === 'VP8L'){
        const n = b.readUInt32LE(21);
        return {ok:true, kind:'webp', w: (n & 0x3FFF) + 1, h: ((n >> 14) & 0x3FFF) + 1};
      }
      if(fourcc === 'VP8X'){
        return {ok:true, kind:'webp', w: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, h: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1};
      }
      return {ok:false, why:'WebP không đọc được kích thước (chunk ' + fourcc + ').'};
    }
    return {ok:false, why:'Chỉ nhận PNG / JPG / WebP (không nhận SVG hay loại khác) — file này không đúng định dạng ảnh.'};
  }catch(e){ return {ok:false, why:'Không đọc được file ảnh: ' + e.message}; }
}

/* query params */
function qOf(req){
  try{ return Object.fromEntries(new URL(req.url, 'http://x').searchParams.entries()); }
  catch(e){ return {}; }
}

module.exports = {
  json, ok, fail, uid, nowMs, isoDate, nowStr, vnNow, vnDate, vnStr,
  clampInt, cleanStr, sleep, fetchT, BLOB_TIMEOUT,
  blobPut, blobDelete, withState, getState, putFile, STATE_PATH, blobList, blobGetRaw,
  DRIVER, fileUrlOf, seedState,
  hashPassword, checkPassword, newSessionToken, hashEqual,
  totpCode, verify2fa, genSecret32,
  parseCookies, sessionCookie, clearCookie,
  adminTicket, adminTicketValid, rateHit, ipOf, qOf,
  isVipKey, isFreeKey, licActive, userLevel,
  sha256Hex, isZipBytes, sniffImage
};
function fileUrlOf(path){ return '/api/download?p=' + encodeURIComponent(path); }

/* seedState được inject bởi seed.js (require vòng tránh lặp) */
let _seedState = null;
function seedState(){ return _seedState ? _seedState() : {rev:0, users:[], settings:{}}; }
module.exports.setSeed = fn => { _seedState = fn; };
/* nạp seed mặc định (seed.js require ngược core.js — vòngrequire an toàn vì exports đã gán xong ở trên) */
require('./seed.js');
