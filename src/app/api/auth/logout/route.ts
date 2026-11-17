/* POST /api/auth/logout — đăng xuất (xoá cookie phiên) */
import { NextResponse } from "next/server";
import { clearSession } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true, message: "Đã đăng xuất." });
  clearSession(res.headers);
  return res;
}
