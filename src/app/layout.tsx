import type { Metadata } from "next";
import "./globals.css";
import UserBadge from "@/components/UserBadge";

export const metadata: Metadata = {
  title: "Đấu La Đại Lục — Wiki Võ Hồn & Mua Key Premium",
  description:
    "Plugin Minecraft Đấu La Đại Lục 2.3.0 — Wiki 9 Võ Hồn, tải jar FREE, đăng ký nhận key bản thường, mua key Premium (VietQR / thẻ cào), kích hoạt offline.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
              <a href="/admin">Quản trị</a>
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
