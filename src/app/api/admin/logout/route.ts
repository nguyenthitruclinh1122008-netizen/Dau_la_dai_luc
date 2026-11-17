/* POST /api/admin/logout — xóa cookie admin */
import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const proto = (req.headers.get("x-forwarded-proto") || "http").split(",")[0].trim();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    maxAge: 0,
    path: "/",
  });
  return res;
}
