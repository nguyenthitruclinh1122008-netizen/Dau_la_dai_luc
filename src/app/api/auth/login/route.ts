/* POST /api/auth/login — đăng nhập tài khoản người chơi */
import { NextResponse } from "next/server";
import { q, log } from "@/lib/db";
import { checkPassword, makeUserToken, attachSession, isHttps } from "@/lib/users";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) {
      return NextResponse.json({ ok: false, error: "Nhập đủ tên đăng nhập và mật khẩu!" }, { status: 400 });
    }

    const rows = await q(
      `SELECT id, username, pass_hash, salt, gift_key FROM users WHERE lower(username)=lower($1)`,
      [username],
    );
    if (rows.length === 0 || !checkPassword(password, rows[0].salt, rows[0].pass_hash)) {
      await log("USER_LOGIN_FAIL", String(username).slice(0, 40), ipOf(req));
      return NextResponse.json(
        { ok: false, error: "Sai tên đăng nhập hoặc mật khẩu!" },
        { status: 401 },
      );
    }

    const u = rows[0];
    await q(`UPDATE users SET last_login=now() WHERE id=$1`, [u.id]);
    await log("USER_LOGIN_OK", String(u.username).slice(0, 40), ipOf(req));

    const res = NextResponse.json({
      ok: true,
      user: { id: u.id, username: u.username, gift_key: u.gift_key },
    });
    attachSession(res.headers, makeUserToken(Number(u.id)), isHttps(req));
    return res;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Lỗi đăng nhập", detail: String(e).slice(0, 200) },
      { status: 500 },
    );
  }
}
