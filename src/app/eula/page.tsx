import fs from "node:fs";
import path from "node:path";
import { getJarMeta } from "@/lib/jar-registry";

export const metadata = { title: "Điều khoản sử dụng (EULA) — Đấu La Đại Lục" };

/* FIX 18/11: thiếu force-dynamic → EULA phục vụ số bản prerendered cũ sau khi
   admin nạp jar mới. Force dynamic để luôn đọc version jar đang host. */
export const dynamic = "force-dynamic";

/* Nội dung EULA.md — nguồn sự thật là file EULA.md ở gốc repo.
   Số bản hiển thị lấy từ plugin.yml của jar đang host (không hardcode). */
export default async function EulaPage() {
  const v = (await getJarMeta("free"))?.version ?? "";
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
        Bản{v ? ` ${v}` : ""} · 1 key dùng cho 1 server · EULA này hiển thị đúng nội dung file EULA.md
        đóng gói trong plugin (mở jar cũng đọc được).
      </p>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.65, fontSize: "0.95rem" }}>
        {md}
      </pre>
    </div>
  );
}
