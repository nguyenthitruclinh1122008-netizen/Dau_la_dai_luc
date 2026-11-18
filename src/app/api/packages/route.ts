/* GET /api/packages — bảng giá công khai (gói đang bật bán)
   Trả kèm thông tin khuyến mãi: price_vnd = giá gốc (để gạch ngang khi giảm),
   price = giá hiệu lực (đang KM → sale_price, hết giờ → tự về giá gốc),
   on_sale + discount_pct để giao diện vẽ nhãn "-X%". */
import { NextResponse } from "next/server";
import { q, effPrice, saleActive, salePercent } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await q(
      `SELECT code, name, days, price_vnd, sale_price, sale_start, sale_end, sort FROM packages
       WHERE enabled=1 ORDER BY sort ASC, price_vnd ASC`,
    );
    const now = new Date();
    const packages = rows.map((p) => ({
      code: p.code,
      name: p.name,
      days: Number(p.days),
      price_vnd: Number(p.price_vnd),
      sale_price: Number(p.sale_price || 0),
      on_sale: saleActive(p, now),
      price: effPrice(p, now),
      discount_pct: salePercent(p, now),
      sort: Number(p.sort),
    }));
    return NextResponse.json({ packages });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi đọc bảng giá", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
