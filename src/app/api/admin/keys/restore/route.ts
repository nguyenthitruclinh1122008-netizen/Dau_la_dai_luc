/* POST /api/admin/keys/restore — KHÔI PHỤC KEY CŨ VÀO DB (di trú từ server bản quyền cũ)
   ---------------------------------------------------------------------
   Body: { key, expires_at "YYYY-MM-DD", buyer, package_code }
   • CHỈ admin (cookie dl_admin sau 2 lớp đăng nhập như mọi route /api/admin).
   • Key phải đúng dạng DL-XXXX-XXXX-XXXX-XXXX; DB CHỈ LƯU BĂM (giống
     /api/admin/keys) — key thô không ghi xuống đâu cả.
   • Mục đích: tạo lại ĐÚNG key đã bán trước đây (cùng mã, cùng ngày hạn,
     cùng chủ) sau khi chuyển DB — KHÔNG sinh key mới.
   • Duplicate (key_hash trùng) → KEY_DA_CO kèm id bản ghi sẵn có. */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q, log } from "@/lib/db";
import { SHOP_KEY_RE, keyHash, maskKey } from "@/lib/keys";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const key = String(body.key || "").trim().toUpperCase();
    const expires = String(body.expires_at || "").trim();
    const buyer = String(body.buyer || "").trim().slice(0, 80) || "Khách trực tiếp";
    const pkg = String(body.package_code || "").trim().toLowerCase();

    if (!SHOP_KEY_RE.test(key))
      return NextResponse.json({ ok: false, reason: "KEY_SAI_DINH_DANG" }, { status: 200 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires))
      return NextResponse.json({ ok: false, reason: "SAI_NGAY_HAN", cu_phap: "YYYY-MM-DD" }, { status: 200 });
    const p = await q(`SELECT code, name FROM packages WHERE code=$1`, [pkg]);
    if (p.length === 0)
      return NextResponse.json(
        { ok: false, reason: "GOI_KHONG_TON_TAI", goi_hop_le: "prem30|prem90|prem180|prem365|lifetime" },
        { status: 200 },
      );
    const h = keyHash(key);
    const dup = await q(`SELECT id FROM licenses WHERE key_hash=$1 OR key=$2`, [h, key]);
    if (dup.length > 0)
      return NextResponse.json({ ok: false, reason: "KEY_DA_CO", id: dup[0].id }, { status: 200 });

    const rows = await q(
      `INSERT INTO licenses (key, key_hash, key_last4, order_code, package_code, expires_at, buyer, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active') RETURNING id, expires_at`,
      [
        "HASH:" + h.slice(0, 16),
        h,
        key.slice(-4),
        "RESTORE-" + Date.now().toString(36).toUpperCase(),
        pkg,
        expires,
        buyer,
      ],
    );
    await log("ADMIN_KEY_RESTORE", `lic#${rows[0].id} ${maskKey(key)} → ${pkg} · hạn ${expires} · ${buyer}`);
    return NextResponse.json({
      ok: true,
      id: rows[0].id,
      key_masked: maskKey(key),
      package_code: pkg,
      package_name: p[0].name,
      expires_at: rows[0].expires_at,
      buyer,
      status: "active",
    });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi khôi phục key", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
