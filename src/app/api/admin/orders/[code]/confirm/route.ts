/* POST /api/admin/orders/[code]/confirm — DUYỆT ĐƠN & CẤP KEY
   Nguyên tử: WHERE status='pending' RETURNING — 2 admin bấm cùng lúc thì
   người thứ 2 nhận 409 (1 đơn = 1 key duy nhất).
   Key sinh đúng thuật toán plugin: hạn = ngày duyệt + days của gói;
   gói LIFETIME → hạn 2275-12-31 (dùng vĩnh viễn). KHÔNG có auto-approve. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q, log } from "@/lib/db";
import { genShopKey, expiryDateForDays, LIFETIME_DATE } from "@/lib/keys";

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
    const orderCode = String(code).trim().toUpperCase();

    /* 1) duyệt đơn — chỉ khi còn pending */
    const upd = await q(
      `UPDATE orders SET status='approved', decided_at=now()
        WHERE code=$1 AND status='pending'
        RETURNING code, buyer_name, package_code`,
      [orderCode],
    );
    if (upd.length === 0) {
      const exists = await q(`SELECT status FROM orders WHERE code=$1`, [orderCode]);
      return NextResponse.json(
        { error: exists.length > 0 ? "Đơn này đã được xử lý rồi (trạng thái: " + exists[0].status + ")" : "Không tìm thấy đơn" },
        { status: exists.length > 0 ? 409 : 404 },
      );
    }
    const order = upd[0];

    /* 2) sinh key theo gói — key v2.3 chỉ là mã tra cứu DB (không nhúng bí mật)
       v3.0.1: admin có thể yêu cầu key cố định (fixed_key) — vd cấp lại đúng
       key chủ shop. Chỉ nhận khi đúng định dạng + chưa tồn tại. */
    const bodyJson = await req.json().catch(() => ({}));
    const pkg = (await q(`SELECT name, days FROM packages WHERE code=$1`, [order.package_code]))[0];
    const expiry = pkg.days > 0 ? expiryDateForDays(pkg.days) : LIFETIME_DATE;
    let key = genShopKey();
    const want = String((bodyJson as Record<string, unknown>)?.fixed_key || "").trim().toUpperCase();
    if (/^DL-[A-HJKMNPQRSTVWXYZ2-9]{4}(-[A-HJKMNPQRSTVWXYZ2-9]{4}){3}$/.test(want)) {
      const dupWant = await q(`SELECT 1 FROM licenses WHERE key=$1`, [want]);
      if (dupWant.length === 0) key = want;
    }
    for (let tries = 0; tries < 5; tries++) {
      const dup = await q(`SELECT 1 FROM licenses WHERE key=$1`, [key]);
      if (dup.length === 0) break;
      key = genShopKey();
    }

    /* 3) ghi license + nối vào đơn */
    const lic = await q(
      `INSERT INTO licenses (key, order_code, package_code, expires_at, buyer)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [key, order.code, order.package_code, expiry, order.buyer_name],
    );
    await q(`UPDATE orders SET license_id=$2 WHERE code=$1`, [order.code, lic[0].id]);
    await log("ORDER_CONFIRM", order.code + " → key " + key.slice(0, 24) + "… · hạn " + expiry, ipOf(req));

    return NextResponse.json({
      ok: true,
      order_code: order.code,
      pkg_name: pkg.name,
      buyer_name: order.buyer_name,
      license_key: key,
      expires_at: expiry,
      lifetime: pkg.days === 0,
    });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi duyệt đơn", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
