/* GET /api/orders/[code] — khách tra cứu đơn theo mã (SLxxxxxx)
   Trả key chỉ khi đơn ĐÃ được admin duyệt và license còn hiệu lực. */
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { isExpired } from "@/lib/keys";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const rows = await q(
      `SELECT o.code, o.type, o.buyer_name, o.package_code, o.amount_vnd, o.status,
              o.created_at, o.decided_at,
              p.name AS pkg_name, p.days,
              l.key, l.expires_at, l.status AS license_status
         FROM orders o
         JOIN packages p ON p.code = o.package_code
         LEFT JOIN licenses l ON l.order_code = o.code
        WHERE o.code = $1`,
      [String(code).trim().toUpperCase()],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });
    }
    const r = rows[0];
    const licenseActive = r.license_status === "active" && !isExpired(r.expires_at);
    return NextResponse.json({
      order: {
        code: r.code,
        type: r.type,
        buyer_name: r.buyer_name,
        package_code: r.package_code,
        pkg_name: r.pkg_name,
        amount_vnd: r.amount_vnd,
        status: r.status,
        created_at: r.created_at,
        decided_at: r.decided_at,
      },
      /* key chỉ trả khi admin đã duyệt + key còn hiệu lực */
      key: r.status === "approved" && licenseActive ? r.key : null,
      expires_at: r.expires_at || null,
      lifetime: r.days === 0,
      license_status: r.license_status || null,
    });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi tra cứu", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
