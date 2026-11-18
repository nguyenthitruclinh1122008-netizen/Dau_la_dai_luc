/* =====================================================================
   lib/plugin-yml.ts — ĐỌC plugin.yml BÊN TRONG FILE .jar (zip)
   ---------------------------------------------------------------------
   • Jar = file zip → đọc End Of Central Directory, duyệt central
     directory tìm entry "plugin.yml", giải nén (stored/deflate) rồi bóc
     trường name + version. Không cần thư viện ngoài (Node zlib là đủ).
   • Đây là gốc của quy tắc: TÊN FILE + VERSION HIỂN THỊ LUÔN LẤY TỪ
     plugin.yml CỦA FILE JAR ĐANG HOST — không hardcode số version.
   ===================================================================== */

import { inflateRawSync } from "node:zlib";

export interface PluginYml {
  name: string;
  version: string;
}

/** File có phải zip/jar hợp lệ (magic PK\x03\x04) */
export function isZip(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

function u16(b: Buffer, o: number): number {
  return b.readUInt16LE(o);
}
function u32(b: Buffer, o: number): number {
  return b.readUInt32LE(o);
}

/** Bóc giá trị 1 khóa cấp gốc trong plugin.yml — neo đầu dòng để không
    dính "api-version", bỏ quote và phần chú thích sau # */
function pick(yml: string, key: string): string | null {
  const m = yml.match(new RegExp("^" + key + ":\\s*([^\r\n#]+)", "m"));
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/** Đọc name + version từ plugin.yml trong jar — không tìm thấy file/không
    có version → trả null (upload sẽ bị từ chối) */
export function readPluginYml(buf: Buffer): PluginYml | null {
  if (!isZip(buf)) return null;
  /* 1) Tìm End Of Central Directory từ cuối file (EOCD 22 byte + comment tối đa 64KB) */
  const lo = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= lo; i--) {
    if (u32(buf, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const total = u16(buf, eocd + 10); // tổng số entry
  const cdOff = u32(buf, eocd + 16); // vị trí central directory
  /* 2) Duyệt central directory tìm plugin.yml */
  let p = cdOff;
  for (let n = 0; n < total && p + 46 <= buf.length; n++) {
    const method = u16(buf, p + 10);
    const csize = u32(buf, p + 20);
    const nameLen = u16(buf, p + 28);
    const extraLen = u16(buf, p + 30);
    const cmtLen = u16(buf, p + 32);
    const lho = u32(buf, p + 42); // offset local header
    const fname = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (fname.toLowerCase() === "plugin.yml") {
      /* 3) Local header → vùng dữ liệu nén */
      const lnLen = u16(buf, lho + 26);
      const leLen = u16(buf, lho + 28);
      const dataStart = lho + 30 + lnLen + leLen;
      if (dataStart + csize > buf.length) return null;
      const raw = buf.subarray(dataStart, dataStart + csize);
      let yml: string;
      try {
        yml = (method === 0 ? raw : inflateRawSync(raw)).toString("utf8");
      } catch {
        return null;
      }
      /* 4) Bóc name/version */
      const version = pick(yml, "version");
      if (!version) return null;
      return { name: pick(yml, "name") || "", version };
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return null;
}
