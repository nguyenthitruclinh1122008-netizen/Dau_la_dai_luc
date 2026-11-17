/* POST /api/auth/register — tạo tài khoản NGƯỜI CHƠI + tặng ngay KEY BẢN THƯỜNG */
import { NextResponse } from "next/server";
import { q, log } from "@/lib/db";
import {
  genFreeKey,
  hashPassword,
  newSalt,
  validateUsername,
  validatePassword,
  makeUserToken,
  attachSession,
  isHttps,
} from "@/lib/users";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const contact = String(body.contact || "").trim().slice(0, 120) || null;

    const badUser = validateUsername(username);
    if (badUser) return NextResponse.json({ ok: false, error: badUser }, { status: 400 });
    const badPass = validatePassword(password);
    if (badPass) return NextResponse.json({ ok: false, error: badPass }, { status: 400 });

    const exists = await q(`SELECT 1 FROM users WHERE lower(username)=lower($1)`, [username]);
    if (exists.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Tên đăng nhập này đã có người dùng — chọn tên khác nhé!" },
        { status: 409 },
      );
    }

    const giftKey = await genFreeKey();
    const salt = newSalt();
    const hash = hashPassword(password, salt);

    let userId: number;
    try {
      const ins = await q(
        `INSERT INTO users (username, pass_hash, salt, contact, gift_key, role)
         VALUES ($1,$2,$3,$4,$5,'member') RETURNING id`,
        [username, hash, salt, contact, giftKey],
      );
      userId = Number(ins[0].id);
      await q(
        `INSERT INTO licenses (key, order_code, package_code, expires_at, status, buyer)
         VALUES ($1,$2,'freegift','2275-12-31','active',$3)`,
        [giftKey, "GIFT-" + username, username],
      );
    } catch (e) {
      await q(`DELETE FROM users WHERE lower(username)=lower($1) AND gift_key=$2`, [username, giftKey]).catch(() => {});
      throw e;
    }

    await log("USER_REGISTER", `${username} · quà key thường ${giftKey}`, ipOf(req));

    const res = NextResponse.json(
      {
        ok: true,
        user: { id: userId, username, contact },
        gift_key: giftKey,
        gift_plan: "KEY BẢN THƯỜNG (FREE) — vĩnh viễn",
        message:
          "Tạo tài khoản thành công! Đây là KEY BẢN THƯỜNG của ngươi — lưu lại ngay, dùng cho bản FREE / xác minh thành viên.",
      },
      { status: 201 },
    );
    attachSession(res.headers, makeUserToken(userId), isHttps(req));
    return res;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Lỗi tạo tài khoản", detail: String(e).slice(0, 200) },
      { status: 500 },
    );
  }
}
