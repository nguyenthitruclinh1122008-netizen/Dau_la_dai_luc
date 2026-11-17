/* GET /api/admin/packages — xem gói (kể cả đã ẩn)
   PUT /api/admin/packages — sửa tên / giá / bật tắt từng gói */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q, log } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  try {
    const rows = await q(`SELECT code, name, days, price_vnd, enabled, sort FROM packages ORDER BY sort ASC`);
    return NextResponse.json({ packages: rows });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi đọc gói", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const list: { code?: string; name?: string; price_vnd?: number; enabled?: boolean }[] = body.packages || [];
    for (const p of list) {
      const code = String(p.code || "").trim();
      if (!code) continue;
      if (typeof p.name === "string" && p.name.trim()) {
        await q(`UPDATE packages SET name=$2 WHERE code=$1`, [code, p.name.trim().slice(0, 60)]);
      }
      if (Number.isFinite(Number(p.price_vnd)) && Number(p.price_vnd) >= 0) {
        await q(`UPDATE packages SET price_vnd=$2 WHERE code=$1`, [code, Math.round(Number(p.price_vnd))]);
      }
      if (typeof p.enabled === "boolean") {
        await q(`UPDATE packages SET enabled=$2 WHERE code=$1`, [code, p.enabled ? 1 : 0]);
      }
    }
    await log("PACKAGES_UPDATE", JSON.stringify(list).slice(0, 300));
    const rows = await q(`SELECT code, name, days, price_vnd, enabled, sort FROM packages ORDER BY sort ASC`);
    return NextResponse.json({ ok: true, packages: rows });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi sửa gói", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
