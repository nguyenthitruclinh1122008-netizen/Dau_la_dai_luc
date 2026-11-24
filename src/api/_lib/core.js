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

/* ---------- Blob store (database) ---------- */
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
const STATE_PATH = 'db/daula-state-v1.json';
const BLOB_API = 'https://blob.vercel-storage.com';

/* FIX 24/11/2026 — NGUYÊN NHÂN TRANG TRẮNG (chẩn đoán trên BETA thật): fetch() trần đến
   Blob đôi khi treo vĩnh viễn (network stall) → lambda không bao giờ trả response →
   /api/state treo → SPA đợi fetchState mãi → body trắng, chỉ còn footer tĩnh.
   MỌI fetch đến Blob từ giờ đều có AbortController timeout. */
function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }
function fetchT(url, opts, ms){
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms || 5000);
  return fetch(url, Object.assign({}, opts, {signal: ac.signal})).finally(() => clearTimeout(timer));
}
const BLOB_TIMEOUT = 5000;

async function blobFetch(path, opts){
  const r = await fetchT(BLOB_API + path, Object.assign({}, opts, {
    headers: Object.assign({}, (opts && opts.headers) || {}, {authorization: 'Bearer ' + BLOB_TOKEN})
  }), BLOB_TIMEOUT);
  return r;
}
async function blobPut(pathname, data, contentType){
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
  try{
    const r = await blobFetch('/' + pathname, {method: 'DELETE'});
    return r.ok;
  }catch(e){ return false; }
}
/* đọc state KHÔNG ghi — mỗi lần ghi 1 pathname DUY NHẤT (không tái sử dụng tên, tránh metadata lag
   của origin với file đã-xoá-rồi-tạo-lại) + LIST API (không cache) làm directory */
const STATE_DIR = 'db';
/* sort key: state-r00NN (định dạng cũ) → rev; state-<13 số ms><rand hex> → 1e15 + ts (luôn mới hơn rev cũ).
   CHÚ Ý: bắt ĐÚNG 13 chữ số timestamp (không greedy) — random hex khởi đầu bằng số làm regex \d{13,} nuốt nhầm */
function stateKey(pathname){
  let m = pathname.match(/state-r(\d+)\.json$/);
  if(m) return parseInt(m[1], 10);
  m = pathname.match(/state-(\d{13})[a-f0-9]*\.json$/);
  if(m) return 1e15 + parseInt(m[1], 10);
  return -1;
}
async function listRevs(){
  let lastErr = null;
  for(let i = 0; i < 3; i++){
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
    await new Promise(res => setTimeout(res, 350 * (i + 1)));
  }
  throw lastErr || new Error('Blob GET thất bại');
}
function validState(st){
  return st && Array.isArray(st.users) && st.settings && st.settings.adminGate;
}
async function readLatestState(){
  const revs = await listRevs();
  /* đọc từ file MỚI NHẤT lùi dần: file top có sự cố thì dùng file cũ hơn — không bao giờ hard-fail */
  for(let i = revs.length - 1; i >= 0; i--){
    try{
      const st = await fetchUrl(revs[i].url);
      if(validState(st)) return {st, rev: Math.max(1, st.rev || revs[i].key % 1e8)};
    }catch(e){ /* file này chưa propagate / bị mất — thử file liền dưới */ }
  }
  /* migrate: đọc file legacy nếu có */
  try{
    const r = await fetchT(BLOB_API + '?limit=50&prefix=' + encodeURIComponent(STATE_DIR + '/daula-state-v1'), {headers: {authorization: 'Bearer ' + BLOB_TOKEN}}, BLOB_TIMEOUT);
    if(r.ok){
      const d = await r.json();
      const leg = (d.blobs || []).find(b => b.pathname === STATE_DIR + '/daula-state-v1.json');
      if(leg){
        const st = await fetchUrl(leg.url);
        if(validState(st)) return {st, rev: Math.max(1, st.rev || 0)};
      }
    }
  }catch(e){}
  return {st: seedState(), rev: 0};
}
async function getState(){
  const r = await readLatestState();
  return r.st;
}
/* state doc CAS: đọc bản mới nhất -> mutate -> ghi file pathname DUY NHẤT -> list xác nhận mình là top */
async function withState(mutator, tries){
  const n = tries || 6;
  for(let i = 0; i < n; i++){
    const base = await readLatestState();
    const st = validState(base.st) ? base.st : seedState();
    const result = await mutator(st);           // mutate trực tiếp hoặc return {next, out} (có thể async)
    const next = (result && result.next) ? result.next : st;
    next.rev = base.rev + 1;
    const path = STATE_DIR + '/state-' + Date.now() + crypto.randomBytes(4).toString('hex') + '.json';
    await blobPut(path, JSON.stringify(next), 'application/json');
    const revs = await listRevs();
    const topKey = revs.length ? revs[revs.length - 1].key : 0;
    const myKey = stateKey(path);
    if(topKey > myKey) continue;                /* có người ghi file mới hơn song song -> làm lại */
    /* dọn file cũ (giữ 14 file gần nhất, chỉ dọn khi > 20) — best effort */
    if(revs.length > 20){
      const oldUrls = revs.slice(0, revs.length - 14).map(x => x.url);
      try{ await blobFetch('/delete', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({urls: oldUrls})}); }catch(e){}
    }
    return (result && result.out !== undefined) ? result.out : {state: next};
  }
  throw new Error('Kho dữ liệu bận — thử lại sau vài giây.');
}
/* file plugin / tài liệu đính kèm */
async function putFile(productId, fileName, buf, contentType){
  const safe = String(fileName).replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
  const path = 'files/' + productId + '/' + crypto.randomBytes(6).toString('hex') + '_' + safe;
  const meta = await blobPut(path, buf, contentType || 'application/octet-stream');
  return {fileKey: path, fileUrl: meta.downloadUrl || meta.url, fileName: safe, fileSize: buf.length};
}
/* liệt kê blob theo prefix (dùng cho upload jar theo phần — mục 7) */
async function blobList(prefix){
  const r = await fetchT(BLOB_API + '?limit=100&prefix=' + encodeURIComponent(prefix), {headers: {authorization: 'Bearer ' + BLOB_TOKEN}}, BLOB_TIMEOUT * 2);
  if(!r.ok) throw new Error('Blob list ' + r.status);
  return (await r.json()).blobs || [];
}
/* đọc 1 blob trả về Buffer NHỊ PHÂN (không JSON.parse — dùng cho part/ảnh) */
async function blobGetRaw(pathOrUrl, ms){
  const url = String(pathOrUrl).startsWith('http') ? pathOrUrl : BLOB_API + '/' + pathOrUrl;
  const r = await fetchT(url, {headers: {authorization: 'Bearer ' + BLOB_TOKEN}}, ms || 30000);
  if(!r.ok) throw new Error('Blob GET ' + String(pathOrUrl).slice(-40) + ' -> ' + r.status);
  return Buffer.from(await r.arrayBuffer());
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
  hashPassword, checkPassword, newSessionToken, hashEqual,
  totpCode, verify2fa, genSecret32,
  parseCookies, sessionCookie, clearCookie,
  adminTicket, adminTicketValid, rateHit, ipOf, qOf,
  isVipKey, isFreeKey, licActive, userLevel,
  sha256Hex, isZipBytes, sniffImage
};

/* seedState được inject bởi seed.js (require vòng tránh lặp) */
let _seedState = null;
function seedState(){ return _seedState ? _seedState() : {rev:0, users:[], settings:{}}; }
module.exports.setSeed = fn => { _seedState = fn; };
/* nạp seed mặc định (seed.js require ngược core.js — vòngrequire an toàn vì exports đã gán xong ở trên) */
require('./seed.js');
