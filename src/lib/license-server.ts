/* =====================================================================
   lib/license-server.ts — SERVER BẢN QUYỀN v3.7 (ký kép Ed25519 + RSA-2048)
   ---------------------------------------------------------------------
   • Khóa riêng Ed25519 (PKCS8 DER base64) từ env LICENSE_SIGNING_KEY
     (mặc định trùng khóa nhúng trong plugin v2.3.0 — đổi key phải build
     lại plugin!). Khóa riêng CHỈ nằm trên server — jar chỉ có khóa công
     khai, không thể tự cấp vé (yêu cầu 1–2/10 điểm).
   • v3.7: THÊM KHÓA RSA-2048 (env LICENSE_RSA_KEY) — server co-sign
     chữ ký thứ 2 (SHA256withRSA, PKCS1v15) trên cùng payload; plugin
     v3.7.0 chỉ nhận vé khi qua CẢ HAI chữ ký độc lập.
   • Vé = base64url(JSON payload) + "." + base64url(chữ ký Ed25519)
     payload: {
       l : id license (0 = KEY CHỦ),
       n : người mua,
       e : hạn dùng license (YYYY-MM-DD),
       f : ID server Minecraft đã bind,
       s : thời điểm phát (ms),
       d : tuổi thọ vé (PHÚT, 15–60 — vé ngắn hạn),
       g : grace offline (GIỜ, 24–72 — cache tối đa khi mất mạng),
       pb: blob tính năng premium (base64url JSON — võ hồn + công thức),
       w : watermark theo key (1–63 — dấu vết truy nguồn rò rỉ),
       v : 3
     }
   • Plugin thẩm định offline bằng khóa công khai nhúng trong jar;
     heartbeat 10–30 phút lấy vé mới; thu hồi → plugin xóa vé + về Free.
   ===================================================================== */
import crypto from "node:crypto";
import profileJson from "./premium-profile.json";

export const LICENSE_SIGNING_KEY_DEFAULT =
  "MC4CAQAwBQYDK2VwBCIEIKrYFZkG5DH7PyvhrapdTXtj85sq4oOSmnWW0ypdF0ym";

/* v3.7 — khóa RSA-2048 mặc định (đóng băng cùng plugin; env LICENSE_RSA_KEY đè) */
export const LICENSE_RSA_KEY_DEFAULT =
  "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDGizVCYhyjBKrd99xyNiEJqPo3e2wsuBdXL0nj4x50mIPDOwY2Jf+64DY//zCDNS1+Rs7bA4ZfMy6BibkziO5oETRzIfs29QjGpLYa1Q/0/Lf+91N9oX8jCgbP/NynxoGyNopPEgAhxwB2C8ATeVKsN3Dcvw8ics/mkqSsFp7GLbbbDNi4f1ODBvpudVON3An9XWhpkBFa+GM8owCnVswfF+nf9foTy07oI+FMQp+gF3kf+CwjA572PsVbnEJWSUCnDjU/+RYpri/iA+F2esSiMiTYtUAz1DyRP5v9gmTC/6KntNt7CDBFftHO/IWCO1psos/h2GAHIAEJ9e9qt0CJAgMBAAECggEAP2Jw4d0FrGuQiyWWrKWoPXfDThQqkEpDNVPFAKpg7jNEmX7N+FqAPm5XE25KVBEVkYNUhaol612hIrzPseqsxe98MadvFnf60cQC2SUdH4bQzOazsl9tAcgxLZRZ83wVqsnrtNuXzDDGbmlI7E6mvJFEiEy8rbA+vCsjxEbCcJzWipPwQb0XuzlrLFY/OANBuo6EqwoCjfBbx/J0KbqhDXUhiEqczv8FhgrP+45krUybdYuApJWgz1MW5J4MR1fvPA4exfnchYxywkV/qZsc/V/g5qt1RsQ0lk8B/LpTERKtV18W8i5rLNu+MUyk2Xt/xkRK5Krv6eFtsXGOIDt66wKBgQDn1vTVoHNVEAEzTQbRhsaDPFamrHlUnZrhsNrNf3cxsjtDk9+ZlHZvbU7XT8GLp0YWRyS+Y/qL4MBfS7xfTsfffrH9mkuuh0tihVZBqkwTIpNv9PFcbG8spklMllXjFtFEa/YWHG1tdvqR1vsUP9GMk4SGCblJJJHwLwxFhD+JkwKBgQDbO/r0WQtbqZ9LIB4IktiMEpq85hN0/AZl2/JvldZt3j27vChsW8bg0zAMHfCJIDHfhrT4zyoxCyGjP/epdLSuvODK47weQiJ86oqFX5ssXN3CcjnzuBtIehM2lhZq6NFj/Vm2h9DYHic4xIBySrLcItZRBusvUl9IMTz7Ohvu8wKBgCOb3osZU92S0bxhblSsUL1DfUOoZhJbCrjzgwfhNhuJ9pRQmB1ssiw3K87iTyX2EUvGrZwYmxj08lcwuMQiw4xOV2ROWKV73lZJiJAZagneW6rsgk3h0cmX2NZMmPCCRq4truSChUQ07BOOY44epz7iQY6c27qiRVAQyd+7ik7FAoGALE3GvTJxdSimJExtRVZHpKbt1la4f9+ee18jcyFYoANVfmbb1GoHms+S2iACx/NVoNJcKBvVbuvM9Gys4/XNvbI1y0qSbZr31T6gl6tmdGSf+/eRdosyGEdzMojKJvi9t/Mu+hAgSExvqK0tN+uYkZwIq382b+25i6FHrY1kr7kCgYEAs16blZYsDNOjpIu8DVUtyTEAEdctWUaS+RsAHolV4TH+KFheOXk1CSWjWRMyTgic0RfI7dwqIBBWDn7qQOzfPwcVuVNKscIdtoJjR/ILpOAJnbNHZOi3Prt79qBH96oIK3Mszy262V5PdDPYjNrEvBou7oeZVF3C16mNI5dJR/s=";

/* tuổi thọ vé (phút) — yêu cầu: 15–60 phút */
export const SESSION_MINUTES = clampNum(process.env.LICENSE_TICKET_MINUTES, 30, 15, 60);
/* grace offline (giờ) — yêu cầu: cache tối đa 24–72 giờ */
export const GRACE_HOURS = clampNum(process.env.LICENSE_GRACE_HOURS, 72, 24, 72); /* v3.5: mặc định 72h */
/* giới hạn đổi server/tháng (plugin KHÔNG dùng MAC/CPU/HWID ANY) */
export const REBIND_LIMIT = clampNum(process.env.LICENSE_REBIND_LIMIT, 2, 1, 2);
/* KEY CHỦ (vé vĩnh viễn, không tra DB) — có thể đổi bằng env */
export const MASTER_KEYS: string[] = (process.env.LICENSE_MASTER_KEYS
  ? process.env.LICENSE_MASTER_KEYS.split(",")
  : ["0BZG-R7R0-0000-0FTA-B53J-56ST", "0850-R7R0-0007-FNAE-4PC3-911Q"]
).map((k) => k.trim().toUpperCase());

function clampNum(raw: string | undefined, def: number, min: number, max: number): number {
  const n = Number(String(raw ?? "").trim() || def);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

let cachedPriv: crypto.KeyObject | null = null;
let cachedPub: crypto.KeyObject | null = null;

export function signingPrivateKey(): crypto.KeyObject {
  if (!cachedPriv) {
    const b64 = process.env.LICENSE_SIGNING_KEY || LICENSE_SIGNING_KEY_DEFAULT;
    cachedPriv = crypto.createPrivateKey({
      key: Buffer.from(String(b64).trim(), "base64"),
      format: "der",
      type: "pkcs8",
    });
  }
  return cachedPriv;
}

export function signingPublicKey(): crypto.KeyObject {
  if (!cachedPub) {
    cachedPub = crypto.createPublicKey(signingPrivateKey());
  }
  return cachedPub;
}

const b64u = (buf: Buffer) => buf.toString("base64").replace(/=+$/, "");

export interface SessionPayload {
  l: number;
  n: string;
  e: string;
  f: string;
  s: number;
  d: number;
  g: number;
  pb: string;
  w?: number;
  v: number;
  /* v3.5.0 — chống replay + định danh key băm */
  i?: number;   /* iat — thời điểm cấp vé (ms) */
  c?: string;   /* nonce client gửi lúc activate — vé phải chứa đúng giá trị này */
  kh?: string;  /* key id = SHA-256(key) 16 ký tự hex đầu — không lộ key */
}

/** Blob tính năng premium (JSON của premium-profile.json) → base64url */
export function premiumBlobB64(): string {
  return b64u(Buffer.from(JSON.stringify(profileJson), "utf8"));
}

/* v3.0.1 — WATERMARK THEO KEY: deterministic theo id license.
   Cùng license luôn ra cùng watermark (1–63); khác license → gần như
   luôn khác. Dấu vết này theo vé vào plugin: NBT item rơi, chiều hiệu
   ứng, heartbeat đối chiếu. Nếu bản crack leak công khai → tra ngược
   được key gốc. */
const WM_SECRET = process.env.LICENSE_WM_SECRET || "daula-wm-v3.0.1-soulland";

export function wmForLicense(licenseId: number): number {
  const h = crypto.createHmac("sha256", WM_SECRET).update("wm:" + licenseId).digest();
  return 1 + (h[0] % 63);
}

/* v3.0.1 — hằng số build hash (env DAULA_BUILD_HASHES = "T:<sha>,M:<sha>")
   do build plugin in ra. Dùng heartbeat đối chiếu telemetry của plugin:
   lệch → jar đang chạy đã bị sửa → âm thầm đánh dấu license nghi vấn. */
export function buildHashes(): { t?: string; m?: string } {
  const raw = process.env.DAULA_BUILD_HASHES || "";
  const out: { t?: string; m?: string } = {};
  for (const part of raw.split(",")) {
    const [k, v] = part.split(":").map((x) => (x || "").trim().toLowerCase());
    if (k === "t" && v) out.t = v;
    if (k === "m" && v) out.m = v;
  }
  return out;
}

/* v3.2.0 — hash BUILD các CLASS LICENSE (env DAULA_LICENSE_HASHES =
   "I1:<sha>,K:<sha>,N:<sha>,P:<sha>,S:<sha>" — build script in ra).
   Heartbeat trả về plugin qua field "bc" → plugin tự re-hash bytecode
   runtime của 5 class license và so — lệch nghĩa jar bị vá ngầm. */
export function licenseClassHashes(): string {
  return String(process.env.DAULA_LICENSE_HASHES || "").trim();
}

/** Ký 1 vé → token payload.sig */
export function signSession(p: SessionPayload): string {
  const payload = b64u(Buffer.from(JSON.stringify(p), "utf8"));
  const sig = b64u(crypto.sign(null, Buffer.from(payload, "ascii"), signingPrivateKey()));
  return payload + "." + sig;
}

let cachedRsa: crypto.KeyObject | null = null;

function rsaPrivateKey(): crypto.KeyObject {
  if (!cachedRsa) {
    const b64 = process.env.LICENSE_RSA_KEY || LICENSE_RSA_KEY_DEFAULT;
    cachedRsa = crypto.createPrivateKey({
      key: Buffer.from(String(b64).trim(), "base64"),
      format: "der",
      type: "pkcs8",
    });
  }
  return cachedRsa;
}

/** v3.7 — co-sign RSA-2048 (SHA256, PKCS1v15) trên đúng phần payload của vé */
export function rsaSignSession(token: string): string {
  const payload = token.slice(0, token.lastIndexOf("."));
  return crypto
    .sign("sha256", Buffer.from(payload, "ascii"),
      { key: rsaPrivateKey(), padding: crypto.constants.RSA_PKCS1_PADDING })
    .toString("base64");
}

/** Thẩm định vé (heartbeat gửi vé cũ về để cấp vé mới) */
export function verifySession(token: string): SessionPayload | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot <= 0 || dot === token.length - 1) return null;
    const payload = token.slice(0, dot);
    const sig = Buffer.from(token.slice(dot + 1).replace(/-/g, "+").replace(/_/g, "/") + "===", "base64");
    const ok = crypto.verify(null, Buffer.from(payload, "ascii"), signingPublicKey(), sig);
    if (!ok) return null;
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/") + "===", "base64").toString("utf8"),
    );
    if (!json || typeof json.l !== "number" || json.v !== 3) return null;
    return json as SessionPayload;
  } catch {
    return null;
  }
}

/** Vé đã quá tuổi thọ ngắn hạn (15–60 phút) → plugin phải kích hoạt lấy vé mới */
export function isTicketStale(s: SessionPayload): boolean {
  const dMin = Math.min(60, Math.max(15, Number(s.d) || 30));
  return Date.now() > s.s + dMin * 60_000;
}

export function todayStr(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

export function isExpired(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  return String(dateStr).slice(0, 10) < todayStr();
}
