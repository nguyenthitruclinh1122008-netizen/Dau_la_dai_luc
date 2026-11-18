/* =====================================================================
   /api/admin/jar — NẠP FILE JAR PLUGIN MỚI (chỉ TRUC_LINH + ADMIN_SECRET)
   ---------------------------------------------------------------------
   • GET  — metadata jar đang host (Free + Premium): version, tên file,
     SHA-256, kích thước, ai nạp lúc nào. Trang /admin đọc để hiển thị.
   • POST — nhận file .jar (multipart/form-data: trường file + kind),
     TỰ ĐỌC version từ plugin.yml bên trong file → đặt tên tải về
     "DauLaDaiLuc-<Free|Premium>-<version>.jar" rồi lưu DB. Trang chủ,
     nút tải, footer, EULA, route tải về tự khớp theo — không hardcode.
   • Hai lớp chốt như /admin: (1) phiên đăng nhập ĐÚNG TRUC_LINH,
     (2) cookie dl_admin sau khi nhập ADMIN_SECRET.
   ===================================================================== */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { currentUser } from "@/lib/users";
import { log } from "@/lib/db";
import { getJarMeta, saveJar, type JarKind } from "@/lib/jar-registry";
import { isZip } from "@/lib/plugin-yml";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

/* Vercel giới hạn body request ~4,5MB — chặn sớm cho gọn */
const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(req: Request) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Chưa đăng nhập quản trị" }, { status: 401 });
  }
  const jars = {
    free: await getJarMeta("free"),
    premium: await getJarMeta("premium"),
  };
  return NextResponse.json({ jars });
}

export async function POST(req: Request) {
  /* Lớp 1 — phiên TRUC_LINH bắt buộc (so username, không so role chung) */
  const u = await currentUser(req).catch(() => null);
  if (!u || u.username !== "TRUC_LINH") {
    await log("JAR_UPLOAD_DENY", "Không phải phiên TRUC_LINH", ipOf(req));
    return NextResponse.json(
      { error: "Phải đăng nhập tài khoản TRUC_LINH trước khi nạp jar" },
      { status: 403 },
    );
  }
  /* Lớp 2 — cookie dl_admin (đã nhập ADMIN_SECRET trong /admin) */
  if (!requireAdmin(req)) {
    await log("JAR_UPLOAD_DENY", "Thiếu cookie dl_admin", ipOf(req));
    return NextResponse.json({ error: "Chưa đăng nhập quản trị (ADMIN_SECRET)" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Body phải là multipart/form-data" }, { status: 400 });
  }
  const kind = String(form.get("kind") || "").trim() as JarKind;
  if (kind !== "free" && kind !== "premium") {
    return NextResponse.json({ error: "kind phải là 'free' hoặc 'premium'" }, { status: 400 });
  }
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) {
    return NextResponse.json({ error: "Thiếu file jar (trường 'file')" }, { status: 400 });
  }
  if (f.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File quá lớn (${f.size} byte) — tối đa 4MB` },
      { status: 400 },
    );
  }
  const buf = Buffer.from(await f.arrayBuffer());
  if (!isZip(buf)) {
    await log("JAR_UPLOAD_ERR", kind + " không phải zip", ipOf(req));
    return NextResponse.json(
      { error: "Đây không phải file .jar hợp lệ (không phải zip)" },
      { status: 400 },
    );
  }
  try {
    const meta = await saveJar(kind, buf, u.username);
    await log("JAR_UPLOAD_OK", `${kind} → ${meta.filename} (v${meta.version}, ${meta.sizeBytes}B)`, ipOf(req));
    return NextResponse.json({ ok: true, jar: meta });
  } catch (e) {
    const raw = String((e as Error).message || e);
    const errVi = raw.includes("KHONG_DOC_DUOC_PLUGIN_YML")
      ? "Không đọc được plugin.yml / version bên trong file jar — kiểm tra lại file có đúng là plugin build ra không"
      : "Lỗi lưu jar: " + raw.slice(0, 150);
    await log("JAR_UPLOAD_ERR", kind + " " + raw.slice(0, 200), ipOf(req));
    return NextResponse.json({ error: errVi }, { status: 400 });
  }
}
