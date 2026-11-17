/* GET /api/admin/me — kiểm tra phiên đăng nhập admin hiện tại */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return NextResponse.json({ admin: requireAdmin(req) });
}
