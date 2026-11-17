/* GET  /api/ratings — điểm đánh giá trung bình + số lượt
   POST /api/ratings — khách chấm điểm 1-10 (KHÔNG cần tài khoản Gmail) */
import { NextResponse } from "next/server";
import { q, log } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await q(
      `SELECT COALESCE(AVG(score),0)::float AS avg, COUNT(*)::int AS count FROM ratings`,
    );
    const r = rows[0] || { avg: 0, count: 0 };
    return NextResponse.json({ avg: Math.round(r.avg * 10) / 10, count: r.count });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi đọc điểm", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const score = Number(body.score);
    if (!Number.isFinite(score) || score < 1 || score > 10) {
      return NextResponse.json({ error: "Điểm phải từ 1 đến 10" }, { status: 400 });
    }
    await q(`INSERT INTO ratings (score) VALUES ($1)`, [Math.round(score)]);
    const rows = await q(
      `SELECT COALESCE(AVG(score),0)::float AS avg, COUNT(*)::int AS count FROM ratings`,
    );
    const r = rows[0] || { avg: score, count: 1 };
    await log("RATING", "score=" + Math.round(score));
    return NextResponse.json({ ok: true, avg: Math.round(r.avg * 10) / 10, count: r.count });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi gửi điểm", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
