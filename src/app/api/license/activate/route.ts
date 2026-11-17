/* POST /api/license/activate — plugin Premium v2.3.0 gọi khi kích hoạt
   Body: { key, hwid (ID server Minecraft), nonce }
   • CHỈ nhận key trong DB (hoặc KEY CHỦ) — key tự kiểm trong máy KHÔNG
     còn tồn tại (yêu cầu 1–2/10 điểm).
   • Bind theo ID server cấp lúc kích hoạt; đổi server tối đa
     LICENSE_REBIND_LIMIT (1–2) lần trong 30 ngày (yêu cầu 6/10 điểm).
   • Trả VÉ ký Ed25519 ngắn hạn 15–60 phút + grace 24–72 giờ + blob
     tính năng premium — plugin thẩm định bằng khóa công khai nhúng.
   • v3.15.5 — HỢP ĐỒNG HTTP CHO PLUGIN: MỌI từ chối LOGIC license (key
     sai, thiếu trường, key FREE, key định dạng cũ, rate-limit, key
     không tồn tại, thu hồi, hết hạn, đổi máy hết lượt...) đều trả
     HTTP **200** + body {"ok":false,"reason":"..."}. Lý do: HTTP client
     của plugin coi mọi status ≥400 = "mất kết nối" → admin thấy sai
     lý do. Chỉ lỗi HẠ TẦNG (DB...) mới giữ 500 (plugin báo mất kết
     nối là đúng). */
import { NextResponse } from "next/server";
import { q, log } from "@/lib/db";
import { isExpired } from "@/lib/keys";
import {
  signSession, rsaSignSession, premiumBlobB64, MASTER_KEYS, REBIND_LIMIT,
  SESSION_MINUTES, GRACE_HOURS, wmForLicense,
} from "@/lib/license-server";
import { findLicense } from "@/lib/license-lookup";
import { keyHash } from "@/lib/keys";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
}

/* v3.5.0 — RATE LIMIT THEO KEY: quá 10 lần THẤT BẠI/15 phút/key → từ chối
   (chống dò key bằng cách spam activate). In-memory từng instance — lớp 2
   bên cạnh rate limit theo IP đã có.
   v3.15.5 — logic throttle GIỮ NGUYÊN, chỉ đổi status trả ra 429→200
   theo hợp đồng plugin (ok:false + reason vẫn báo đủ). */
const keyFails = new Map<string, number[]>();
function keyRateLimited(k: string): boolean {
  const now = Date.now();
  const arr = (keyFails.get(k) || []).filter((t) => now - t < 15 * 60_000);
  return arr.length >= 10;
}
function noteKeyFail(k: string): void {
  const now = Date.now();
  const arr = (keyFails.get(k) || []).filter((t) => now - t < 15 * 60_000);
  arr.push(now);
  keyFails.set(k, arr);
  if (keyFails.size > 5000) keyFails.clear();
}

const LIFETIME = "2275-12-31";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const key = String(body.key || "").trim();
    const hwid = String(body.hwid || "").trim().slice(0, 40);
    const nonce = String(body.nonce || "").trim().slice(0, 64);
    if (!key) return NextResponse.json({ ok: false, reason: "KEY_TRONG" }, { status: 200 });
    if (!hwid) return NextResponse.json({ ok: false, reason: "THIEU_HWID" }, { status: 200 });

    /* key bản thường không dùng cho Premium */
    if (key.toUpperCase().startsWith("FREE-")) {
      await log("LICENSE_ACTIVATE_FAIL", "FREE key cho Premium · " + key.slice(0, 30), ipOf(req));
      return NextResponse.json({ ok: false, reason: "KEY_BAN_THUONG" }, { status: 200 });
    }
    /* key định dạng cũ (payload.chữ-ký HMAC) đã ngừng cấp vé */
    if (key.includes(".")) {
      await log("LICENSE_ACTIVATE_FAIL", "key định dạng cũ · " + key.slice(0, 30), ipOf(req));
      return NextResponse.json({ ok: false, reason: "KEY_DANG_CU" }, { status: 200 });
    }

    /* v3.5.0 — chống dò key: khóa thử 10 lần lỗi/15 phút */
    const knorm = key.toUpperCase();
    if (keyRateLimited(knorm)) {
      await log("LICENSE_ACTIVATE_LIMIT", "quá 10 lần lỗi/15p · " + key.slice(0, 24) + "…", ipOf(req));
      return NextResponse.json({ ok: false, reason: "QUA_NHIEU_LOI_THU", detail: "Thu lai sau 15 phut" }, { status: 200 });
    }
    const lic = await findLicense(key);
    const isMaster = MASTER_KEYS.includes(knorm);

    if (lic.length === 0 && !isMaster) {
      noteKeyFail(knorm);
      await log("LICENSE_ACTIVATE_FAIL", "key lạ · " + key.slice(0, 30), ipOf(req));
      return NextResponse.json({ ok: false, reason: "KEY_KHONG_TON_TAI" }, { status: 200 });
    }
    if (lic.length > 0 && lic[0].status === "revoked") {
      noteKeyFail(knorm);
      await log("LICENSE_ACTIVATE_FAIL", "bị thu hồi · " + key.slice(0, 30), ipOf(req));
      return NextResponse.json({ ok: false, reason: "KEY_DA_THU_HOI" }, { status: 200 });
    }

    /* hạn dùng: cột DB */
    let expiry: string | null = lic.length > 0 ? String(lic[0].expires_at).slice(0, 10) : LIFETIME;
    const lifetime = isMaster || expiry === LIFETIME;
    if (!lifetime && expiry && isExpired(expiry)) {
      noteKeyFail(knorm);
      await log("LICENSE_ACTIVATE_FAIL", "hết hạn · " + key.slice(0, 30), ipOf(req));
      return NextResponse.json({ ok: false, reason: "KEY_HET_HAN", expires_at: expiry }, { status: 200 });
    }

    /* bind ID server + giới hạn đổi máy (KEY CHỦ không giới hạn) */
    if (lic.length > 0 && !isMaster) {
      const bound: string | null = (lic[0].server_id ?? lic[0].fingerprint ?? null) as string | null;
      const changedAt = lic[0].server_changed_at ? new Date(lic[0].server_changed_at) : null;
      let changes: number = Number(lic[0].server_changes ?? 0);
      if (changedAt && Date.now() - changedAt.getTime() > 30 * 24 * 3600e3) {
        changes = 0; /* cửa sổ 30 ngày đã qua → reset lượt */
      }
      if (!bound) {
        await q(
          `UPDATE licenses SET server_id=$1, server_changed_at=now(), server_changes=0,
             fingerprint=COALESCE(fingerprint,$1) WHERE id=$2`,
          [hwid, lic[0].id],
        );
        await log("LICENSE_BIND", `lic#${lic[0].id} → ${hwid} (lần đầu)`, ipOf(req));
      } else if (bound === hwid) {
        /* đúng server đã bind → ok */
      } else if (changes >= REBIND_LIMIT) {
        await log("LICENSE_ACTIVATE_FAIL",
          `đổi server quá lượt (${changes}/${REBIND_LIMIT}) · lic#${lic[0].id} · ${hwid}`, ipOf(req));
        return NextResponse.json({
          ok: false, reason: "DOI_MAY_HET_LUOT",
          detail: `Da doi ${changes}/${REBIND_LIMIT} lan trong 30 ngay`,
        }, { status: 200 });
      } else {
        await q(
          `UPDATE licenses SET server_id=$1, server_changed_at=now(), server_changes=$2, fingerprint=$1 WHERE id=$3`,
          [hwid, changes + 1, lic[0].id],
        );
        await log("LICENSE_BIND", `lic#${lic[0].id} → ${hwid} (đổi máy ${changes + 1}/${REBIND_LIMIT})`, ipOf(req));
      }
    }

    const buyer = lic.length > 0 ? String(lic[0].buyer || "Khách VIP") : "Chủ Shop";
    /* v3.0.1 — WATERMARK THEO KEY: sinh deterministic theo id license,
       lưu vào DB (lần đầu) và ký vào vé. Plugin dùng làm dấu vết ẩn. */
    const licId = lic.length > 0 && !isMaster ? Number(lic[0].id) : 0;
    const wm = licId > 0 ? wmForLicense(licId) : 0;
    if (licId > 0 && Number(lic[0].wm ?? 0) !== wm) {
      await q(`UPDATE licenses SET wm=$1 WHERE id=$2`, [wm, licId]);
    }
    const issuedAt = Date.now();
    const session = signSession({
      l: licId,
      n: buyer.slice(0, 40),
      e: lifetime ? LIFETIME : String(expiry),
      f: hwid,
      s: issuedAt,
      d: SESSION_MINUTES,
      g: GRACE_HOURS,
      pb: premiumBlobB64(),
      w: wm || undefined,
      v: 3,
      /* v3.5.0 — chống replay + key id băm */
      i: issuedAt,
      c: nonce || undefined,
      kh: isMaster ? undefined : keyHash(key).slice(0, 16),
    });
    await log("LICENSE_ACTIVATE_OK", `lic#${licId} · ${hwid} · vé ${SESSION_MINUTES}p · wm=${wm}`, ipOf(req));
    return NextResponse.json({
      ok: true, session, rs: rsaSignSession(session), nonce, expires_at: expiry, lifetime,
      ticket_minutes: SESSION_MINUTES, grace_hours: GRACE_HOURS,
      wm,
    });
  } catch (e) {
    /* v3.15.5 — lỗi HẠ TẦNG (DB...) giữ 500: plugin coi như mất kết nối là đúng */
    return NextResponse.json(
      { ok: false, reason: "LOI_SERVER", detail: String(e).slice(0, 200) },
      { status: 500 },
    );
  }
}
