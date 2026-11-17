/* =====================================================================
   lib/license-lookup.ts v3.5.0 — TRA KEY AN TOÀN (hash trước, legacy sau)
   ---------------------------------------------------------------------
   Đặc tả Phần 2 mục 2: "Key lưu dạng băm".
   • Cột mới: licenses.key_hash (SHA-256 hex), key_last4 (4 ký tự cuối để
     admin nhận diện). Key cấp MỚI CHỈ lưu băm — key thô trả khách 1 lần.
   • Tự nâng schema lúc chạy (Netlify không chạy migration tay):
     ALTER TABLE … ADD COLUMN IF NOT EXISTS — lỗi thì bỏ qua im lặng.
   • Key CŨ (cột key còn plaintext): tra thẳng key=; nếu trúng thì tự
     backfill key_hash để lần sau đi đường hash. Không phá key hiện hữu.
   ===================================================================== */
import { q } from "./db";
import { keyHash } from "./keys";

let migrated = false;

export async function ensureKeyHashColumn(): Promise<void> {
  if (migrated) return;
  try {
    await q(
      `ALTER TABLE licenses ADD COLUMN IF NOT EXISTS key_hash TEXT;
       ALTER TABLE licenses ADD COLUMN IF NOT EXISTS key_last4 TEXT;`,
    );
    migrated = true;
  } catch {
    /* một số driver không chấp nhận 2 lệnh — thử từng lệnh */
    try { await q(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS key_hash TEXT`); } catch {}
    try { await q(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS key_last4 TEXT`); } catch {}
    migrated = true;
  }
}

export interface LicRow {
  id?: number;
  key?: string;
  key_hash?: string | null;
  key_last4?: string | null;
  status?: string;
  buyer?: string;
  expires_at?: string | Date | null;
  package_code?: string;
  server_id?: string | null;
  fingerprint?: string | null;
  server_changed_at?: string | Date | null;
  server_changes?: number | null;
  wm?: number | null;
  [k: string]: unknown;
}

/* v3.5.0 — chuẩn hóa ngày hết hạn: PGlite trả Date object, Neon trả string.
   Luôn chốt về "YYYY-MM-DD" để vé ký + so hạn đúng trên mọi DB. */
export function normDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

function normRows(rows: LicRow[]): LicRow[] {
  for (const r of rows) {
    r.expires_at = normDate(r.expires_at);
  }
  return rows;
}

/** Trả dòng license theo key (hash trước → legacy sau + backfill) */
export async function findLicense(key: string): Promise<LicRow[]> {
  const k = String(key || "").trim().toUpperCase();
  if (!k) return [];
  await ensureKeyHashColumn();
  const h = keyHash(k);
  /* 1) đường hash chính */
  const byHash = await q(`SELECT * FROM licenses WHERE key_hash=$1`, [h]);
  if (byHash.length > 0) return normRows(byHash as LicRow[]);
  /* 2) legacy: key cũ lưu plaintext */
  const legacy = await q(`SELECT * FROM licenses WHERE key=$1`, [k]);
  if (legacy.length > 0) {
    try {
      await q(`UPDATE licenses SET key_hash=$2, key_last4=$3 WHERE id=$1 AND (key_hash IS NULL OR key_hash='')`,
        [legacy[0].id, h, k.slice(-4)]);
    } catch {}
  }
  return normRows(legacy as LicRow[]);
}
