/* =====================================================================
   lib/jar-registry — NGUỒN SỰ THẬT DUY NHẤT CỦA JAR ĐANG HOST
   ---------------------------------------------------------------------
   • Admin nạp jar mới qua /api/admin/jar → byte jar + metadata (version
     đọc TỪ plugin.yml BÊN TRONG file) lưu bảng jar_files (Neon).
   • Mọi nơi hiển thị version / tên file tải về (trang chủ, nút tải,
     footer, EULA, route /api/download/*) đều đọc TỪ ĐÂY → sau khi nạp
     jar mới, web tự khớp version thật — KHÔNG hardcode số ở bất kỳ đâu.
   • Chưa nạp lần nào → fallback dùng jar kèm repo assets/jar/ và VẪN
     tự đọc version từ plugin.yml của file đó (đọc được thì tự seed DB).
   ===================================================================== */

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { q } from "./db";
import { readPluginYml, type PluginYml } from "./plugin-yml";

export type JarKind = "free" | "premium";

export interface JarMeta {
  kind: JarKind;
  version: string; // từ plugin.yml bên trong jar
  pluginName: string; // name: trong plugin.yml
  filename: string; // tên file tải về: DauLaDaiLuc-<Free|Premium>-<version>.jar
  sha256: string;
  sizeBytes: number;
  uploadedBy: string | null;
  uploadedAt: string | null;
  source: "db" | "bundled"; // db = bản admin nạp, bundled = bản kèm repo
}

const LABEL: Record<JarKind, string> = { free: "Free", premium: "Premium" };

/** Tên file tải về theo kind + version đọc từ plugin.yml.
    Chỉ giữ ký tự an toàn cho header Content-Disposition. */
export function jarFilename(kind: JarKind, version: string): string {
  const v = String(version).trim().replace(/[^A-Za-z0-9._+-]/g, "-") || "0";
  return `DauLaDaiLuc-${LABEL[kind]}-${v}.jar`;
}

/* ---------- 1) Ưu tiên: bản admin đã nạp trong DB ---------- */
async function dbRow(kind: JarKind): Promise<JarMeta | null> {
  try {
    const rows = await q(
      `SELECT kind, version, plugin_name, filename, sha256, size_bytes, uploaded_by, uploaded_at
         FROM jar_files WHERE kind = $1`,
      [kind],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      kind,
      version: String(r.version),
      pluginName: String(r.plugin_name || ""),
      filename: String(r.filename),
      sha256: String(r.sha256),
      sizeBytes: Number(r.size_bytes),
      uploadedBy: r.uploaded_by ? String(r.uploaded_by) : null,
      uploadedAt: r.uploaded_at ? new Date(r.uploaded_at).toISOString() : null,
      source: "db",
    };
  } catch {
    return null; // DB lỗi → lùi về bản kèm repo, không gãy trang
  }
}

/* ---------- 2) Fallback: jar kèm repo assets/jar (vẫn đọc plugin.yml thật) ---------- */
const BUNDLED_DIR = path.join(process.cwd(), "assets", "jar");
const bundledCache = new Map<JarKind, JarMeta | null>();

async function bundledFile(kind: JarKind): Promise<{ buf: Buffer; meta: JarMeta } | null> {
  try {
    const prefix = "DauLaDaiLuc-" + LABEL[kind];
    const names = (await readdir(BUNDLED_DIR)).filter(
      (n) => n.startsWith(prefix) && n.endsWith(".jar"),
    );
    if (names.length === 0) return null;
    names.sort(); // nhiều bản thì lấy tên cuối (version lớn nhất theo chữ)
    const fname = names[names.length - 1];
    const buf = await readFile(path.join(BUNDLED_DIR, fname));
    const py: PluginYml | null = readPluginYml(buf);
    if (!py || !py.version) return null;
    return {
      buf,
      meta: {
        kind,
        version: py.version,
        pluginName: py.name,
        filename: jarFilename(kind, py.version),
        sha256: createHash("sha256").update(new Uint8Array(buf)).digest("hex"),
        sizeBytes: buf.length,
        uploadedBy: null,
        uploadedAt: null,
        source: "bundled",
      },
    };
  } catch {
    return null;
  }
}

/** Metadata jar đang host (không kèm byte) — dùng cho mọi nơi hiển thị version */
export async function getJarMeta(kind: JarKind): Promise<JarMeta | null> {
  const row = await dbRow(kind);
  if (row) return row;
  if (!bundledCache.has(kind)) {
    bundledCache.set(kind, (await bundledFile(kind))?.meta ?? null);
  }
  return bundledCache.get(kind) ?? null;
}

/** Byte jar đang host + metadata: ưu tiên bản admin nạp trong DB; chưa có
    thì dùng jar kèm repo (và tự seed vào DB — best effort, không gãy request) */
export async function getJarBytes(
  kind: JarKind,
): Promise<{ buf: Buffer; meta: JarMeta } | null> {
  try {
    const rows = await q(`SELECT data FROM jar_files WHERE kind = $1`, [kind]);
    if (rows.length > 0) {
      const meta = await dbRow(kind);
      if (meta) return { buf: Buffer.from(rows[0].data), meta };
    }
  } catch {
    /* DB lỗi → thử bản kèm repo bên dưới */
  }
  const b = await bundledFile(kind);
  if (!b) return null;
  try {
    await saveJar(kind, b.buf, "auto-seed-kem-repo");
  } catch {
    /* seeding thất bại cũng không sao — lần sau thử lại */
  }
  return b;
}

/** Lưu 1 file jar mới cho kind — bắt buộc đọc được plugin.yml có version,
    không đọc được sẽ ném lỗi (route upload trả 400 kèm lời giải thích). */
export async function saveJar(kind: JarKind, buf: Buffer, by: string): Promise<JarMeta> {
  const py = readPluginYml(buf);
  if (!py || !py.version) throw new Error("KHONG_DOC_DUOC_PLUGIN_YML");
  const version = py.version.trim();
  const filename = jarFilename(kind, version);
  const sha256 = createHash("sha256").update(new Uint8Array(buf)).digest("hex");
  await q(
    `INSERT INTO jar_files
       (kind, version, plugin_name, filename, sha256, size_bytes, data, uploaded_by, uploaded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (kind) DO UPDATE SET
       version = EXCLUDED.version,
       plugin_name = EXCLUDED.plugin_name,
       filename = EXCLUDED.filename,
       sha256 = EXCLUDED.sha256,
       size_bytes = EXCLUDED.size_bytes,
       data = EXCLUDED.data,
       uploaded_by = EXCLUDED.uploaded_by,
       uploaded_at = now()`,
    [kind, version, py.name || "DauLaDaiLuc", filename, sha256, buf.length, buf, by],
  );
  return {
    kind,
    version,
    pluginName: py.name || "",
    filename,
    sha256,
    sizeBytes: buf.length,
    uploadedBy: by,
    uploadedAt: new Date().toISOString(),
    source: "db",
  };
}
