/* =====================================================================
   lib/keys.ts — THUẬT TOÁN KEY BẢN QUYỀN 24 KÝ TỰ ĐẤU LA ĐẠI LỤC v2.1.1
   ---------------------------------------------------------------------
   Port 1:1 từ api/keys.js của bộ SOULLAND-SHOP (đã đối chiếu từng lệnh
   bytecode của class license I_1 trong jar Premium, xác minh bằng 2 key
   chủ thật). Key web cấp ra plugin chấp nhận NGAY, kiểm tra OFFLINE —
   không cần internet trên server game.

   Định dạng bán cho khách (plugin chấp nhận): "payload.chữ-ký"
     payload  = Base64url( JSON {"n":tên người mua, "e":ngày hết hạn,
                                "h":"ANY", "o":mã đơn} )
     chữ ký   = Base64url( HMAC-SHA256(secret, payload) — nguyên 32 byte )

   Ngày trong key = NGÀY HẾT HẠN:
     • mua gói 30/90/180/365 ngày → hạn = ngày duyệt đơn + số ngày
     • gói LIFETIME → hạn = 2275-12-31 → dùng được VĨNH VIỄN,
       plugin không bao giờ khóa key này.
   ===================================================================== */

import crypto from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/* Tái tạo secret 32 byte của plugin từ mảng hằng số XOR trong class Il_I */
const XOR_STR = "DauLaDaiLuc#2026$Premium";
const XOR_TABLE: number[][] = [
  [45, 27, 16, 99, 14, 37, 7, 8, 40, 71, 47, 76, 115, 96, 123],
  [15, 34, 5, 48, 19, 71, 81, 127, 125, 67, 36, 38, 31, 34, 84],
  [68, 81, 71, 59, 32, 10, 57, 28, 57, 31, 17, 45, 50, 0],
];

function computeSecret(): Buffer {
  const out = new Array(44).fill(0); // out[k + j*3] — cài chéo đúng bytecode i()
  for (let k = 0; k < XOR_TABLE.length; k++) {
    const row = XOR_TABLE[k];
    for (let j = 0; j < row.length; j++) {
      out[k + j * XOR_TABLE.length] =
        (row[j] ^ XOR_STR.charCodeAt((j + 7 * k) % XOR_STR.length)) & 0xff;
    }
  }
  return Buffer.from(Buffer.from(out).toString("latin1"), "base64");
}

export const SECRET = computeSecret(); // 32 byte — giống hệt plugin

export const LIFETIME_DATE = "2275-12-31"; // hạn "vĩnh viễn" ghi trong key

/* v3.5.0 — KEY LƯU DẠNG BĂM: DB chỉ giữ SHA-256(key), không giữ key thô
   cho key cấp MỚI. Tra cứu = hash(key người dùng gửi) → so key_hash.
   key_hash trả hex thường (không pepper — key đã đủ entropy 80+ bit). */
export function keyHash(key: string): string {
  return crypto.createHash("sha256").update(String(key || "").trim().toUpperCase(), "utf8").digest("hex");
}

/* Che key khi hiển thị trong admin/log: **** + 4 ký tự cuối */
export function maskKey(key: string): string {
  const k = String(key || "").trim();
  return k.length <= 4 ? "****" : "****" + k.slice(-4);
}

export const MASTER_KEYS = [
  "0BZG-R7R0-0000-0FTA-B53J-56ST", // vĩnh viễn (2275-12-31)
  "0850-R7R0-0007-FNAE-4PC3-911Q", // hạn 2030-12-31
];

export function todayStr(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* Hạn dùng = hôm nay + days (ngày mua vẫn được dùng trọn vẹn) */
export function expiryDateForDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return todayStr(d);
}

export function isExpired(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  return String(dateStr).slice(0, 10) < todayStr();
}

function b64u(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "");
}

/* ---- v2.3: KEY SHOP MỚI (không có dấu "." — plugin v2.3 không nhận key định dạng cũ)
   Key chỉ là "mã tra cứu" vào DB (hạn dùng nằm trong DB, server cấp vé ký Ed25519).
   Không nhúng HMAC/chuỗi bí mật nào vào key — yêu cầu 1/10 điểm. ---- */
export const SHOP_KEY_RE = /^DL-[A-HJKMNPQRSTVWXYZ2-9]{4}(-[A-HJKMNPQRSTVWXYZ2-9]{4}){3}$/;
const SHOP_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function genShopKey(): string {
  const grp = () =>
    Array.from(crypto.randomBytes(4))
      .map((b) => SHOP_ALPHABET[b % SHOP_ALPHABET.length])
      .join("");
  return "DL-" + grp() + "-" + grp() + "-" + grp() + "-" + grp();
}

/* Sinh key dạng "payload.chữ-ký" (y hệt hàm f(String) plugin chấp nhận) */
export function genDottedKey(opts: {
  name: string;
  expiry: string;
  order: string;
}): string {
  const payload = b64u(
    Buffer.from(
      JSON.stringify({
        n: String(opts.name || "Khách VIP").replace(/["\\]/g, "").slice(0, 40) || "Khách VIP",
        e: opts.expiry,
        h: "ANY",
        o: String(opts.order || "SL").slice(0, 12),
      }),
      "utf8",
    ),
  );
  const sig = b64u(
    crypto.createHmac("sha256", SECRET).update(Buffer.from(payload, "utf8")).digest(),
  );
  return payload + "." + sig;
}

/* ---- Giải mã key 24 ký tự (dạng XXXX-XXXX-...) hoặc payload.chữ-ký ---- */
export interface DecodedKey {
  ok: boolean;
  reason?: string;
  dotted?: boolean;
  name?: string;
  order?: string;
  expiry?: string;
  expired?: boolean;
  lifetime?: boolean;
  anyHWID?: boolean;
}

function hDecode(s: string): Buffer {
  const t = String(s).trim().replace(/-/g, "+").replace(/_/g, "/");
  const rem = t.length % 4;
  if (rem === 1) throw new Error("base64 sai");
  return Buffer.from(t + "=".repeat((4 - rem) % 4), "base64");
}

export function decodeDottedKey(key: string): DecodedKey {
  const dot = String(key).lastIndexOf(".");
  if (dot <= 0 || dot === String(key).length - 1) return { ok: false, reason: "KEY_SAI_DINH_DANG" };
  const payload = String(key).slice(0, dot);
  const mac = crypto.createHmac("sha256", SECRET).update(Buffer.from(payload, "utf8")).digest();
  let sig: Buffer;
  try {
    sig = hDecode(String(key).slice(dot + 1));
  } catch {
    return { ok: false, reason: "KEY_SAI_DINH_DANG" };
  }
  if (mac.length !== sig.length || !crypto.timingSafeEqual(mac, sig)) {
    return { ok: false, reason: "KEY_KHONG_HOP_LE" };
  }
  let json: { n?: string; e?: string; h?: string; o?: string };
  try {
    json = JSON.parse(hDecode(payload).toString("utf8"));
  } catch {
    return { ok: false, reason: "KEY_SAI_DINH_DANG" };
  }
  const { n, e, h, o } = json || ({} as { n?: string; e?: string; h?: string; o?: string });
  if (!n || !e || !h) return { ok: false, reason: "KEY_THIEU_THONG_TIN" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e))) return { ok: false, reason: "KEY_SAI_NGAY_HET_HAN" };
  return {
    ok: true,
    dotted: true,
    name: n,
    expiry: String(e),
    expired: isExpired(e),
    lifetime: String(e) === LIFETIME_DATE,
    anyHWID: String(h).toUpperCase() === "ANY",
    order: o || "",
  };
}

function decodeBase32(str: string): Buffer | null {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of String(str).toUpperCase()) {
    let idx = ALPHABET.indexOf(ch);
    if (idx < 0) {
      if (ch === "O") idx = 0;
      else if (ch === "I" || ch === "L") idx = 1;
      else return null;
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

const ungroup = (k: string) => String(k || "").replace(/[-\s]/g, "").toUpperCase();

function decodeKey24(key: string): DecodedKey {
  const raw = decodeBase32(ungroup(key));
  if (!raw || raw.length !== 15) return { ok: false, reason: "KEY_SAI_DINH_DANG" };
  if ((raw[0] & 0xff) !== 2) return { ok: false, reason: "KEY_SAI_PHIEN_BAN" };
  const expect = crypto.createHmac("sha256", SECRET).update(raw.subarray(0, 7)).digest().subarray(0, 8);
  const got = raw.subarray(7, 15);
  if (!crypto.timingSafeEqual(expect, got)) return { ok: false, reason: "KEY_KHONG_HOP_LE" };
  const y = (raw[1] & 0xff) + 2020;
  const m = raw[2] & 0xff;
  const d = raw[3] & 0xff;
  if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, reason: "KEY_SAI_NGAY_HET_HAN" };
  const expiry =
    y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  return {
    ok: true,
    expiry,
    expired: isExpired(expiry),
    lifetime: (raw[1] & 0xff) === 255,
    anyHWID: (raw[4] | raw[5] | raw[6]) === 0,
  };
}

export function isMasterKey(key: string): boolean {
  const norm = ungroup(key).replace(/(.{4})(?=.)/g, "$1-");
  return MASTER_KEYS.includes(norm);
}

/* Giải mã tổng hợp: tự nhận diện 24 ký tự hay payload.chữ-ký */
export function decodeAny(key: string): DecodedKey {
  const k = String(key || "").trim();
  if (k.includes(".")) return decodeDottedKey(k);
  return decodeKey24(k);
}
