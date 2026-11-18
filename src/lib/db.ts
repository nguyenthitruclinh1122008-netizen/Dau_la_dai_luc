/* =====================================================================
   lib/db.ts — KẾT NỐI DATABASE
   ---------------------------------------------------------------------
   • Production (Vercel): DATABASE_URL → Neon Serverless Postgres
     (chạy qua postgres.js, ssl tự bật)
   • Dev/Test local (không cần Neon): đặt USE_PG_LITE=1 → chạy bằng
     @electric-sql/pglite (Postgres thật chạy WASM in-process, data
     nằm trong RAM máy bạn)
   Hai chế độ chạy CÙNG SQL chuẩn PostgreSQL + schema tự tạo lần đầu.
   ===================================================================== */

/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from "node:crypto";

type Row = Record<string, any>;

interface DbState {
  q: (text: string, params?: unknown[]) => Promise<Row[]>;
  ready: Promise<void>;
}

const g = globalThis as unknown as { __daulaDb?: Promise<DbState> };

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS packages (
     code      TEXT PRIMARY KEY,
     name      TEXT NOT NULL,
     days      INT  NOT NULL,
     price_vnd INT  NOT NULL,
     enabled   INT  NOT NULL DEFAULT 1,
     sort      INT  NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS orders (
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
   )`,
  `CREATE TABLE IF NOT EXISTS licenses (
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
   )`,
  /* bản cũ đã có bảng licenses từ trước → bổ sung cột fingerprint (bind HWID) */
  `ALTER TABLE licenses ADD COLUMN IF NOT EXISTS fingerprint TEXT`,
  /* v2.3: bind theo ID server Minecraft + giới hạn đổi máy (1–2 lần/30 ngày) */
  `ALTER TABLE licenses ADD COLUMN IF NOT EXISTS server_id TEXT`,
  `ALTER TABLE licenses ADD COLUMN IF NOT EXISTS server_changed_at TIMESTAMPTZ`,
  `ALTER TABLE licenses ADD COLUMN IF NOT EXISTS server_changes INT NOT NULL DEFAULT 0`,
  /* v3.0.1: watermark theo key (truy rò rỉ) + cờ nghi vấn (telemetry âm thầm) */
  `ALTER TABLE licenses ADD COLUMN IF NOT EXISTS wm INT NOT NULL DEFAULT 0`,
  `ALTER TABLE licenses ADD COLUMN IF NOT EXISTS suspicious BOOLEAN NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS license_telemetry (
     id         SERIAL PRIMARY KEY,
     license_id INT NOT NULL,
     hwid       TEXT,
     tm         TEXT,
     wm         INT,
     wm_match   BOOLEAN,
     flags      TEXT,
     ip         TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_lic ON license_telemetry (license_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS users (
     id         SERIAL PRIMARY KEY,
     username   TEXT UNIQUE NOT NULL,
     pass_hash  TEXT NOT NULL,
     salt       TEXT NOT NULL,
     contact    TEXT,
     gift_key   TEXT UNIQUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_login TIMESTAMPTZ
   )`,
  /* vai trò tài khoản: 'admin' = quản trị viên, 'member' = người chơi thường.
     ALTER IF NOT EXISTS để DB cũ (đã có bảng users) nâng cấp vô hại. */
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'`,
  `CREATE TABLE IF NOT EXISTS ratings (
     id         SERIAL PRIMARY KEY,
     score      INT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
     id         SERIAL PRIMARY KEY,
     action     TEXT NOT NULL,
     detail     TEXT,
     ip         TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  /* jar plugin đang host (admin nạp qua /api/admin/jar): version + tên file
     đọc từ plugin.yml BÊN TRONG file jar — mọi nơi hiển thị đều lấy từ đây.
     data giữ nguyên byte jar (Free ~0,4MB / Premium ~0,5MB, gọn hơn giới hạn
     body 4,5MB của Vercel nhiều). */
  `CREATE TABLE IF NOT EXISTS jar_files (
     kind         TEXT PRIMARY KEY,
     version      TEXT NOT NULL,
     plugin_name  TEXT NOT NULL,
     filename     TEXT NOT NULL,
     sha256       TEXT NOT NULL,
     size_bytes   INT  NOT NULL,
     data         BYTEA NOT NULL,
     uploaded_by  TEXT NOT NULL DEFAULT '',
     uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
];

/* 5 gói giá cài sẵn (giống bộ SOULLAND-SHOP) — admin sửa được trong /admin
   + gói "freegift" (enabled=0): KHÔNG bán, chỉ dùng làm gói cho key thường
     tặng khi đăng ký tài khoản (xem lib/users.ts + /api/auth/register). */
const SEED_PACKAGES = [
  { code: "prem30", name: "PREMIUM 30 NGÀY", days: 30, price_vnd: 13000, enabled: 1, sort: 1 },
  { code: "prem90", name: "PREMIUM 90 NGÀY", days: 90, price_vnd: 30000, enabled: 1, sort: 2 },
  { code: "prem180", name: "PREMIUM 180 NGÀY", days: 180, price_vnd: 63000, enabled: 1, sort: 3 },
  { code: "prem365", name: "PREMIUM 365 NGÀY", days: 365, price_vnd: 93000, enabled: 1, sort: 4 },
  { code: "lifetime", name: "PREMIUM LIFETIME", days: 0, price_vnd: 173000, enabled: 1, sort: 5 },
  { code: "freegift", name: "KEY BẢN THƯỜNG (FREE) — QUÀ ĐĂNG KÝ", days: 0, price_vnd: 0, enabled: 0, sort: -1 },
];

const SEED_SETTINGS = [
  { key: "bank_name", value: "Vietcombank" },
  { key: "bank_account", value: "0123456789" },
  { key: "bank_holder", value: "CHU SHOP DAU LA" },
];

/* Tài khoản QUẢN TRỊ VIÊN của chủ shop — seed 1 lần lúc khởi tạo DB.
   Đây là tài khoản duy nhất có role 'admin'; mọi tài khoản tự đăng ký
   qua /dang-ky đều là 'member' và KHÔNG BAO GIỜ được hiển thị ở bất kỳ
   danh sách công khai nào (web không có trang liệt kê thành viên). */
const ADMIN_SEED = { username: "TRUC_LINH", password: "TRUC_LINH" };

async function seedAdminUser(run: (text: string, params?: unknown[]) => Promise<unknown>) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(ADMIN_SEED.password, salt, 64).toString("hex");
  await run(
    `INSERT INTO users (username, pass_hash, salt, contact, gift_key, role)
     VALUES ($1,$2,$3,NULL,NULL,'admin')
     ON CONFLICT (username) DO NOTHING`,
    [ADMIN_SEED.username, hash, salt],
  );
  await run(`UPDATE users SET role='admin' WHERE lower(username)=lower($1)`, [ADMIN_SEED.username]);
}

async function initPgLite(): Promise<DbState> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  for (const st of SCHEMA_STATEMENTS) await db.exec(st);
  for (const p of SEED_PACKAGES) {
    await db.query(
      `INSERT INTO packages (code, name, days, price_vnd, enabled, sort)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING`,
      [p.code, p.name, p.days, p.price_vnd, p.enabled, p.sort],
    );
  }
  for (const s of SEED_SETTINGS) {
    await db.query(
      `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`,
      [s.key, s.value],
    );
  }
  await seedAdminUser((t, p) => db.query(t, (p || []) as any[]));
  return {
    q: async (text: string, params?: unknown[]) => {
      const res = await db.query(text, (params || []) as any[]);
      return (res.rows || []) as Row[];
    },
    ready: Promise.resolve(),
  };
}

async function initPostgres(): Promise<DbState> {
  const { default: postgres } = await import("postgres");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DATABASE_URL — xem .env.example");
  const sql = postgres(url, { ssl: "require", max: 5, idle_timeout: 20 });
  for (const st of SCHEMA_STATEMENTS) await sql.unsafe(st);
  for (const p of SEED_PACKAGES) {
    await sql.unsafe(
      `INSERT INTO packages (code, name, days, price_vnd, enabled, sort)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING`,
      [p.code, p.name, p.days, p.price_vnd, p.enabled, p.sort],
    );
  }
  for (const s of SEED_SETTINGS) {
    await sql.unsafe(
      `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`,
      [s.key, s.value],
    );
  }
  await seedAdminUser((t, p) => sql.unsafe(t, (p || []) as any[]));
  return {
    q: async (text: string, params?: unknown[]) => {
      const rows = await sql.unsafe(text, (params || []) as any[]);
      return rows as Row[];
    },
    ready: Promise.resolve(),
  };
}

/* Singleton dùng lại giữa các lambda invocation */
function getDb(): Promise<DbState> {
  if (!g.__daulaDb) {
    const useLite = process.env.USE_PG_LITE === "1" || !process.env.DATABASE_URL;
    g.__daulaDb = useLite ? initPgLite() : initPostgres();
  }
  return g.__daulaDb;
}

/** Chạy 1 câu SQL chuẩn PostgreSQL (placeholder $1, $2...) — trả mảng rows */
export async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  const db = await getDb();
  return db.q(text, params);
}

/** Ghi nhật ký bảo mật */
export async function log(action: string, detail: string, ip?: string): Promise<void> {
  try {
    await q(`INSERT INTO audit_logs (action, detail, ip) VALUES ($1,$2,$3)`, [
      action,
      detail.slice(0, 500),
      ip || "",
    ]);
  } catch {
    /* không để log làm gãy request */
  }
}

/** Sinh mã đơn SL + 6 ký tự ngẫu nhiên, tránh trùng */
export async function genOrderCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const rnd = cryptoRandom();
    const code = "SL" + rnd.toUpperCase();
    const dup = await q(`SELECT 1 FROM orders WHERE code=$1`, [code]);
    if (dup.length === 0) return code;
  }
  return "SL" + Date.now().toString(36).toUpperCase();
}

function cryptoRandom(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const buf = randomBytes(4);
  let out = "";
  for (const b of buf) out += alphabet[b % alphabet.length];
  return out;
}

import { randomBytes } from "node:crypto";
