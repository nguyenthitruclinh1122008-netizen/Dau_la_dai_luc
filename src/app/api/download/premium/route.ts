/* GET /api/download/premium — 2 ĐƯỜNG VÀO, cùng 1 jar đang host:
   1) ?order=SLxxxxxx — khách có ĐƠN ĐÃ DUYỆT + license còn hiệu lực.
   2) KHÔNG order — phiên đăng nhập có users.vip=1 (hoặc admin): tài khoản
      VIP được nâng trong /admin tải trực tiếp qua phiên của họ.
   Còn lại (URL dò trực tiếp, tài khoản thường) → 403.
   Byte + TÊN FILE lấy từ jar đang host — version đọc từ plugin.yml bên trong jar. */
import { NextResponse } from "next/server";
import { q, log } from "@/lib/db";
import { isExpired } from "@/lib/keys";
import { getJarBytes } from "@/lib/jar-registry";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

async function servePremium(label: string, action: string, ip: string): Promise<Response> {
  const j = await getJarBytes("premium");
  if (!j) {
    return NextResponse.json({ error: "File chưa được nạp" }, { status: 404 });
  }
  await log(action, label + " → " + j.meta.filename, ip);
  return new Response(new Uint8Array(j.buf), {
    headers: {
      "Content-Type": "application/java-archive",
      "Content-Disposition": `attachment; filename="${j.meta.filename}"`,
      "X-Jar-Version": j.meta.version,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = String(url.searchParams.get("order") || "").trim().toUpperCase();

    /* Đường VIP: không có mã đơn → kiểm tra phiên đăng nhập */
    if (!code) {
      const u = await currentUser(req).catch(() => null);
      if (u && (Number(u.vip) === 1 || u.role === "admin")) {
        return await servePremium("VIP " + u.username, "DOWNLOAD_PREMIUM_VIP", ipOf(req));
      }
      await log("DOWNLOAD_PREMIUM_DENY", "Thiếu mã đơn + không phải phiên VIP", ipOf(req));
      return NextResponse.json(
        { error: "Cần mã đơn hàng (SLxxxxxx) của bạn hoặc tài khoản VIP" },
        { status: 403 },
      );
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
    return await servePremium(code, "DOWNLOAD_PREMIUM_OK", ipOf(req));
  } catch (e) {
    return NextResponse.json({ error: "Lỗi tải file", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
