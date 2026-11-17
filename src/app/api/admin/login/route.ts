/* POST /api/admin/login — đăng nhập bằng ADMIN_SECRET (constant-time)
   Đúng → đặt cookie dl_admin (HMAC-signed, HttpOnly, hạn 1 ngày) */
import { NextResponse } from "next/server";
import { checkAdminPassword, makeAdminToken, ADMIN_COOKIE } from "@/lib/auth";
import { log } from "@/lib/db";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = String(body.password || "");
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
