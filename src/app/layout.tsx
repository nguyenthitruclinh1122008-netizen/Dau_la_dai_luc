import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import UserBadge from "@/components/UserBadge";
import { USER_COOKIE, currentUserFromCookie } from "@/lib/users";

export const metadata: Metadata = {
  title: "Đấu La Đại Lục — Wiki Võ Hồn & Mua Key Premium",
  description:
    "Plugin Minecraft Đấu La Đại Lục 3.15.9 — Wiki 9 Võ Hồn, tải jar FREE, đăng ký nhận key bản thường, mua key Premium (VietQR / thẻ cào), kích hoạt offline.",
};

/* Link "Quản trị" CHỈ render khi phiên đăng nhập là đúng TRUC_LINH (so username, không so role
   admin chung chung) — mọi tài khoản khác không thấy link ở bất kỳ đâu trên giao diện.
   Cookie sai / hết hạn / DB lỗi → ẩn (fail-closed). Chặn thật ở server: /admin redirect +
   /api/admin/login yêu cầu phiên TRUC_LINH trước khi hỏi mật khẩu admin. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let isAdminRoot = false;
  try {
    const jar = await cookies();
    const u = await currentUserFromCookie(jar.get(USER_COOKIE)?.value);
    isAdminRoot = u?.username === "TRUC_LINH";
  } catch {
    isAdminRoot = false;
  }
  return (
    <html lang="vi">
      <body>
        <header className="site-header">
          <div className="inner">
            <span className="brand">⚔ ĐẤU LA ĐẠI LỤC</span>
            <nav>
              <a href="/">Wiki &amp; Tải</a>
              <a href="/user">Mua Key</a>
              <a href="/dang-ky">Đăng Ký</a>
              {isAdminRoot ? <a href="/admin">Quản trị</a> : null}
              <UserBadge />
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="inner">
            ⚔ Đấu La Đại Lục v3.15.9 · <a href="/eula">EULA</a> · <a href="/privacy">Quyền riêng tư</a> · Hỗ trợ mua key:{" "}
            <a href="https://discord.gg/uNDvZ38TC" target="_blank" rel="noreferrer">
              discord.gg/uNDvZ38TC
            </a>
            <br />
            Bản FREE miễn phí cho mọi server · Bản PREMIUM cần key — kiểm tra hạn OFFLINE, không cần internet.
          </div>
        </footer>
      </body>
    </html>
  );
}
