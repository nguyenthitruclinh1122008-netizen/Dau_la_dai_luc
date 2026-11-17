import fs from "node:fs";
import path from "node:path";

export const metadata = { title: "Điều khoản sử dụng (EULA) — Đấu La Đại Lục" };

/* Nội dung EULA.md — nguồn sự thật là file EULA.md ở gốc repo */
export default function EulaPage() {
  let md = "";
  try {
    md = fs.readFileSync(path.join(process.cwd(), "EULA.md"), "utf8");
  } catch {
    md = "# EULA\n\nKhông tải được nội dung — xem file EULA.md trong repo.";
  }
  return (
    <div className="wiki" style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ color: "#f5c542" }}>Điều khoản sử dụng (EULA)</h1>
      <p style={{ opacity: 0.75, fontSize: "0.9rem" }}>
        Bản 3.15.9 · 1 key dùng cho 1 server · EULA này hiển thị đúng nội dung file EULA.md
        đóng gói trong plugin (mở jar cũng đọc được).
      </p>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.65, fontSize: "0.95rem" }}>
        {md}
      </pre>
    </div>
  );
}
