/* GET /api/admin/packages — xem gói (kể cả đã ẩn) + thông tin khuyến mãi
   PUT /api/admin/packages — sửa tên / giá / khuyến mãi / bật tắt từng gói */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q, log } from "@/lib/db";

export const dynamic = "force-dynamic";

const PKG_COLS = `code, name, days, price_vnd, sale_price, sale_start, sale_end, enabled, sort`;

/* Nhận "" / null / ISO string từ ô datetime-local → Date hoặc NULL */
function parseDt(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  try {
    const rows = await q(`SELECT ${PKG_COLS} FROM packages ORDER BY sort ASC`);
    return NextResponse.json({ packages: rows });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi đọc gói", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const list: {
      code?: string;
      name?: string;
      price_vnd?: number;
      sale_price?: number;
      sale_start?: string | null;
      sale_end?: string | null;
      enabled?: boolean;
    }[] = body.packages || [];
    for (const p of list) {
      const code = String(p.code || "").trim();
      if (!code) continue;
      if (typeof p.name === "string" && p.name.trim()) {
        await q(`UPDATE packages SET name=$2 WHERE code=$1`, [code, p.name.trim().slice(0, 60)]);
      }
      if (Number.isFinite(Number(p.price_vnd)) && Number(p.price_vnd) >= 0) {
        await q(`UPDATE packages SET price_vnd=$2 WHERE code=$1`, [code, Math.round(Number(p.price_vnd))]);
      }
      /* KHUYẾN MÃI: sale_price 0 = tắt giảm; có giá KM + (tùy chọn) khoảng thời gian.
         Giá KM ≥ giá gốc sẽ bị coi là không giảm (helper saleActive chặn sẵn). */
      if (Number.isFinite(Number(p.sale_price)) && Number(p.sale_price) >= 0) {
        await q(`UPDATE packages SET sale_price=$2 WHERE code=$1`, [code, Math.round(Number(p.sale_price))]);
      }
      const start = parseDt(p.sale_start);
      await q(`UPDATE packages SET sale_start=$2 WHERE code=$1`, [code, start]);
      const end = parseDt(p.sale_end);
      await q(`UPDATE packages SET sale_end=$2 WHERE code=$1`, [code, end]);
      if (typeof p.enabled === "boolean") {
        await q(`UPDATE packages SET enabled=$2 WHERE code=$1`, [code, p.enabled ? 1 : 0]);
      }
    }
    await log("PACKAGES_UPDATE", JSON.stringify(list).slice(0, 500));
    const rows = await q(`SELECT ${PKG_COLS} FROM packages ORDER BY sort ASC`);
    return NextResponse.json({ ok: true, packages: rows });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi sửa gói", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
