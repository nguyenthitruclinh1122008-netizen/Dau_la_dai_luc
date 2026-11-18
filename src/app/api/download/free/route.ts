/* GET /api/download/free — tải jar FREE (công khai cho mọi người).
   Byte + TÊN FILE lấy từ jar đang host (bản admin nạp trong DB, chưa có thì
   bản kèm repo); version đọc từ plugin.yml bên trong jar → sau khi nạp jar
   mới, khách tải về đúng file "DauLaDaiLuc-Free-<version>.jar" tự động. */
import { NextResponse } from "next/server";
import { getJarBytes } from "@/lib/jar-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const j = await getJarBytes("free");
  if (!j) {
    return NextResponse.json({ error: "File chưa được nạp" }, { status: 404 });
  }
  return new Response(new Uint8Array(j.buf), {
    headers: {
      "Content-Type": "application/java-archive",
      "Content-Disposition": `attachment; filename="${j.meta.filename}"`,
      "X-Jar-Version": j.meta.version,
      "Cache-Control": "no-store",
    },
  });
}
