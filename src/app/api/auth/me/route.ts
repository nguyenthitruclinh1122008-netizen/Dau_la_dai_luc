/* GET /api/auth/me — ai đang đăng nhập? (kèm key thường của user) */
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = await currentUser(req);
    if (!u) return NextResponse.json({ user: null });
    return NextResponse.json({
      user: {
        id: u.id,
        username: u.username,
        contact: u.contact,
        created_at: u.created_at,
        last_login: u.last_login,
        role: u.role,
        vip: Number(u.vip) === 1,
      },
      gift_key: u.gift_key,
      gift_plan: u.gift_key ? "KEY BẢN THƯỜNG (FREE) — vĩnh viễn" : null,
    });
  } catch (e) {
    return NextResponse.json(
      { user: null, error: "Lỗi phiên đăng nhập", detail: String(e).slice(0, 200) },
      { status: 500 },
    );
  }
}
