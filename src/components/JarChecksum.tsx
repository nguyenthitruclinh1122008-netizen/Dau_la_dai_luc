/* Dòng SHA-256 hiện dưới nút tải jar FREE — khách đối chiếu được file sau khi tải.
   Server component (async): băm file jar trong assets/jar; file thiếu → không render gì. */
import { freeJarSha256 } from "@/lib/jar-checksum";

export default async function JarChecksum() {
  const sha = await freeJarSha256();
  if (!sha) return null;
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
      Kiểm tra file sau tải — SHA-256 của <code>DauLaDaiLuc-Free-3.16.0.jar</code>:{" "}
      <code style={{ color: "var(--gold2)" }}>{sha}</code>
    </p>
  );
}
