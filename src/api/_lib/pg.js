/* Đấu La Đại Lục — pg.js: client PostgreSQL wire protocol thuần Node (KHÔNG cần npm dependency).
   Dùng cho chế độ database "postgres" của web v2.0 (Neon / Postgres bất kỳ).
   - SCRAM-SHA-256 / cleartext / md5 / trust
   - Extended protocol có tham số $1,$2… (chống SQL injection — KHÔNG ghép chuỗi bao giờ)
   - Mỗi truy vấn mở 1 kết nối mới rồi đóng (đơn giản, an toàn cho BETA; Neon free đủ cho lưu lượng v2.0)
   Giới hạnknown: chỉ đọc/ghi giá trị dạng text + bytea (đủ cho state jsonb + file jar/ảnh). */
'use strict';
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

const CONN = {url: '', host: '', port: 5432, user: '', db: '', pass: '', ssl: true};

function parseConn(urlStr){
  const u = new URL(urlStr);
  const sslParam = (u.searchParams.get('sslmode') || u.searchParams.get('ssl') || '').toLowerCase();
  const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(u.hostname);
  CONN.url = urlStr;
  CONN.host = u.hostname;
  CONN.port = parseInt(u.port, 10) || 5432;
  CONN.user = decodeURIComponent(u.username || 'postgres');
  CONN.db = decodeURIComponent((u.pathname || '/postgres').slice(1) || 'postgres');
  CONN.pass = decodeURIComponent(u.password || '');
  CONN.ssl = sslParam ? ['require','verify-ca','verify-full','prefer','yes','true','1'].includes(sslParam) : !isLocal;
}

let _initPromise = null;
function init(urlStr){
  if(!urlStr || !/^postgres(ql)?:\/\//.test(String(urlStr))) return false;
  parseConn(urlStr);
  return true;
}
function active(){ return !!CONN.url; }

/* ---------- frame IO ---------- */
function connOnce(timeoutMs){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Postgres: kết nối quá hạn (' + CONN.host + ')')), timeoutMs || 8000);
    const done = (err, sock) => { clearTimeout(t); if(err) reject(err); else resolve(sock); };
    if(!CONN.ssl){ const s = net.connect(CONN.port, CONN.host); wire(s, done); return; }
    /* SSLRequest trước: nếu server đồng ý 'S' → TLS, 'N' → plaintext */
    const pre = net.connect(CONN.port, CONN.host);
    let buf = Buffer.alloc(0);
    pre.on('connect', () => {
      const m = Buffer.alloc(8); m.writeInt32BE(8, 0); m.writeInt32BE(80877103, 4); pre.write(m);
    });
    pre.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if(!buf.length) return;
      pre.removeAllListeners('data');
      pre.removeListener('error', onPreErr);
      if(buf[0] === 0x53){ /* S — upgrade TLS */
        const s = tls.connect({socket: pre, servername: CONN.host, rejectUnauthorized: false});
        wire(s, done);
      }else if(buf[0] === 0x4E){ /* N — plaintext */
        wire(pre, done);
      }else{ pre.destroy(); done(new Error('Postgres: phản hồi SSL không rõ (' + buf[0] + ')')); }
    });
    const onPreErr = e => { try{pre.destroy();}catch(_){} done(new Error('Postgres TCP: ' + e.message)); };
    pre.on('error', onPreErr);
  });
}
function wire(sock, done){
  sock.setNoDelay(true);
  sock.once('error', e => { try{sock.destroy();}catch(_){} done(new Error('Postgres socket: ' + e.message)); });
  sock.once('connect', () => done(null, sock));
}

function send(sock, type, payload){
  const head = Buffer.alloc(5);
  head.write(type, 0, 'ascii');
  head.writeInt32BE(payload.length + 4, 1);
  sock.write(Buffer.concat([head, payload]));
}
function msgBody(strings, extra){
  /* ghép các cstring + buffer phụ */
  const parts = [];
  for(const s of strings) parts.push(Buffer.from(String(s) + '\0', 'utf8'));
  if(extra) parts.push(extra);
  return Buffer.concat(parts);
}

/* reader bền vững: MỘT listener 'data' cho cả vòng đời kết nối — hàng đợi người đọc theo thứ tự.
   (bản cũ dùng unshift() + gắn lại listener gây RACE: phần thân tin bị mất ở flowing mode) */
function makeReader(sock, defaultMs){
  let buf = Buffer.alloc(0), err = null, done = false;
  const waiters = [];
  sock.on('data', d => { buf = Buffer.concat([buf, d]); flush(); });
  sock.once('error', e => { err = e; failAll(); });
  sock.once('close', () => { done = true; failAll(); });
  function failAll(){
    while(waiters.length){ const w = waiters.shift(); clearTimeout(w.timer); w.reject(err || new Error('Postgres: kết nối đóng sớm')); }
  }
  function flush(){
    while(waiters.length && buf.length >= waiters[0].n){
      const w = waiters.shift(); clearTimeout(w.timer);
      const b = buf.slice(0, w.n); buf = buf.slice(w.n);
      w.resolve(b);
    }
  }
  return function read(n, ms){
    return new Promise((resolve, reject) => {
      if(err || done) return reject(err || new Error('Postgres: kết nối đóng sớm'));
      const w = {n, resolve, reject, timer: setTimeout(() => {
        const i = waiters.indexOf(w); if(i >= 0) waiters.splice(i, 1);
        reject(new Error('Postgres: đọc dữ liệu quá hạn'));
      }, ms || defaultMs || 8000)};
      waiters.push(w); flush();
    });
  };
}
async function readMessage(sock, read, timeoutMs){
  const head = await read(5, timeoutMs);
  const type = String.fromCharCode(head[0]);
  const len = head.readInt32BE(1) - 4;
  if(len < 0 || len > 64 * 1024 * 1024) throw new Error('Postgres: khung tin lỗi (len=' + len + ')');
  const body = len ? await read(len, timeoutMs) : Buffer.alloc(0);
  return {type, body};
}

/* ---------- auth ---------- */
function scramFinal(clientNonce, serverFirst, password){
  const parts = {};
  for(const w of String(serverFirst).split(',')) parts[w.slice(0, 1)] = w.slice(2);
  const r = parts.r || '', s = parts.s || '', i = parseInt(parts.i || '4096', 10);
  if(!r.startsWith(clientNonce)) throw new Error('Postgres SCRAM: nonce không khớp');
  const salted = crypto.pbkdf2Sync(String(password), Buffer.from(s, 'base64'), i, 32, 'sha256');
  const ckey = crypto.createHmac('sha256', salted).update('Client Key').digest();
  const skey = crypto.createHash('sha256').update(ckey).digest();
  const clientFinalNoProof = 'c=biws,r=' + r;
  const authMsg = 'n,,n=,r=' + clientNonce + ',' + serverFirst + ',' + clientFinalNoProof;
  const csig = crypto.createHmac('sha256', skey).update(authMsg).digest();
  const proof = Buffer.alloc(32);
  for(let k = 0; k < 32; k++) proof[k] = ckey[k] ^ csig[k];
  const clientFinal = clientFinalNoProof + ',p=' + proof.toString('base64');
  const ssig = crypto.createHmac('sha256', skey).update(authMsg).digest();
  return {clientFinal, expectServerSig: 'v=' + ssig.toString('base64')};
}

async function handshake(sock, read, timeoutMs){
  /* StartupMessage: int32 độ dài + int32 protocol 3.0 (196608) + các cặp tham số cstring + \0 */
  const ver = Buffer.alloc(4); ver.writeInt32BE(196608, 0);
  const startup = Buffer.concat([ver, msgBody(['user', CONN.user, 'database', CONN.db], Buffer.from([0]))]);
  const head = Buffer.alloc(4); head.writeInt32BE(startup.length + 4, 0);
  sock.write(Buffer.concat([head, startup]));
  let scramState = null;
  for(;;){
    const m = await readMessage(sock, read, timeoutMs);
    if(m.type === 'R'){ /* Authentication */
      const code = m.body.readInt32BE(0);
      if(code === 0) continue;                    /* ok */
      if(code === 3){                             /* cleartext */
        send(sock, 'p', msgBody([CONN.pass]));
      }else if(code === 5){                       /* md5 */
        const salt = m.body.slice(4, 8);
        const h = crypto.createHash('md5').update(String(CONN.pass) + String(CONN.user)).digest('hex');
        const h2 = crypto.createHash('md5').update(h + salt).digest('hex');
        send(sock, 'p', msgBody(['md5' + h2]));
      }else if(code === 10){                      /* SASL */
        let off = 4; const mechs = [];
        while(off < m.body.length && m.body[off] !== 0){
          let e = off; while(e < m.body.length && m.body[e] !== 0) e++;
          mechs.push(m.body.slice(off, e).toString('ascii')); off = e + 1;
        }
        if(!mechs.includes('SCRAM-SHA-256')) throw new Error('Postgres SASL: chỉ hỗ trợ SCRAM-SHA-256, server yêu cầu ' + mechs.join('/'));
        const nonce = crypto.randomBytes(18).toString('base64');
        scramState = {nonce};
        const ir = 'n,,n=,r=' + nonce;
        const p = Buffer.concat([Buffer.from('SCRAM-SHA-256\0', 'ascii'), (() => { const b = Buffer.alloc(4); b.writeInt32BE(ir.length, 0); return b; })(), Buffer.from(ir, 'utf8')]);
        send(sock, 'p', p);
      }else if(code === 11 && scramState){        /* SASLContinue — server-first-message */
        const sf = m.body.slice(4).toString('utf8');
        const f = scramFinal(scramState.nonce, sf, CONN.pass);
        scramState.expect = f.expectServerSig;
        send(sock, 'p', msgBody([f.clientFinal]));
      }else if(code === 12 && scramState){        /* SASLFinal — server-final-message */
        const vf = m.body.slice(4).toString('utf8');
        if(vf !== scramState.expect) throw new Error('Postgres SCRAM: chữ ký server không khớp');
      }else throw new Error('Postgres auth: mã không hỗ trợ (' + code + ')');
    }
    else if(m.type === 'E'){
      const err = parseError(m.body);
      throw new Error('Postgres lỗi: ' + err.M + (err.C ? ' [' + err.C + ']' : ''));
    }
    else if(m.type === 'Z'){ return; }            /* ReadyForQuery */
  }
}

function parseError(body){
  const out = {};
  let off = 0;
  while(off < body.length && body[off] !== 0){
    const code = String.fromCharCode(body[off]); off++;
    let e = off; while(e < body.length && body[e] !== 0) e++;
    out[code] = body.slice(off, e).toString('utf8'); off = e + 1;
  }
  return out;
}

/* ---------- query ---------- */
const BYTEA_OID = 17, BOOL_OID = 16;
function decodeCell(val, typeOid){
  if(val === null) return null;
  if(typeOid === BYTEA_OID) return Buffer.from(String(val).startsWith('\\x') ? String(val).slice(2) : String(val), 'hex');
  if(typeOid === BOOL_OID) return val === 't';
  return val;
}

async function runQuery(sqlText, params, timeoutMs){
  if(!active()) throw new Error('pg.js: chưa init() với DATABASE_URL');
  const sock = await connOnce(timeoutMs);
  const read = makeReader(sock, timeoutMs);
  try{
    await handshake(sock, read, timeoutMs);
    const n = (params || []).length;
    /* Parse */
    {
      const pt = Buffer.alloc(2); pt.writeInt16BE(0, 0);           /* 0 tham số có kiểu chỉ định trước */
      send(sock, 'P', Buffer.concat([Buffer.from('\0', 'ascii'), Buffer.from(sqlText, 'utf8'), Buffer.from('\0', 'ascii'), pt]));
    }
    /* Bind — tham số dạng TEXT (bytea gửi dạng \x hex + cast $n::bytea trong câu SQL) */
    {
      const parts = [Buffer.from('\0\0', 'ascii')];                /* portal, statement */
      const fmt = Buffer.alloc(2); fmt.writeInt16BE(0, 0);         /* 0 mã định dạng tham số = mặc định TEXT hết */
      const nbuf = Buffer.alloc(2); nbuf.writeInt16BE(n, 0);
      parts.push(fmt, nbuf);
      for(const v of (params || [])){
        if(v === null || v === undefined){ const l = Buffer.alloc(4); l.writeInt32BE(-1, 0); parts.push(l); }
        else{
          const b = Buffer.isBuffer(v) ? Buffer.from('\\x' + v.toString('hex'), 'utf8') : Buffer.from(String(v), 'utf8');
          const l = Buffer.alloc(4); l.writeInt32BE(b.length, 0);
          parts.push(l, b);
        }
      }
      const rf = Buffer.alloc(2); rf.writeInt16BE(0, 0);           /* 0 định dạng kết quả (text) */
      parts.push(rf);
      send(sock, 'B', Buffer.concat(parts));
    }
    send(sock, 'D', Buffer.from('P\0', 'ascii'));                  /* Describe portal */
    { const e = Buffer.concat([Buffer.from('\0', 'ascii'), (() => { const b = Buffer.alloc(4); b.writeInt32BE(0, 0); return b; })()]); send(sock, 'E', e); }  /* Execute: portal '' + max_rows 0 */
    send(sock, 'S', Buffer.alloc(0));                              /* Sync */
    /* đọc đến ReadyForQuery */
    let cols = [], rows = [], tag = '';
    for(;;){
      const m = await readMessage(sock, read, timeoutMs);
      if(m.type === 'T'){
        const nc = m.body.readInt16BE(0); let off = 2; cols = [];
        for(let i = 0; i < nc; i++){
          let e = off; while(e < m.body.length && m.body[e] !== 0) e++;
          const name = m.body.slice(off, e).toString('utf8'); off = e + 1;
          const typeOid = m.body.readUInt32BE(off + 4 + 2);       /* bỏ tableOid(4)+attnum(2) */
          off += 4 + 2 + 4 + 2 + 4 + 2;
          cols.push({name, typeOid});
        }
      }
      else if(m.type === 'D'){
        const nc = m.body.readInt16BE(0); let off = 2; const row = {};
        for(let i = 0; i < nc && i < cols.length; i++){
          const l = m.body.readInt32BE(off); off += 4;
          row[cols[i].name] = (l === -1) ? null : decodeCell(m.body.slice(off, off + l).toString('utf8'), cols[i].typeOid);
          if(l > 0) off += l;
        }
        rows.push(row);
      }
      else if(m.type === 'C'){ tag = m.body.slice(0, m.body.length - 1).toString('utf8'); }
      else if(m.type === 'E'){
        const err = parseError(m.body);
        try{ sock.destroy(); }catch(_){}
        throw new Error('Postgres query: ' + err.M + (err.C ? ' [' + err.C + ']' : ''));
      }
      else if(m.type === 'Z'){ break; }
    }
    const mc = /(\d+)\s*$/.exec(tag || '');
    return {rows, rowCount: mc ? parseInt(mc[1], 10) : rows.length, command: (tag || '').split(' ')[0]};
  }finally{
    try{ sock.end(); sock.destroy(); }catch(_){}
  }
}
/* câu lệnh KHÔNG tham số (DDL khởi tạo) — simple query, 1 lượt */
async function runSimple(sqlText, timeoutMs){
  if(!active()) throw new Error('pg.js: chưa init()');
  const sock = await connOnce(timeoutMs);
  const read = makeReader(sock, timeoutMs);
  try{
    await handshake(sock, read, timeoutMs);
    send(sock, 'Q', msgBody([sqlText]));
    let tag = '';
    for(;;){
      const m = await readMessage(sock, read, timeoutMs);
      if(m.type === 'C') tag = m.body.slice(0, m.body.length - 1).toString('utf8');
      else if(m.type === 'E'){ const err = parseError(m.body); throw new Error('Postgres: ' + err.M + (err.C ? ' [' + err.C + ']' : '')); }
      else if(m.type === 'Z') break;
    }
    return {rows: [], rowCount: 0, command: tag};
  }finally{
    try{ sock.end(); sock.destroy(); }catch(_){}
  }
}

/* schema riêng v2beta — KHÔNG BAO GIỜ đụng public.* (bảng của web chính) */
const SCHEMA_DDL = [
  'CREATE SCHEMA IF NOT EXISTS v2beta',
  'CREATE TABLE IF NOT EXISTS v2beta.state (id integer PRIMARY KEY CHECK (id = 1), doc jsonb NOT NULL, rev bigint NOT NULL DEFAULT 1, updated timestamptz NOT NULL DEFAULT now())',
  'CREATE TABLE IF NOT EXISTS v2beta.files (path text PRIMARY KEY, data bytea NOT NULL, ctype text NOT NULL DEFAULT \'application/octet-stream\', size bigint NOT NULL DEFAULT 0, updated timestamptz NOT NULL DEFAULT now())'
];
let _schemaReady = false;
async function ensureSchema(){
  if(_schemaReady) return;
  for(const ddl of SCHEMA_DDL) await runSimple(ddl);
  _schemaReady = true;
}

module.exports = {init, active, ensureSchema, query: runQuery};
