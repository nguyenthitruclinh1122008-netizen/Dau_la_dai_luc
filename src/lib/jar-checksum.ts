/* SHA-256 của jar Free — tính đúng một lần mỗi instance rồi cache.
   Dùng cho dòng kiểm tra file dưới nút tải ở trang chủ; jar đổi khi deploy
   mới nên giá trị luôn khớp đúng bản đang phát trên /api/download/free. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const JAR = "DauLaDaiLuc-Free-3.16.0.jar";
let cached: string | null | undefined;

export async function freeJarSha256(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const buf = await readFile(path.join(process.cwd(), "assets", "jar", JAR));
    cached = createHash("sha256").update(new Uint8Array(buf)).digest("hex");
  } catch {
    cached = null;
  }
  return cached;
}
