/* POST /api/admin/keys — TẠO KEY TRỰC TIẾP (không cần đơn) — v3.5.0
   Body: { kind: "free" | "premium", days: 0=lifetime|30|90|180|365, count ≤ 20,
           buyer, note }
   • key thường  → FREE-XXXX-XXXX-XXXX (dùng cho bản Free)
   • key premium → DL-XXXX-XXXX-XXXX-XXXX (dùng cho bản Premium)
   • days=0      → PREMIUM VÔ HẠN (hạn 2275-12-31)
   • DB chỉ LƯU BĂM (key_hash) — key thô trả về đúng 1 lần trong response,
     admin copy gửi khách. Mất là cấp key khác.
   GET — liệt kê key gần đây (key băm hiển thị dạng ****1234). */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { q, log } from "@/lib/db";
import { genShopKey, keyHash, LIFETIME_DATE, expiryDateForDays, SHOP_KEY_RE } from "@/lib/keys";
import { ensureKeyHashColumn } from "@/lib/license-lookup";
import { genFreeKey } from "@/lib/users";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

export async function POST(req: Request) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || "premium").trim();
    const days = Math.max(0, Math.min(3650, Number(body.days ?? 90) || 0));
    const count = Math.max(1, Math.min(20, Number(body.count || 1) || 1));
    const buyer = String(body.buyer || "Khách trực tiếp").trim().slice(0, 60);
    const note = String(body.note || "").trim().slice(0, 200);

    await ensureKeyHashColumn();
    const made: { key: string; expires_at: string; kind: string }[] = [];
    for (let i = 0; i < count; i++) {
      let key = "";
      let expires = days === 0 ? LIFETIME_DATE : expiryDateForDays(days);
      let pkgCode = "direct-premium";
      if (kind === "free") {
        key = await genFreeKey();
        pkgCode = "freegift";
        expires = LIFETIME_DATE; /* key thường không tự hết hạn (quản bằng thu hồi) */
      } else {
        for (let tries = 0; tries < 5; tries++) {
          key = genShopKey();
          const dup = await q(`SELECT 1 FROM licenses WHERE key=$1 OR key_hash=$2`, [key, keyHash(key)]);
          if (dup.length === 0) break;
          key = "";
        }
        if (!key) return NextResponse.json({ error: "Không sinh được key mới (trùng)" }, { status: 500 });
      }
      /* key premium MỚI: CHỈ LƯU BĂM (đặc tả Phần 2 mục 2). Cột key (NOT NULL)
         nhận placeholder KHÔNG bí mật "HASH:<16 hex băm>" — tra cứu thật luôn
         đi qua key_hash. key free giữ plaintext (tương thích tra cứu cũ). */
      const rawCol = kind === "free" ? key : "HASH:" + keyHash(key).slice(0, 16);
      await q(
        `INSERT INTO licenses (key, key_hash, key_last4, order_code, package_code, expires_at, buyer, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active')`,
        [rawCol, keyHash(key), key.slice(-4), "DIRECT-" + Date.now().toString(36).toUpperCase(), pkgCode, expires, buyer],
      );
      made.push({ key, expires_at: expires, kind });
      await log("KEY_DIRECT_CREATE", `${kind.toUpperCase()} ${key.slice(0, 8)}… · hạn ${expires} · ${buyer}`, ipOf(req));
    }
    return NextResponse.json({ ok: true, keys: made });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi tạo key", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Chưa đăng nhập /admin" }, { status: 401 });
  }
  await ensureKeyHashColumn();
  const rows = await q(
    `SELECT id, key, key_last4, package_code, expires_at, buyer, status, created_at
       FROM licenses ORDER BY created_at DESC LIMIT 50`,
  );
  return NextResponse.json({
    keys: rows.map((r: Record<string, unknown>) => ({
      ...r,
      key: r.key ? String(r.key) : "****" + String(r.key_last4 || "????"),
      hashed: !r.key,
    })),
  });
}
