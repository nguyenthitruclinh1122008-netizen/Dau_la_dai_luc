/* POST /api/verify-key — kiểm tra key (công khai — server game / công cụ dùng)
   Nguồn sự thật = NGÀY HẾT HẠN NHÚNG TRONG KEY (plugin kiểm tra offline
   bằng cùng thuật toán); database chỉ dùng để tra chủ sở hữu + khóa key. */
import { NextResponse } from "next/server";
import { q, log } from "@/lib/db";
import { decodeAny, isMasterKey, isExpired, SHOP_KEY_RE } from "@/lib/keys";
import { findLicense } from "@/lib/license-lookup";
import { FREE_KEY_RE } from "@/lib/users";

export const dynamic = "force-dynamic";

function maskName(s: string): string {
  const t = String(s || "");
  if (t.length <= 2) return t + "***";
  return t.slice(0, 2) + "***";
}

async function verify(key: string) {
  /* ---- nhánh KEY BẢN THƯỜNG (FREE-…) — quà đăng ký tài khoản ---- */
  const k = String(key).trim().toUpperCase();
  if (k.startsWith("FREE-")) {
    if (!FREE_KEY_RE.test(k)) {
      await log("KEY_VERIFY_FAIL", "FREE sai định dạng · " + k.slice(0, 30));
      return { valid: false, reason: "KEY_SAI_DINH_DANG" };
    }
    const lic = await findLicense(k);
    if (lic.length === 0) {
      await log("KEY_VERIFY_FAIL", "FREE không tồn tại · " + k.slice(0, 30));
      return { valid: false, reason: "KEY_KHONG_TON_TAI" };
    }
    if (lic[0].status === "revoked") {
      await log("KEY_VERIFY_FAIL", "FREE bị thu hồi · " + k.slice(0, 30));
      return { valid: false, reason: "KEY_DA_THU_HOI" };
    }
    await log("KEY_VERIFY_OK", "KEY BẢN THƯỜNG " + k.slice(0, 30));
    return {
      valid: true,
      plan: lic[0].pkg_name || "BẢN THƯỜNG (FREE)",
      expires_at: null,
      lifetime: true,
      holder: maskName(lic[0].buyer || "thành viên"),
    };
  }

  /* ---- nhánh KEY SHOP v2.3 (DL-XXXX-XXXX-XXXX-XXXX) — hạn dùng nằm trong DB ---- */
  if (SHOP_KEY_RE.test(k)) {
    const lic = await findLicense(k);
    if (lic.length === 0) {
      await log("KEY_VERIFY_FAIL", "DL không tồn tại · " + k.slice(0, 30));
      return { valid: false, reason: "KEY_KHONG_TON_TAI" };
    }
    if (lic[0].status === "revoked") {
      await log("KEY_VERIFY_FAIL", "DL bị thu hồi · " + k.slice(0, 30));
      return { valid: false, reason: "KEY_DA_THU_HOI" };
    }
    if (isExpired(lic[0].expires_at == null ? null : String(lic[0].expires_at))) {
      await log("KEY_VERIFY_FAIL", "DL hết hạn · " + k.slice(0, 30));
      return { valid: false, reason: "KEY_HET_HAN", expires_at: String(lic[0].expires_at).slice(0, 10) };
    }
    await log("KEY_VERIFY_OK", "KEY PREMIUM v2.3 " + k.slice(0, 30));
    return {
      valid: true,
      plan: lic[0].pkg_name || "PREMIUM",
      expires_at: String(lic[0].expires_at).slice(0, 10),
      lifetime: String(lic[0].expires_at).slice(0, 10) === "2275-12-31",
      holder: maskName(lic[0].buyer || "Khách VIP"),
    };
  }

  const d = decodeAny(key);
  if (!d.ok) {
    await log("KEY_VERIFY_FAIL", (d.reason || "") + " · " + String(key).slice(0, 30));
    return { valid: false, reason: d.reason };
  }
  if (!d.dotted && isMasterKey(key)) {
    await log("KEY_VERIFY_OK", "KEY CHỦ " + String(key).slice(0, 30));
    return { valid: true, plan: "KEY CHỦ — vĩnh viễn", expires_at: d.expiry, lifetime: true, holder: "Chủ Shop" };
  }
  const lic = await q(`SELECT * FROM licenses WHERE key=$1`, [String(key).trim()]);
  if (lic.length > 0 && lic[0].status === "revoked") {
    return { valid: false, reason: "KEY_DA_THU_HOI" };
  }
  if (d.expired) {
    return { valid: false, reason: "KEY_HET_HAN", expires_at: d.expiry };
  }
  const holder = lic.length > 0 ? lic[0].buyer : null;
  const pkg = lic.length > 0
    ? (await q(`SELECT name FROM packages WHERE code=$1`, [lic[0].package_code]))[0]?.name
    : null;
  await log("KEY_VERIFY_OK", String(key).slice(0, 30));
  return {
    valid: true,
    plan: pkg || "PREMIUM",
    expires_at: d.expiry,
    lifetime: d.lifetime,
    holder: holder ? maskName(holder) : maskName(d.name || "(ngoài sổ)"),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const key = String(body.key || "");
    if (!key.trim()) return NextResponse.json({ valid: false, reason: "KEY_TRONG" });
    return NextResponse.json(await verify(key));
  } catch (e) {
    return NextResponse.json({ error: "Lỗi kiểm key", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = String(url.searchParams.get("key") || "");
    if (!key.trim()) return NextResponse.json({ valid: false, reason: "KEY_TRONG" });
    return NextResponse.json(await verify(key));
  } catch (e) {
    return NextResponse.json({ error: "Lỗi kiểm key", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
