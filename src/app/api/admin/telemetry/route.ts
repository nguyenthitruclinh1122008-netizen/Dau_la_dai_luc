/* GET /api/admin/telemetry — dữ liệu heartbeat của plugin (v3.0.1)
   • ?lic=<id>  → telemetry của 1 license
   • ?susp=1    → chỉ license đang bị đánh dấu nghi vấn
   Trả về: bảng license_telemetry (tm/wm/flags) + danh sách nghi vấn.
   Dùng để QUYẾT ĐỊNH SAU: thu hồi key, liên hệ người mua... */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const licId = Number(url.searchParams.get("lic") || 0);
    const onlySusp = url.searchParams.get("susp") === "1";

    let rows;
    if (licId > 0) {
      rows = await q(
        `SELECT t.*, l.key, l.buyer
           FROM license_telemetry t LEFT JOIN licenses l ON l.id = t.license_id
          WHERE t.license_id = $1
          ORDER BY t.created_at DESC LIMIT 200`,
        [licId],
      );
    } else if (onlySusp) {
      rows = await q(
        `SELECT t.*, l.key, l.buyer, l.suspicious
           FROM license_telemetry t JOIN licenses l ON l.id = t.license_id
          WHERE l.suspicious = true
          ORDER BY t.created_at DESC LIMIT 200`,
      );
    } else {
      rows = await q(
        `SELECT t.*, l.key, l.buyer
           FROM license_telemetry t LEFT JOIN licenses l ON l.id = t.license_id
          ORDER BY t.created_at DESC LIMIT 200`,
      );
    }
    const susp = await q(
      `SELECT id, key, buyer, server_id, wm, suspicious FROM licenses WHERE suspicious = true ORDER BY id DESC LIMIT 100`,
    );
    return NextResponse.json({ telemetry: rows, suspicious: susp });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi đọc telemetry", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
