/* =====================================================================
   lib/users.ts — TÀI KHOẢN NGƯỜI CHƠI + KEY BẢN THƯỜNG (QUÀ ĐĂNG KÝ)
   ---------------------------------------------------------------------
   • Đăng ký tài khoản xong → tặng ngay 1 KEY BẢN THƯỜNG (FREE) vĩnh viễn
   • Định dạng key thường:  FREE-XXXX-XXXX-XXXX  (giống hệt bộ SOULLAND-SHOP)
     - alphabet bỏ I L O U để không ai đọc nhầm
     - jar PREMIUM từ chối định dạng FREE- → key quà KHÔNG thể kích hoạt
       bản Premium (chống lạm dụng), chỉ dùng cho bản thường / xác minh
       thành viên trên web
   • Mật khẩu: scrypt (N=16384) + salt ngẫu nhiên 16 byte — không lưu chữ rõ
   • Phiên đăng nhập: cookie HttpOnly "dl_user" = user.<id>.<hết-hạn>.<HMAC>
     ký bằng APP_SECRET — sống 30 ngày
   ===================================================================== */

import crypto from "node:crypto";
import { q } from "./db";
import { appSecret } from "./auth";

/* ---------- KEY BẢN THƯỜNG (FREE) ---------- */

export const FREE_KEY_RE =
  /^FREE-[A-HJKMNPQRSTVWXYZ2-9]{4}-[A-HJKMNPQRSTVWXYZ2-9]{4}-[A-HJKMNPQRSTVWXYZ2-9]{4}$/;

const FREE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // 32 ký tự — bỏ I L O U

/** Sinh key thường FREE-XXXX-XXXX-XXXX, kiểm tra DB để chắc chắn không trùng */
export async function genFreeKey(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const buf = crypto.randomBytes(12);
    let body = "";
    for (let i = 0; i < 12; i++) body += FREE_ALPHABET[buf[i] % FREE_ALPHABET.length];
    const key =
      "FREE-" + body.slice(0, 4) + "-" + body.slice(4, 8) + "-" + body.slice(8, 12);
    const dup = await q(`SELECT 1 FROM licenses WHERE key=$1 UNION ALL SELECT 1 FROM users WHERE gift_key=$1`, [key]);
    if (dup.length === 0) return key;
  }
  // xác suất ~0 — vẫn chốt đường thoát an toàn
  return "FREE-" + Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").padEnd(12, "X").slice(0, 12).replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3");
}

/* ---------- MẬT KHẨU (scrypt + salt) ---------- */

export function newSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(String(password), String(salt), 64).toString("hex");
}

export function checkPassword(password: string, salt: string, hash: string): boolean {
  const a = Buffer.from(hashPassword(password, salt), "hex");
  const b = Buffer.from(String(hash || ""), "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ---------- THÔNG TIN FORM HỢP LỆ ---------- */

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function validateUsername(u: string): string | null {
  const s = String(u || "").trim();
  if (!USERNAME_RE.test(s))
    return "Tên đăng nhập 3–20 ký tự, chỉ dùng chữ không dấu, số và dấu gạch dưới (_)";
  return null;
}

export function validatePassword(p: string): string | null {
  const s = String(p || "");
  if (s.length < 6) return "Mật khẩu cần ít nhất 6 ký tự";
  if (s.length > 72) return "Mật khẩu tối đa 72 ký tự";
  return null;
}

/* ---------- PHIÊN ĐĂNG NHẬP (cookie dl_user, sống 30 ngày) ---------- */

export const USER_COOKIE = "dl_user";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  username: string;
  contact: string | null;
  gift_key: string | null;
  created_at: string;
  last_login: string | null;
  role: string; /* 'admin' = quản trị viên (duy nhất: TRUC_LINH), 'member' = người chơi */
  vip: number; /* 1 = tài khoản VIP (tải Premium qua web + key VIP riêng), 0 = thường */
}

export function makeUserToken(userId: number, ttlMs = THIRTY_DAYS_MS): string {
  const exp = Date.now() + ttlMs;
  const payload = "user." + Number(userId) + "." + exp;
  const sig = crypto.createHmac("sha256", appSecret()).update(payload).digest("base64url");
  return payload + "." + sig;
}

export function verifyUserToken(token?: string | null): number | null {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 4 || parts[0] !== "user") return null;
  const payload = parts[0] + "." + parts[1] + "." + parts[2];
  const expect = crypto.createHmac("sha256", appSecret()).update(payload).digest("base64url");
  const a = Buffer.from(parts[3]);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const id = Number(parts[1]);
  const exp = Number(parts[2]);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return id;
}

/** Lấy cookie dl_user thô từ request (tự decode nếu bị percent-encode) */
export function userCookieFrom(req: Request): string | null {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === USER_COOKIE) {
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

/** Trả user đang đăng nhập từ cookie, hoặc null */
export async function currentUser(req: Request): Promise<SessionUser | null> {
  const id = verifyUserToken(userCookieFrom(req));
  if (!id) return null;
  const rows = await q(
    `SELECT id, username, contact, gift_key, created_at, last_login, role, vip
       FROM users WHERE id=$1`,
    [id],
  );
  return (rows[0] as SessionUser) || null;
}

/** currentUser cho Server Component (đọc cookie từ next/headers, không có Request).
    FAIL-CLOSED: cookie sai / hết hạn / DB lỗi → null (không ai bị coi là TRUC_LINH khi lỗi). */
export async function currentUserFromCookie(token?: string | null): Promise<SessionUser | null> {
  try {
    const id = verifyUserToken(token);
    if (!id) return null;
    const rows = await q(
      `SELECT id, username, contact, gift_key, created_at, last_login, role, vip
         FROM users WHERE id=$1`,
      [id],
    );
    return (rows[0] as SessionUser) || null;
  } catch {
    return null;
  }
}

/** http hay https — quyết định cờ Secure của cookie (Vercel = https) */
export function isHttps(req: Request): boolean {
  if (req.url && req.url.startsWith("https://")) return true;
  const proto = req.headers.get("x-forwarded-proto") || "";
  return proto.split(",")[0].trim() === "https";
}

/** Gắn cookie phiên vào response */
export function attachSession(resHeaders: Headers, token: string, https: boolean, maxAgeSec = 30 * 24 * 60 * 60): void {
  const attrs = [
    `${USER_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (https) attrs.push("Secure");
  resHeaders.append("set-cookie", attrs.join("; "));
}

/** Xoá cookie phiên (đăng xuất) */
export function clearSession(resHeaders: Headers): void {
  resHeaders.append(
    "set-cookie",
    `${USER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}
