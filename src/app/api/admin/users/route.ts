/* GET /api/admin/users — danh sách tài khoản web (tab "Tài khoản" trong /admin)
   Kèm cờ VIP để admin bấm Nâng VIP / Gỡ VIP từng người. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  }
  const rows = await q(
    `SELECT id, username, role, vip, vip_since, contact, gift_key, created_at, last_login
       FROM users ORDER BY created_at DESC LIMIT 500`,
  );
  return NextResponse.json({
    users: rows.map((r: Record<string, unknown>) => ({
      ...r,
      vip: Number(r.vip) === 1,
    })),
  });
}
