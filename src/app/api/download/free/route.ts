/* GET /api/download/free — tải jar FREE (công khai cho mọi người) */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const buf = await readFile(path.join(process.cwd(), "assets", "jar", "DauLaDaiLuc-Free-3.15.9.jar"));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/java-archive",
        "Content-Disposition": 'attachment; filename="DauLaDaiLuc-Free-3.15.9.jar"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File chưa được nạp" }, { status: 404 });
  }
}
