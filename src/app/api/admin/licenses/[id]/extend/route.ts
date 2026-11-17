/* POST /api/admin/licenses/[id]/extend — GIA HẠN KEY — v3.5.0
   Body: { days: 30 } — cộng vào hạn hiện tại (tính từ hôm nay nếu đã hết hạn).
   Key vĩnh viễn (2275-12-31) + gia hạn → vẫn vĩnh viễn. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q, log } from "@/lib/db";
import { LIFETIME_DATE } from "@/lib/keys";
import { normDate } from "@/lib/license-lookup";

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
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(3650, Number(body.days || 30) || 30));
    const rows = await q(`SELECT id, key, key_last4, expires_at FROM licenses WHERE id=$1`, [Number(id)]);
    if (rows.length === 0) return NextResponse.json({ error: "Key không tồn tại" }, { status: 404 });
    const cur = normDate(rows[0].expires_at);
    if (cur === LIFETIME_DATE) {
      return NextResponse.json({ ok: true, expires_at: cur, lifetime: true, note: "Key VĨNH VIỄN — không cần gia hạn" });
    }
    const base = cur > new Date().toISOString().slice(0, 10) ? new Date(cur) : new Date();
    base.setDate(base.getDate() + days);
    const neo = base.toISOString().slice(0, 10);
    await q(`UPDATE licenses SET expires_at=$2, status='active' WHERE id=$1`, [Number(id), neo]);
    await log("LICENSE_EXTEND", "#" + id + " · " + cur + " → " + neo + " (+" + days + " ngày)", ipOf(req));
    return NextResponse.json({ ok: true, expires_at: neo });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi gia hạn", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
