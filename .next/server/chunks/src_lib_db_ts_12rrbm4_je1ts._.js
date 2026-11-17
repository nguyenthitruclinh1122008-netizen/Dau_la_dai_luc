module.exports=[43793,e=>{"use strict";var T=e.i(66680);let a=globalThis,E=[`CREATE TABLE IF NOT EXISTS settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,`CREATE TABLE IF NOT EXISTS packages (
     code      TEXT PRIMARY KEY,
     name      TEXT NOT NULL,
     days      INT  NOT NULL,
     price_vnd INT  NOT NULL,
     enabled   INT  NOT NULL DEFAULT 1,
     sort      INT  NOT NULL DEFAULT 0
   )`,`CREATE TABLE IF NOT EXISTS orders (
     id           SERIAL PRIMARY KEY,
     code         TEXT UNIQUE NOT NULL,
     type         TEXT NOT NULL,
     buyer_name   TEXT NOT NULL,
     buyer_contact TEXT NOT NULL,
     package_code TEXT NOT NULL,
     amount_vnd   INT  NOT NULL,
     note         TEXT,
     status       TEXT NOT NULL DEFAULT 'pending',
     license_id   INT,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     decided_at   TIMESTAMPTZ
   )`,`CREATE TABLE IF NOT EXISTS licenses (
     id           SERIAL PRIMARY KEY,
     key          TEXT UNIQUE NOT NULL,
     order_code   TEXT NOT NULL,
     package_code TEXT NOT NULL,
     expires_at   DATE NOT NULL,
     status       TEXT NOT NULL DEFAULT 'active',
     buyer        TEXT,
     fingerprint  TEXT,
     server_id    TEXT,
     server_changed_at TIMESTAMPTZ,
     server_changes INT NOT NULL DEFAULT 0,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     revoked_at   TIMESTAMPTZ
   )`,"ALTER TABLE licenses ADD COLUMN IF NOT EXISTS fingerprint TEXT","ALTER TABLE licenses ADD COLUMN IF NOT EXISTS server_id TEXT","ALTER TABLE licenses ADD COLUMN IF NOT EXISTS server_changed_at TIMESTAMPTZ","ALTER TABLE licenses ADD COLUMN IF NOT EXISTS server_changes INT NOT NULL DEFAULT 0","ALTER TABLE licenses ADD COLUMN IF NOT EXISTS wm INT NOT NULL DEFAULT 0","ALTER TABLE licenses ADD COLUMN IF NOT EXISTS suspicious BOOLEAN NOT NULL DEFAULT false",`CREATE TABLE IF NOT EXISTS license_telemetry (
     id         SERIAL PRIMARY KEY,
     license_id INT NOT NULL,
     hwid       TEXT,
     tm         TEXT,
     wm         INT,
     wm_match   BOOLEAN,
     flags      TEXT,
     ip         TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,"CREATE INDEX IF NOT EXISTS idx_telemetry_lic ON license_telemetry (license_id, created_at DESC)",`CREATE TABLE IF NOT EXISTS users (
     id         SERIAL PRIMARY KEY,
     username   TEXT UNIQUE NOT NULL,
     pass_hash  TEXT NOT NULL,
     salt       TEXT NOT NULL,
     contact    TEXT,
     gift_key   TEXT UNIQUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_login TIMESTAMPTZ
   )`,"ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'",`CREATE TABLE IF NOT EXISTS ratings (
     id         SERIAL PRIMARY KEY,
     score      INT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,`CREATE TABLE IF NOT EXISTS audit_logs (
     id         SERIAL PRIMARY KEY,
     action     TEXT NOT NULL,
     detail     TEXT,
     ip         TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`],N=[{code:"prem30",name:"PREMIUM 30 NGÀY",days:30,price_vnd:13e3,enabled:1,sort:1},{code:"prem90",name:"PREMIUM 90 NGÀY",days:90,price_vnd:3e4,enabled:1,sort:2},{code:"prem180",name:"PREMIUM 180 NGÀY",days:180,price_vnd:63e3,enabled:1,sort:3},{code:"prem365",name:"PREMIUM 365 NGÀY",days:365,price_vnd:93e3,enabled:1,sort:4},{code:"lifetime",name:"PREMIUM LIFETIME",days:0,price_vnd:173e3,enabled:1,sort:5},{code:"freegift",name:"KEY BẢN THƯỜNG (FREE) — QUÀ ĐĂNG KÝ",days:0,price_vnd:0,enabled:0,sort:-1}],L=[{key:"bank_name",value:"Vietcombank"},{key:"bank_account",value:"0123456789"},{key:"bank_holder",value:"CHU SHOP DAU LA"}],t="TRUC_LINH";async function n(e){let a=T.default.randomBytes(16).toString("hex"),E=T.default.scryptSync("TRUC_LINH",a,64).toString("hex");await e(`INSERT INTO users (username, pass_hash, salt, contact, gift_key, role)
     VALUES ($1,$2,$3,NULL,NULL,'admin')
     ON CONFLICT (username) DO NOTHING`,[t,E,a]),await e("UPDATE users SET role='admin' WHERE lower(username)=lower($1)",[t])}async function r(){let{PGlite:T}=await e.A(19988),a=new T;for(let e of E)await a.exec(e);for(let e of N)await a.query(`INSERT INTO packages (code, name, days, price_vnd, enabled, sort)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING`,[e.code,e.name,e.days,e.price_vnd,e.enabled,e.sort]);for(let e of L)await a.query("INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING",[e.key,e.value]);return await n((e,T)=>a.query(e,T||[])),{q:async(e,T)=>(await a.query(e,T||[])).rows||[],ready:Promise.resolve()}}async function s(){let{default:T}=await e.A(81626),a=process.env.DATABASE_URL;if(!a)throw Error("Thiếu DATABASE_URL — xem .env.example");let t=T(a,{ssl:"require",max:5,idle_timeout:20});for(let e of E)await t.unsafe(e);for(let e of N)await t.unsafe(`INSERT INTO packages (code, name, days, price_vnd, enabled, sort)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING`,[e.code,e.name,e.days,e.price_vnd,e.enabled,e.sort]);for(let e of L)await t.unsafe("INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING",[e.key,e.value]);return await n((e,T)=>t.unsafe(e,T||[])),{q:async(e,T)=>await t.unsafe(e,T||[]),ready:Promise.resolve()}}async function i(e,T=[]){return(await (!a.__daulaDb&&(a.__daulaDb="1"===process.env.USE_PG_LITE||!process.env.DATABASE_URL?r():s()),a.__daulaDb)).q(e,T)}async function I(e,T,a){try{await i("INSERT INTO audit_logs (action, detail, ip) VALUES ($1,$2,$3)",[e,T.slice(0,500),a||""])}catch{}}async function o(){for(let e=0;e<20;e++){let e="SL"+(function(){let e="0123456789ABCDEFGHJKMNPQRSTVWXYZ",a=(0,T.randomBytes)(4),E="";for(let T of a)E+=e[T%e.length];return E})().toUpperCase();if(0===(await i("SELECT 1 FROM orders WHERE code=$1",[e])).length)return e}return"SL"+Date.now().toString(36).toUpperCase()}e.s(["L",0,o,"d",0,I,"q",0,i])}];

//# sourceMappingURL=src_lib_db_ts_12rrbm4_je1ts._.js.map