/* GET /api/admin/orders — xem TẤT CẢ giao dịch (đơn hàng + key đã cấp) */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  }
  try {
    const rows = await q(
      `SELECT o.code, o.type, o.buyer_name, o.buyer_contact, o.package_code, o.amount_vnd,
              o.note, o.status, o.created_at, o.decided_at, p.name AS pkg_name, p.days,
              l.id AS license_id, l.key, l.expires_at, l.status AS license_status
         FROM orders o
         JOIN packages p ON p.code = o.package_code
         LEFT JOIN licenses l ON l.order_code = o.code
        ORDER BY (o.status = 'pending') DESC, o.created_at DESC
        LIMIT 500`,
    );
    const stats = await q(
      `SELECT
         COUNT(*) FILTER (WHERE status='pending')::int  AS pending,
         COUNT(*) FILTER (WHERE status='approved')::int AS approved,
         COUNT(*) FILTER (WHERE status='rejected')::int AS rejected,
         COALESCE(SUM(amount_vnd) FILTER (WHERE status='approved'),0)::int AS revenue_vnd
       FROM orders`,
    );
    return NextResponse.json({ orders: rows, stats: stats[0] });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi đọc đơn", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
