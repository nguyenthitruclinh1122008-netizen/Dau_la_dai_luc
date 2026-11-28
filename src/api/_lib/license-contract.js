/* =====================================================================
   _lib/license-contract.js — HỢP ĐỒNG PLUGIN PREMIUM (port 1:1 từ web chính v1)
   ---------------------------------------------------------------------
   MỤC ĐÍCH (26/11/2026, nhánh web-v2-promote): tái hiện ĐÚNG TỪNG BYTE
   phần cấp vé/thẩm định mà plugin Premium đang chạy trên server khách gọi
   tới web chính: /api/license/activate · /api/license/heartbeat ·
   /api/verify-key. Plugin có KHÓA CÔNG KHAI nhúng trong jar — vé do bản
   v2 phát ra phải thẩm định qua được NGAY, không cần build lại plugin.

   NGUỒN ĐỐI CHIẾU (repo main, nhánh production):
     · src/lib/license-server.ts — ký kép Ed25519 + RSA-2048, watermark,
       blob premium, vé ngắn hạn (d/g/w/v/i/c/kh), hằng env.
     · src/lib/keys.ts — keyHash SHA-256, SHOP_KEY_RE, decode key cũ
       (24 ký tự base32 + payload.chữ-ký HMAC), KEY CHỦ.
     · src/lib/users.ts — FREE_KEY_RE, scrypt 64 (cầu nối mật khẩu khi
       migrate tài khoản).
     · src/lib/db.ts — saleActive/effPrice (cửa sổ khuyến mãi từng gói).

   QUY ƯỚT AN TOÀN:
     · KHÓA RIÊNG: env có thể đè (LICENSE_SIGNING_KEY / LICENSE_RSA_KEY /
       LICENSE_MASTER_KEYS / LICENSE_WM_SECRET) — mặc định trùng khớp
       mặc định nhúng của web chính → chữ ký GIỐNG HỆT khi không đặt env.
     · node:crypto thuần — không thêm dependency (Vercel functions).
     · KHÔNG đụng schema public.* — dữ liệu license nằm trong state doc
       v2 (do endpoint migrate-v1 đổ vào), mọi truy vấn đi qua core.js.
   ===================================================================== */
'use strict';
const crypto = require('crypto');

/* ---------- hằng số vé (khớp license-server.ts) ---------- */
const LIFETIME = '2275-12-31';

function clampNum(raw, def, min, max){
  const n = Number(String(raw == null ? '' : raw).trim() || def);
  if(!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* tuổi thọ vé (phút, 15–60) — env LICENSE_TICKET_MINUTES */
const SESSION_MINUTES = clampNum(process.env.LICENSE_TICKET_MINUTES, 30, 15, 60);
/* grace offline (giờ, 24–72) — env LICENSE_GRACE_HOURS */
const GRACE_HOURS = clampNum(process.env.LICENSE_GRACE_HOURS, 72, 24, 72);
/* giới hạn đổi server/tháng (1–2) — env LICENSE_REBIND_LIMIT */
const REBIND_LIMIT = clampNum(process.env.LICENSE_REBIND_LIMIT, 2, 1, 2);

/* KEY CHỦ — vé vĩnh viễn không tra DB (env LICENSE_MASTER_KEYS đè) */
const MASTER_KEYS = (process.env.LICENSE_MASTER_KEYS
  ? process.env.LICENSE_MASTER_KEYS.split(',')
  : ['0BZG-R7R0-0000-0FTA-B53J-56ST', '0850-R7R0-0007-FNAE-4PC3-911Q']
).map(k => k.trim().toUpperCase());

/* danh sách KEY CHỦ TĨNH (bản sao keys.ts — verify-key dùng đúng bản này) */
const MASTER_KEYS_STATIC = [
  '0BZG-R7R0-0000-0FTA-B53J-56ST',
  '0850-R7R0-0007-FNAE-4PC3-911Q',
];

/* ---------- khóa ký (mặc định = mặc định nhúng của web chính) ---------- */
/* Ed25519 PKCS8 DER base64 — env LICENSE_SIGNING_KEY đè */
const LICENSE_SIGNING_KEY_DEFAULT =
  'MC4CAQAwBQYDK2VwBCIEIKrYFZkG5DH7PyvhrapdTXtj85sq4oOSmnWW0ypdF0ym';
/* RSA-2048 PKCS8 DER base64 — env LICENSE_RSA_KEY đè */
const LICENSE_RSA_KEY_DEFAULT =
  'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDGizVCYhyjBKrd99xyNiEJqPo3e2wsuBdXL0nj4x50mIPDOwY2Jf+64DY//zCDNS1+Rs7bA4ZfMy6BibkziO5oETRzIfs29QjGpLYa1Q/0/Lf+91N9oX8jCgbP/NynxoGyNopPEgAhxwB2C8ATeVKsN3Dcvw8ics/mkqSsFp7GLbbbDNi4f1ODBvpudVON3An9XWhpkBFa+GM8owCnVswfF+nf9foTy07oI+FMQp+gF3kf+CwjA572PsVbnEJWSUCnDjU/+RYpri/iA+F2esSiMiTYtUAz1DyRP5v9gmTC/6KntNt7CDBFftHO/IWCO1psos/h2GAHIAEJ9e9qt0CJAgMBAAECggEAP2Jw4d0FrGuQiyWWrKWoPXfDThQqkEpDNVPFAKpg7jNEmX7N+FqAPm5XE25KVBEVkYNUhaol612hIrzPseqsxe98MadvFnf60cQC2SUdH4bQzOazsl9tAcgxLZRZ83wVqsnrtNuXzDDGbmlI7E6mvJFEiEy8rbA+vCsjxEbCcJzWipPwQb0XuzlrLFY/OANBuo6EqwoCjfBbx/J0KbqhDXUhiEqczv8FhgrP+45krUybdYuApJWgz1MW5J4MR1fvPA4exfnchYxywkV/qZsc/V/g5qt1RsQ0lk8B/LpTERKtV18W8i5rLNu+MUyk2Xt/xkRK5Krv6eFtsXGOIDt66wKBgQDn1vTVoHNVEAEzTQbRhsaDPFamrHlUnZrhsNrNf3cxsjtDk9+ZlHZvbU7XT8GLp0YWRyS+Y/qL4MBfS7xfTsfffrH9mkuuh0tihVZBqkwTIpNv9PFcbG8spklMllXjFtFEa/YWHG1tdvqR1vsUP9GMk4SGCblJJJHwLwxFhD+JkwKBgQDbO/r0WQtbqZ9LIB4IktiMEpq85hN0/AZl2/JvldZt3j27vChsW8bg0zAMHfCJIDHfhrT4zyoxCyGjP/epdLSuvODK47weQiJ86oqFX5ssXN3CcjnzuBtIehM2lhZq6NFj/Vm2h9DYHic4xIBySrLcItZRBusvUl9IMTz7Ohvu8wKBgCOb3osZU92S0bxhblSsUL1DfUOoZhJbCrjzgwfhNhuJ9pRQmB1ssiw3K87iTyX2EUvGrZwYmxj08lcwuMQiw4xOV2ROWKV73lZJiJAZagneW6rsgk3h0cmX2NZMmPCCRq4truSChUQ07BOOY44epz7iQY6c27qiRVAQyd+7ik7FAoGALE3GvTJxdSimJExtRVZHpKbt1la4f9+ee18jcyFYoANVfmbb1GoHms+S2iACx/NVoNJcKBvVbuvM9Gys4/XNvbI1y0qSbZr31T6gl6tmdGSf+/eRdosyGEdzMojKJvi9t/Mu+hAgSExvqK0tN+uYkZwIq382b+25i6FHrY1kr7kCgYEAs16blZYsDNOjpIu8DVUtyTEAEdctWUaS+RsAHolV4TH+KFheOXk1CSWjWRMyTgic0RfI7dwqIBBWDn7qQOzfPwcVuVNKscIdtoJjR/ILpOAJnbNHZOi3Prt79qBH96oIK3Mszy262V5PdDPYjNrEvBou7oeZVF3C16mNI5dJR/s=';

let cachedPriv = null, cachedPub = null, cachedRsa = null, cachedRsaPub = null;

function signingPrivateKey(){
  if(!cachedPriv){
    cachedPriv = crypto.createPrivateKey({
      key: Buffer.from(String(process.env.LICENSE_SIGNING_KEY || LICENSE_SIGNING_KEY_DEFAULT).trim(), 'base64'),
      format: 'der', type: 'pkcs8',
    });
  }
  return cachedPriv;
}
function signingPublicKey(){
  if(!cachedPub) cachedPub = crypto.createPublicKey(signingPrivateKey());
  return cachedPub;
}
function rsaPrivateKey(){
  if(!cachedRsa){
    cachedRsa = crypto.createPrivateKey({
      key: Buffer.from(String(process.env.LICENSE_RSA_KEY || LICENSE_RSA_KEY_DEFAULT).trim(), 'base64'),
      format: 'der', type: 'pkcs8',
    });
  }
  return cachedRsa;
}
function rsaPublicKey(){
  if(!cachedRsaPub) cachedRsaPub = crypto.createPublicKey(rsaPrivateKey());
  return cachedRsaPub;
}

const b64u = buf => buf.toString('base64').replace(/=+$/, '');

/* blob tính năng premium — nguồn: premium-profile.json (sao nguyên vẹn từ web chính) */
const PROFILE_JSON = require('./premium-profile.json');
function premiumBlobB64(){ return b64u(Buffer.from(JSON.stringify(PROFILE_JSON), 'utf8')); }

/* ---------- watermark theo key (deterministic theo license id) ---------- */
const WM_SECRET = process.env.LICENSE_WM_SECRET || 'daula-wm-v3.0.1-soulland';
function wmForLicense(licenseId){
  const h = crypto.createHmac('sha256', WM_SECRET).update('wm:' + licenseId).digest();
  return 1 + (h[0] % 63);
}

/* ---------- hash build (env do build plugin in ra) ---------- */
function buildHashes(){
  const raw = process.env.DAULA_BUILD_HASHES || '';
  const out = {};
  for(const part of raw.split(',')){
    const kv = part.split(':');
    const k = (kv[0] || '').trim().toLowerCase(), v = (kv[1] || '').trim().toLowerCase();
    if(k === 't' && v) out.t = v;
    if(k === 'm' && v) out.m = v;
  }
  return out;
}
function licenseClassHashes(){ return String(process.env.DAULA_LICENSE_HASHES || '').trim(); }

/* ---------- ký / thẩm định vé ---------- */
/* Ký 1 vé → "payload.sig" (base64url) — GIỐNG HỆT license-server.ts */
function signSession(p){
  const payload = b64u(Buffer.from(JSON.stringify(p), 'utf8'));
  const sig = b64u(crypto.sign(null, Buffer.from(payload, 'ascii'), signingPrivateKey()));
  return payload + '.' + sig;
}
/* v3.7 — co-sign RSA-2048 SHA256/PKCS1v15 trên đúng phần payload → base64 THƯỜNG */
function rsaSignSession(token){
  const payload = token.slice(0, token.lastIndexOf('.'));
  return crypto.sign('sha256', Buffer.from(payload, 'ascii'),
    {key: rsaPrivateKey(), padding: crypto.constants.RSA_PKCS1_PADDING}).toString('base64');
}
/* Thẩm định vé (heartbeat gửi vé cũ về) — trả payload JSON hoặc null */
function verifySession(token){
  try{
    const dot = token.lastIndexOf('.');
    if(dot <= 0 || dot === token.length - 1) return null;
    const payload = token.slice(0, dot);
    const sig = Buffer.from(token.slice(dot + 1).replace(/-/g, '+').replace(/_/g, '/') + '===', 'base64');
    const okv = crypto.verify(null, Buffer.from(payload, 'ascii'), signingPublicKey(), sig);
    if(!okv) return null;
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/') + '===', 'base64').toString('utf8'));
    if(!json || typeof json.l !== 'number' || json.v !== 3) return null;
    return json;
  }catch(e){ return null; }
}
/* vé quá tuổi thọ ngắn hạn → plugin tự kích hoạt lại */
function isTicketStale(s){
  const dMin = Math.min(60, Math.max(15, Number(s.d) || 30));
  return Date.now() > s.s + dMin * 60000;
}

/* ---------- ngày (đúng ngữ nghĩa server UTC của web chính) ---------- */
function todayStr(d){
  const dd = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return dd.getFullYear() + '-' + p(dd.getMonth() + 1) + '-' + p(dd.getDate());
}
function isExpired(dateStr){
  if(!dateStr) return false;
  return String(dateStr).slice(0, 10) < todayStr();
}

/* ---------- key hash / regex (khớp keys.ts + users.ts) ---------- */
function keyHash(key){
  return crypto.createHash('sha256').update(String(key || '').trim().toUpperCase(), 'utf8').digest('hex');
}
function maskKey(key){
  const k = String(key || '').trim();
  return k.length <= 4 ? '****' : '****' + k.slice(-4);
}
/* key SHOP v2.3: DL-XXXX-XXXX-XXXX-XXXX */
const SHOP_KEY_RE = /^DL-[A-HJKMNPQRSTVWXYZ2-9]{4}(-[A-HJKMNPQRSTVWXYZ2-9]{4}){3}$/;
/* key thường quà đăng ký v1: FREE-XXXX-XXXX-XXXX */
const FREE_KEY_RE = /^FREE-[A-HJKMNPQRSTVWXYZ2-9]{4}-[A-HJKMNPQRSTVWXYZ2-9]{4}-[A-HJKMNPQRSTVWXYZ2-9]{4}$/;

/* ---------- giải mã key ĐỊNH DẠNG CŨ (port 1:1 keys.ts) ---------- */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/* tái tạo secret 32 byte của plugin từ mảng hằng XOR trong class Il_I */
const XOR_STR = 'DauLaDaiLuc#2026$Premium';
const XOR_TABLE = [
  [45, 27, 16, 99, 14, 37, 7, 8, 40, 71, 47, 76, 115, 96, 123],
  [15, 34, 5, 48, 19, 71, 81, 127, 125, 67, 36, 38, 31, 34, 84],
  [68, 81, 71, 59, 32, 10, 57, 28, 57, 31, 17, 45, 50, 0],
];
function computeSecret(){
  const out = new Array(44).fill(0);
  for(let k = 0; k < XOR_TABLE.length; k++){
    const row = XOR_TABLE[k];
    for(let j = 0; j < row.length; j++){
      out[k + j * XOR_TABLE.length] = (row[j] ^ XOR_STR.charCodeAt((j + 7 * k) % XOR_STR.length)) & 0xff;
    }
  }
  return Buffer.from(Buffer.from(out).toString('latin1'), 'base64');
}
const SECRET = computeSecret();

function hDecode(s){
  const t = String(s).trim().replace(/-/g, '+').replace(/_/g, '/');
  const rem = t.length % 4;
  if(rem === 1) throw new Error('base64 sai');
  return Buffer.from(t + '='.repeat((4 - rem) % 4), 'base64');
}
function decodeDottedKey(key){
  const dot = String(key).lastIndexOf('.');
  if(dot <= 0 || dot === String(key).length - 1) return {ok:false, reason:'KEY_SAI_DINH_DANG'};
  const payload = String(key).slice(0, dot);
  const mac = crypto.createHmac('sha256', SECRET).update(Buffer.from(payload, 'utf8')).digest();
  let sig;
  try{ sig = hDecode(String(key).slice(dot + 1)); }
  catch(e){ return {ok:false, reason:'KEY_SAI_DINH_DANG'}; }
  if(mac.length !== sig.length || !crypto.timingSafeEqual(mac, sig)) return {ok:false, reason:'KEY_KHONG_HOP_LE'};
  let json;
  try{ json = JSON.parse(hDecode(payload).toString('utf8')); }
  catch(e){ return {ok:false, reason:'KEY_SAI_DINH_DANG'}; }
  const n = json && json.n, e = json && json.e, h = json && json.h;
  if(!n || !e || !h) return {ok:false, reason:'KEY_THIEU_THONG_TIN'};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(e))) return {ok:false, reason:'KEY_SAI_NGAY_HET_HAN'};
  return {ok:true, dotted:true, name:n, expiry:String(e), expired:isExpired(e),
    lifetime:String(e) === LIFETIME, anyHWID:String(h).toUpperCase() === 'ANY', order:(json && json.o) || ''};
}
function decodeBase32(str){
  const bytes = [];
  let bits = 0, value = 0;
  for(const ch of String(str).toUpperCase()){
    let idx = ALPHABET.indexOf(ch);
    if(idx < 0){
      if(ch === 'O') idx = 0;
      else if(ch === 'I' || ch === 'L') idx = 1;
      else return null;
    }
    value = (value << 5) | idx;
    bits += 5;
    if(bits >= 8){ bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(bytes);
}
const ungroup = k => String(k || '').replace(/[-\s]/g, '').toUpperCase();
function decodeKey24(key){
  const raw = decodeBase32(ungroup(key));
  if(!raw || raw.length !== 15) return {ok:false, reason:'KEY_SAI_DINH_DANG'};
  if((raw[0] & 0xff) !== 2) return {ok:false, reason:'KEY_SAI_PHIEN_BAN'};
  const expect = crypto.createHmac('sha256', SECRET).update(raw.subarray(0, 7)).digest().subarray(0, 8);
  const got = raw.subarray(7, 15);
  if(!crypto.timingSafeEqual(expect, got)) return {ok:false, reason:'KEY_KHONG_HOP_LE'};
  const y = (raw[1] & 0xff) + 2020;
  const m = raw[2] & 0xff;
  const d = raw[3] & 0xff;
  if(m < 1 || m > 12 || d < 1 || d > 31) return {ok:false, reason:'KEY_SAI_NGAY_HET_HAN'};
  const expiry = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  return {ok:true, expiry, expired:isExpired(expiry), lifetime:(raw[1] & 0xff) === 255,
    anyHWID:((raw[4] | raw[5] | raw[6]) === 0)};
}
function isMasterKey(key){
  const norm = ungroup(key).replace(/(.{4})(?=.)/g, '$1-');
  return MASTER_KEYS_STATIC.includes(norm);
}
function decodeAny(key){
  const k = String(key || '').trim();
  if(k.includes('.')) return decodeDottedKey(k);
  return decodeKey24(k);
}

/* ---------- cầu nối mật khẩu scrypt-64 của web chính (users.ts) ----------
   user migrate từ v1 giữ passV1 = {salt, hash} (salt 16B hex, hash 64B hex).
   Đăng nhập v2: thử hash v2 trước, sai thì thử v1 — đúng thì tự NÂNG CẤP
   sang hash v2 (khách không phải làm gì). */
function checkPasswordV1(password, salt, hash){
  try{
    const a = Buffer.from(crypto.scryptSync(String(password), String(salt), 64).toString('hex'), 'hex');
    const b = Buffer.from(String(hash || ''), 'hex');
    if(a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }catch(e){ return false; }
}

/* ---------- rate limit theo KEY (port activate: 10 lỗi/15 phút/key) ---------- */
const keyFails = new Map();
function keyRateLimited(k){
  const now = Date.now();
  const arr = (keyFails.get(k) || []).filter(t => now - t < 15 * 60000);
  return arr.length >= 10;
}
function noteKeyFail(k){
  const now = Date.now();
  const arr = (keyFails.get(k) || []).filter(t => now - t < 15 * 60000);
  arr.push(now);
  keyFails.set(k, arr);
  if(keyFails.size > 5000) keyFails.clear();
}
function keyNoteOk(k){ keyFails.delete(k); }

/* ---------- cửa sổ khuyến mãi (port saleActive/effPrice/salePercent) ----------
   tier v2 có thể mang saleStart/saleEnd (ISO) + salePrice thô khi migrate từ
   bảng packages của web chính; không có window → hành vi cũ (sale % tĩnh). */
function saleActive(tier, now){
  const nowD = now || new Date();
  const sp = tier.salePrice != null ? Number(tier.salePrice) : 0;
  if(sp <= 0) return false;
  const s = tier.saleStart ? new Date(tier.saleStart) : null;
  const e = tier.saleEnd ? new Date(tier.saleEnd) : null;
  if(s && nowD < s) return false;
  if(e && nowD > e) return false;
  return sp < Number(tier.price || 0);
}
function effPrice(tier, now){
  return saleActive(tier, now) ? Number(tier.salePrice) : Number(tier.price || 0);
}
function salePercent(tier, now){
  const orig = Number(tier.price || 0);
  if(!saleActive(tier, now) || orig <= 0) return 0;
  return Math.round(((orig - Number(tier.salePrice)) / orig) * 100);
}

/* ---------- thông tin khóa công khai (chỉ dùng cho TEST nội bộ) ---------- */
function publicKeysForTest(){
  return {
    ed: signingPublicKey().export({type: 'spki', format: 'der'}).toString('base64'),
    rsa: rsaPublicKey().export({type: 'spki', format: 'der'}).toString('base64'),
  };
}

module.exports = {
  LIFETIME, SESSION_MINUTES, GRACE_HOURS, REBIND_LIMIT, MASTER_KEYS,
  signSession, rsaSignSession, verifySession, isTicketStale, premiumBlobB64,
  wmForLicense, buildHashes, licenseClassHashes,
  todayStr, isExpired, keyHash, maskKey,
  SHOP_KEY_RE, FREE_KEY_RE, decodeAny, decodeDottedKey, decodeKey24, isMasterKey,
  checkPasswordV1, keyRateLimited, noteKeyFail, keyNoteOk,
  saleActive, effPrice, salePercent, publicKeysForTest,
};
