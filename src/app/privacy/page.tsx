import fs from "node:fs";
import path from "node:path";

export const metadata = { title: "Chính sách quyền riêng tư — Đấu La Đại Lục" };

export default function PrivacyPage() {
  let md = "";
  try {
    md = fs.readFileSync(path.join(process.cwd(), "PRIVACY.md"), "utf8");
  } catch {
    md = "# PRIVACY\n\nKhông tải được nội dung — xem file PRIVACY.md trong repo.";
  }
  return (
    <div className="wiki" style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ color: "#f5c542" }}>Chính sách quyền riêng tư</h1>
      <p style={{ opacity: 0.75, fontSize: "0.9rem" }}>
        Plugin chỉ gửi: key, HWID đã băm SHA-256, phiên bản plugin, phiên bản Minecraft.
        KHÔNG gửi IP hay dữ liệu người chơi.
      </p>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.65, fontSize: "0.95rem" }}>
        {md}
      </pre>
    </div>
  );
}
