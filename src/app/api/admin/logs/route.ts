/* GET /api/admin/logs — nhật ký bảo mật (200 dòng mới nhất) */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  try {
    const rows = await q(
      `SELECT id, action, detail, ip, created_at FROM audit_logs ORDER BY id DESC LIMIT 200`,
    );
    return NextResponse.json({ logs: rows });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi đọc nhật ký", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
