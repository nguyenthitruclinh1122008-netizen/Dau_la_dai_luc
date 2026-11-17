/* POST /api/admin/licenses/[id]/rebind — RESET BIND SERVER (mở lượt đổi máy)
   Xóa ID server đã gắn + đếm lượt đổi máy của 1 license.
   Dùng khi: khách đổi máy thật / bị kẻ khác dò key làm hết lượt. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q, log } from "@/lib/db";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const rows = await q(
      `UPDATE licenses SET server_id=NULL, server_changed_at=NULL, server_changes=0, fingerprint=NULL
        WHERE id=$1
        RETURNING id, key, buyer`,
      [Number(id)],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Key không tồn tại" }, { status: 404 });
    }
    await log("LICENSE_REBIND_RESET", "#" + rows[0].id + " · " + String(rows[0].key).slice(0, 24) + "…", ipOf(req));
    return NextResponse.json({ ok: true, reset_id: rows[0].id });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi reset bind", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
