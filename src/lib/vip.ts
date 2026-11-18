/* =====================================================================
   lib/vip.ts — TRẠNG THÁI VIP CỦA TÀI KHOẢN WEB
   ---------------------------------------------------------------------
   • users.vip = 1 → tài khoản VIP: thấy nút "Tải Plugin PREMIUM" trên
     trang tài khoản và tải được jar Premium qua phiên đăng nhập (không
     cần đơn hàng). users.vip = 0 → thành viên thường (chỉ jar FREE).
   • NÂNG VIP tự tạo 1 key Premium VĨNH VIỄN riêng (DB chỉ lưu băm, key
     thô hiện đúng 1 lần) — khách dùng kích hoạt plugin trong game.
     Key ghi order_code = "VIP-GRANT-<id>" để GỠ VIP thu hồi đúng key
     này, KHÔNG đụng tới key khách mua bằng đơn hàng.
   • DUYỆT ĐƠN tự gắn VIP: khớp buyer_contact trên đơn với username hoặc
     contact của tài khoản (không phân biệt hoa-thường). Không khớp ai →
     đơn vẫn duyệt bình thường, admin gắn VIP tay trong tab Tài khoản.
   ===================================================================== */

import { q, log } from "./db";
import { genShopKey, keyHash, LIFETIME_DATE } from "./keys";
import { ensureKeyHashColumn } from "./license-lookup";

export function vipOrderCode(userId: number): string {
  return "VIP-GRANT-" + Number(userId);
}

export interface VipCandidate {
  id: number;
  username: string;
  vip: number;
  role: string;
}

/** Tìm tài khoản web khớp thông tin liên hệ ghi trên đơn mua key */
export async function findUserByOrderContact(contact: string): Promise<VipCandidate | null> {
  const c = String(contact || "").trim();
  if (!c) return null;
  try {
    const rows = await q(
      `SELECT id, username, vip, role FROM users
        WHERE lower(username) = lower($1) OR lower(coalesce(contact, '')) = lower($1)
        ORDER BY id LIMIT 1`,
      [c],
    );
    return (rows[0] as VipCandidate) || null;
  } catch {
    return null;
  }
}

export interface VipGrantResult {
  vip: true;
  user: string;
  licenseKey: string | null; // key thô — chỉ trả về lúc vừa cấp, sau này chỉ còn băm
  expires_at: string;
  vipAlready: boolean;
}

/** NÂNG VIP: bật cờ users.vip + sinh 1 key Premium vĩnh viễn cho tài khoản */
export async function grantVip(
  userId: number,
  ip: string,
): Promise<VipGrantResult> {
  const u = (await q(`SELECT id, username, vip FROM users WHERE id=$1`, [userId]))[0];
  if (!u) throw new Error("KHONG_TIM_THAY_USER");
  if (Number(u.vip) === 1) {
    return {
      vip: true,
      user: String(u.username),
      licenseKey: null,
      expires_at: LIFETIME_DATE,
      vipAlready: true,
    };
  }
  await q(`UPDATE users SET vip=1, vip_since=now() WHERE id=$1`, [userId]);
  await ensureKeyHashColumn();
  let key = genShopKey();
  for (let tries = 0; tries < 5; tries++) {
    const dup = await q(`SELECT 1 FROM licenses WHERE key=$1 OR key_hash=$2`, [key, keyHash(key)]);
    if (dup.length === 0) break;
    key = genShopKey();
  }
  await q(
    `INSERT INTO licenses (key, key_hash, key_last4, order_code, package_code, expires_at, buyer, status)
     VALUES ($1,$2,$3,$4,'direct-premium',$5,$6,'active')`,
    ["HASH:" + keyHash(key).slice(0, 16), keyHash(key), key.slice(-4), vipOrderCode(userId), LIFETIME_DATE, String(u.username)],
  );
  await log("VIP_GRANT", `user #${userId} ${u.username} → VIP · key ${key.slice(0, 8)}… vĩnh viễn`, ip);
  return {
    vip: true,
    user: String(u.username),
    licenseKey: key,
    expires_at: LIFETIME_DATE,
    vipAlready: false,
  };
}

/** GỠ VIP: tắt cờ + thu hồi đúng key VIP đã cấp (key khách MUA giữ nguyên) */
export async function revokeVip(
  userId: number,
  ip: string,
): Promise<{ vip: false; user: string; revokedKeys: number }> {
  const u = (await q(`SELECT id, username, vip FROM users WHERE id=$1`, [userId]))[0];
  if (!u) throw new Error("KHONG_TIM_THAY_USER");
  const rv = await q(
    `UPDATE licenses SET status='revoked', revoked_at=now()
      WHERE order_code=$1 AND status='active' RETURNING id`,
    [vipOrderCode(userId)],
  );
  await q(`UPDATE users SET vip=0 WHERE id=$1`, [userId]);
  await log("VIP_REVOKE", `user #${userId} ${u.username} → gỡ VIP · thu hồi ${rv.length} key VIP`, ip);
  return { vip: false, user: String(u.username), revokedKeys: rv.length };
}
