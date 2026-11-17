#!/usr/bin/env node
'use strict';
/* =====================================================================
   tao-key-chu-shop.mjs — CẤP KEY PREMIUM LIFETIME CHO CHỦ SHOP (v3.0.1)
   ---------------------------------------------------------------------
   Chạy TRÊN MÁY CHẠY WEBSITE (hoặc máy nào truy được website):
     node scripts/tao-key-chu-shop.mjs
   Biến môi trường (tất cả tùy chọn):
     SHOP_URL      — địa chỉ web bán key (mặc định http://localhost:3000)
     ADMIN_SECRET  — mật khẩu /admin (mặc định trùng bộ deploy)
     KEY_CO_DINH   — ép key đúng chuỗi đã phát cho chủ shop
                     (mặc định: DL-7KR7-VZAE-KPVW-TQZZ)
                     Web chỉ nhận key đúng định dạng
                     DL-XXXX-XXXX-XXXX-XXXX (bảng 32 ký tự không I/L/O/U).
   Kết quả: in key + hạn + watermark. Chạy 1 lần là đủ (key trùng → bỏ qua).
   ===================================================================== */
import crypto from "node:crypto";

const BASE = process.env.SHOP_URL || "http://localhost:3000";
const ADMIN_SECRET = process.env.ADMIN_SECRET || ""; /* mật khẩu /admin — đặt qua biến môi trường, không nhúng vào repo */
const KEY_CO_DINH = (process.env.KEY_CO_DINH || "DL-7KR7-VZAE-KPVW-TQZZ").toUpperCase();

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const KEY_RE = /^DL-[A-HJKMNPQRSTVWXYZ2-9]{4}(-[A-HJKMNPQRSTVWXYZ2-9]{4}){3}$/;

function genShopKey() {
  const grp = () =>
    Array.from(crypto.randomBytes(4)).map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return "DL-" + [grp(), grp(), grp(), grp()].join("-");
}

async function api(path, opts = {}, cookie = null) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(BASE + path, { ...opts, headers });
  const setCookie = res.headers.get("set-cookie");
  let body = null;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { status: res.status, body, setCookie };
}

(async () => {
  console.log("Website:", BASE);
  const pkgs = await api("/api/packages");
  if (pkgs.status !== 200) throw new Error("Web không truy được: " + pkgs.status);
  const life = (pkgs.body.packages || []).find((p) => p.code === "lifetime") ||
               (pkgs.body.packages || []).find((p) => p.days > 0);
  if (!life) throw new Error("Không tìm thấy gói premium nào");

  const login = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: ADMIN_SECRET }) });
  if (login.status !== 200) throw new Error("Admin login thất bại — kiểm tra ADMIN_SECRET");
  const cookie = (login.setCookie || "").split(";")[0];

  /* key cố định đã cấp chủ shop (chạy lại → trùng thì chỉ in ra) */
  let key = KEY_RE.test(KEY_CO_DINH) ? KEY_CO_DINH : genShopKey();

  const have = await api("/api/admin/licenses", {}, cookie);
  const existed = (have.body.licenses || []).find((l) => l.key === key);
  if (existed) {
    console.log("Key đã tồn tại trong DB → không tạo lại:");
    console.log("  KEY:", key);
    console.log("  Hạn:", String(existed.expires_at).slice(0, 10), "| wm:", existed.wm, "| nghi vấn:", existed.suspicious);
    return;
  }

  const order = await api("/api/orders", { method: "POST", body: JSON.stringify({
    package_code: life.code, buyer_name: "CHU SHOP SOULLAND",
    buyer_contact: "owner@soulland", type: "transfer", note: "Key chu shop v3.0.1",
  }) });
  if (order.status !== 201) throw new Error("Tạo đơn thất bại: " + JSON.stringify(order.body).slice(0, 200));
  const code = order.body.order ? order.body.order.code : order.body.code;

  /* duyệt đơn + yêu cầu key cố định (web nhận từ v3.0.1, có kiểm định dạng) */
  const conf = await api("/api/admin/orders/" + code + "/confirm",
    { method: "POST", body: JSON.stringify({ fixed_key: key }) }, cookie);
  if (conf.status !== 200) throw new Error("Duyệt đơn thất bại: " + JSON.stringify(conf.body).slice(0, 200));
  const realKey = conf.body.license_key || conf.body.key;
  console.log("=== KEY PREMIUM LIFETIME CỦA CHỦ SHOP ===");
  console.log(realKey);
  if (realKey !== key) console.log("(web không nhận key cố định — đã cấp key mới, ghi lại nơi an toàn)");
  console.log("(hạn vĩnh viễn 2275-12-31)");
})().catch((e) => { console.error("LỖI:", e.message); process.exit(1); });
