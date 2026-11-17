/* GET /api/admin/licenses — danh sách key đã cấp (tra ai mua + còn hạn không) */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { isExpired } from "@/lib/keys";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  try {
    const rows = await q(
      `SELECT l.id, l.key, l.order_code, l.package_code, l.expires_at, l.status,
              l.buyer, l.created_at, l.revoked_at, l.server_id, l.server_changes,
              l.wm, l.suspicious, p.name AS pkg_name
         FROM licenses l
         LEFT JOIN packages p ON p.code = l.package_code
        ORDER BY l.created_at DESC
        LIMIT 500`,
    );
    /* gắn cờ còn hạn tính theo NGÀY HẾT HẠN NHÚNG TRONG KEY */
    const out = rows.map((r) => ({ ...r, still_valid: r.status === "active" && !isExpired(r.expires_at) }));
    return NextResponse.json({ licenses: out });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi đọc key", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
