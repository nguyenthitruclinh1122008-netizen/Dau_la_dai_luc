/* GET /api/packages — bảng giá công khai (gói đang bật bán) */
import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await q(
      `SELECT code, name, days, price_vnd, sort FROM packages
       WHERE enabled=1 ORDER BY sort ASC, price_vnd ASC`,
    );
    return NextResponse.json({ packages: rows });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi đọc bảng giá", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
