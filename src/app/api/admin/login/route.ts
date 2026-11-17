/* POST /api/admin/login — đăng nhập bằng ADMIN_SECRET (constant-time)
   LỚP 1: phải có phiên đăng nhập của ĐÚNG TRUC_LINH (so username) — role admin khác cũng không đủ.
   LỚP 2: nhập đúng ADMIN_SECRET → đặt cookie dl_admin (HMAC-signed, HttpOnly, hạn 1 ngày) */
import { NextResponse } from "next/server";
import { checkAdminPassword, makeAdminToken, ADMIN_COOKIE } from "@/lib/auth";
import { currentUser } from "@/lib/users";
import { log } from "@/lib/db";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = String(body.password || "");
  /* Lớp 1 — phiên TRUC_LINH bắt buộc: không có phiên / phiên của người khác → 403 */
  const u = await currentUser(req).catch(() => null);
  if (!u || u.username !== "TRUC_LINH") {
    await log("ADMIN_LOGIN_FAIL", "Không phải phiên TRUC_LINH /admin", ipOf(req));
    return NextResponse.json(
      { error: "Phải đăng nhập tài khoản TRUC_LINH trước khi nhập mật khẩu quản trị" },
      { status: 403 },
    );
  }
  if (!checkAdminPassword(password)) {
    await log("ADMIN_LOGIN_FAIL", "Sai mật khẩu /admin", ipOf(req));
    return NextResponse.json({ error: "Mật khẩu không đúng" }, { status: 401 });
  }
  const token = makeAdminToken();
  await log("ADMIN_LOGIN_OK", "Đăng nhập /admin", ipOf(req));
  /* secure chỉ bật trên https (Vercel tự có) — localhost HTTP vẫn test được */
  const proto = (req.headers.get("x-forwarded-proto") || "http").split(",")[0].trim();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    maxAge: 24 * 60 * 60,
    path: "/",
  });
  return res;
}
