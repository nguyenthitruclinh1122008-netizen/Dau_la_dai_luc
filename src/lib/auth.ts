/* =====================================================================
   lib/auth.ts — ĐĂNG NHẬP /admin BẰNG ADMIN_SECRET
   ---------------------------------------------------------------------
   • Đăng nhập: POST {password} → so ADMIN_SECRET (constant-time)
   • Cookie dl_admin = "admin|<hạn hết>|<HMAC-SHA256(APP_SECRET)>"
     HttpOnly · SameSite=Lax · Secure (tự động trên https của Vercel)
   • Mọi route /api/admin/* gọi requireAdmin() kiểm tra cookie trước
   ===================================================================== */

import crypto from "node:crypto";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function appSecret(): string {
  return process.env.APP_SECRET || "daula-secret-key-2026-titanium-super-safe";
}

export function adminSecret(): string {
  return process.env.ADMIN_SECRET || "";
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Tạo token đăng nhập có hạn (mặc định 1 ngày) — dấu "." hợp lệ trong cookie */
export function makeAdminToken(ttlMs = ONE_DAY_MS): string {
  const exp = Date.now() + ttlMs;
  const payload = "admin." + exp;
  const sig = crypto.createHmac("sha256", appSecret()).update(payload).digest("base64url");
  return payload + "." + sig;
}

/** Kiểm tra token từ cookie — đúng chữ ký + chưa hết hạn */
export function verifyAdminToken(token?: string | null): boolean {
  if (!token) return false;
  const parts = String(token).split(".");
  if (parts.length !== 3 || parts[0] !== "admin") return false;
  const payload = parts[0] + "." + parts[1];
  const expect = crypto.createHmac("sha256", appSecret()).update(payload).digest("base64url");
  if (!safeEqual(parts[2], expect)) return false;
  const exp = Number(parts[1]);
  return Number.isFinite(exp) && exp > Date.now();
}

/** Lấy cookie dl_admin từ request (tự decode nếu bị percent-encode) */
export function adminCookieFrom(req: Request): string | null {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === ADMIN_COOKIE) {
      const v = rest.join("=");
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return null;
}

/** true nếu request có cookie admin hợp lệ */
export function requireAdmin(req: Request): boolean {
  return verifyAdminToken(adminCookieFrom(req));
}

/** So mật khẩu với ADMIN_SECRET (constant-time) */
export function checkAdminPassword(input: string): boolean {
  const real = adminSecret();
  if (!real) return false;
  return safeEqual(String(input || ""), real);
}

export const ADMIN_COOKIE = "dl_admin";
