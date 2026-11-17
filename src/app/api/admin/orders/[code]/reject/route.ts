/* POST /api/admin/orders/[code]/reject — TỪ CHỐI đơn (thẻ cào sai, chưa nhận tiền...) */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q, log } from "@/lib/db";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  }
  try {
    const { code } = await ctx.params;
    const rows = await q(
      `UPDATE orders SET status='rejected', decided_at=now()
        WHERE code=$1 AND status='pending'
        RETURNING code`,
      [String(code).trim().toUpperCase()],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Đơn không tồn tại hoặc đã xử lý rồi" }, { status: 409 });
    }
    await log("ORDER_REJECT", rows[0].code, ipOf(req));
    return NextResponse.json({ ok: true, order_code: rows[0].code });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi từ chối đơn", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
