/* Dòng SHA-256 hiện dưới nút tải jar FREE — khách đối chiếu được file sau khi tải.
   Server component (async): tên file + SHA lấy từ jar đang host (admin nạp trong DB,
   chưa có thì bản kèm repo) — luôn khớp đúng bản đang phát trên /api/download/free. */
import { getJarMeta } from "@/lib/jar-registry";

export default async function JarChecksum() {
  const meta = await getJarMeta("free");
  if (!meta) return null;
  return (
    <p
      style={{
        color: "var(--muted)",
        fontSize: "0.78rem",
        margin: "8px 0 0",
        maxWidth: 640,
        wordBreak: "break-all",
      }}
    >
      Kiểm tra file sau tải — SHA-256 của <code>{meta.filename}</code>:{" "}
      <code style={{ color: "var(--gold2)" }}>{meta.sha256}</code>
    </p>
  );
}
