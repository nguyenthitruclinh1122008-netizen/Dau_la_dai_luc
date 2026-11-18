/* POST /api/admin/users/[id]/vip — NÂNG VIP / GỠ VIP cho 1 tài khoản web
   Body JSON: { on: true }  → nâng VIP + tự cấp 1 key Premium VĨNH VIỄN
                                (key thô trả về ĐÚNG 1 LẦN — DB chỉ lưu băm)
              { on: false } → gỡ VIP + thu hồi đúng key VIP đã cấp (không
                                đụng key khách mua bằng đơn hàng) */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { grantVip, revokeVip } from "@/lib/vip";

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
    const userId = Number(String(id).trim());
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "ID tài khoản không hợp lệ" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const on = Boolean((body as Record<string, unknown>).on);
    const ip = ipOf(req);
    const result = on ? await grantVip(userId, ip) : await revokeVip(userId, ip);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const raw = String((e as Error).message || e);
    const notFound = raw.includes("KHONG_TIM_THAY_USER");
    return NextResponse.json(
      {
        error: notFound
          ? "Không tìm thấy tài khoản này"
          : "Lỗi đổi trạng thái VIP: " + raw.slice(0, 150),
      },
      { status: notFound ? 404 : 500 },
    );
  }
}
