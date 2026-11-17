/* GET /api/admin/settings — cấu hình thanh toán hiện tại
   PUT /api/admin/settings — đổi tên ngân hàng / số tài khoản / chủ tài khoản
   (QR VietQR của khách tự sinh theo cấu hình này) */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q, log } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALLOWED = ["bank_name", "bank_account", "bank_holder"];

export async function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  try {
    const rows = await q(`SELECT key, value FROM settings WHERE key = ANY($1)`, [ALLOWED]);
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return NextResponse.json({ settings: out });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi đọc cấu hình", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    for (const k of ALLOWED) {
      const v = String(body[k] ?? "").trim();
      if (v) {
        await q(
          `INSERT INTO settings (key, value) VALUES ($1,$2)
           ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
          [k, v.slice(0, 120)],
        );
      }
    }
    await log("SETTINGS_UPDATE", JSON.stringify(ALLOWED.map((k) => k + "=" + String(body[k] ?? "").slice(0, 20))));
    const rows = await q(`SELECT key, value FROM settings WHERE key = ANY($1)`, [ALLOWED]);
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return NextResponse.json({ ok: true, settings: out });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi lưu cấu hình", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
