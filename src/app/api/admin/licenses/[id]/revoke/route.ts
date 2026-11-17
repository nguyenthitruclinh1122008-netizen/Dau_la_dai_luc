/* POST /api/admin/licenses/[id]/revoke — KHÓA / THU HỒI KEY
   Khóa xong: verify-key trả false|KEY_DA_THU_HOI, tải Premium bị 403,
   plugin server khách vẫn chặn bằng ngày hạn trong key khi key hết hạn. */
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
      `UPDATE licenses SET status='revoked', revoked_at=now()
        WHERE id=$1 AND status='active'
        RETURNING id, key, buyer`,
      [Number(id)],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Key không tồn tại hoặc đã bị khóa rồi" }, { status: 409 });
    }
    await log("LICENSE_REVOKE", "#" + rows[0].id + " · " + String(rows[0].key).slice(0, 24) + "… · " + rows[0].buyer, ipOf(req));
    return NextResponse.json({ ok: true, revoked_id: rows[0].id });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi khóa key", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
