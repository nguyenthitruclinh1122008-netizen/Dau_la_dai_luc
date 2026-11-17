/* GET /api/download/premium?order=SLxxxxxx
   Chỉ khách có ĐƠN ĐÃ DUYỆT + license còn hiệu lực mới tải được jar Premium.
   URL dò trực tiếp không có order hợp lệ → 403. */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { q, log } from "@/lib/db";
import { isExpired } from "@/lib/keys";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = String(url.searchParams.get("order") || "").trim().toUpperCase();
    if (!code) {
      await log("DOWNLOAD_PREMIUM_DENY", "Thiếu mã đơn", ipOf(req));
      return NextResponse.json({ error: "Cần mã đơn hàng (SLxxxxxx) của bạn" }, { status: 403 });
    }
    const rows = await q(
      `SELECT o.status AS order_status, o.buyer_name, p.name AS pkg_name,
              l.key, l.status AS license_status, l.expires_at
         FROM orders o
         JOIN packages p ON p.code = o.package_code
         LEFT JOIN licenses l ON l.order_code = o.code
        WHERE o.code = $1`,
      [code],
    );
    if (rows.length === 0) {
      await log("DOWNLOAD_PREMIUM_DENY", "Mã đơn không tồn tại: " + code, ipOf(req));
      return NextResponse.json({ error: "Mã đơn không tồn tại" }, { status: 403 });
    }
    const r = rows[0];
    const ok = r.order_status === "approved" && r.license_status === "active" && !isExpired(r.expires_at);
    if (!ok) {
      await log("DOWNLOAD_PREMIUM_DENY", code + " trạng thái=" + r.order_status + "/" + r.license_status, ipOf(req));
      return NextResponse.json(
        { error: "Đơn này chưa được duyệt hoặc key đã hết hạn / bị khóa. Kiểm tra lại trong trang Mua Key nhé!" },
        { status: 403 },
      );
    }
    const buf = await readFile(path.join(process.cwd(), "assets", "jar", "DauLaDaiLuc-Premium.jar"));
    await log("DOWNLOAD_PREMIUM_OK", code, ipOf(req));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/java-archive",
        "Content-Disposition": 'attachment; filename="DauLaDaiLuc-Premium.jar"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Lỗi tải file", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
