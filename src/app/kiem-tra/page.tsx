"use client";

/* Trang công khai /kiem-tra — ô nhập key để xem trạng thái (còn hạn / khoá / hết hạn)
   Gọi POST /api/verify-key (đã có sẵn — nguồn sự thật DB cho key DL-/FREE-).
   Không đăng nhập, không lộ dữ liệu nhạy cảm: chủ key bị che (maskName phía server). */
import { useState } from "react";

const LY_DO: Record<string, string> = {
  KEY_TRONG: "Nhập key cần kiểm tra.",
  KEY_SAI_DINH_DANG: "Key sai định dạng — đúng dạng: DL-XXXX-XXXX-XXXX-XXXX (Premium) hoặc FREE-XXXX-XXXX-XXXX (bản thường).",
  KEY_KHONG_TON_TAI: "Key KHÔNG tồn tại trong hệ thống (kiểm tra lại từng nhóm ký tự).",
  KEY_DA_THU_HOI: "Key đã bị khoá / thu hồi.",
  KEY_HET_HAN: "Key đã HẾT HẠN.",
};

export default function KiemTraKeyPage() {
  const [key, setKey] = useState("");
  const [kq, setKq] = useState<{
    valid?: boolean;
    plan?: string;
    expires_at?: string | null;
    lifetime?: boolean;
    holder?: string;
    reason?: string;
  } | null>(null);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState("");

  async function kiemTra() {
    setDang(true);
    setLoi("");
    setKq(null);
    try {
      const res = await fetch("/api/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim().toUpperCase() }),
      });
      setKq(await res.json());
    } catch {
      setLoi("Mất kết nối tới server — thử lại sau.");
    } finally {
      setDang(false);
    }
  }

  return (
    <div className="kt-wrap">
      <style>{`
        .kt-wrap { max-width: 680px; margin: 0 auto; padding: clamp(1.2rem, 4vw, 2.4rem) 1rem; }
        .kt-wrap h1 { font-size: clamp(1.5rem, 5vw, 2.2rem); margin: 0 0 .4em; color: #ffd76a; }
        .kt-wrap p.kt-mo { color: #9fb0cc; margin: 0 0 1.4em; line-height: 1.6; }
        .kt-box { display: flex; gap: .6rem; flex-wrap: wrap; }
        .kt-box input {
          flex: 1 1 260px; padding: .8rem 1rem; font-size: 1.05rem; letter-spacing: .06em;
          background: #101a2e; color: #eef3ff; border: 1px solid #2a3a5c; border-radius: 10px;
          text-transform: uppercase; min-width: 0;
        }
        .kt-box input:focus { outline: 2px solid #f0b429; }
        .kt-box button {
          padding: .8rem 1.4rem; font-size: 1rem; font-weight: 700; border: 0; border-radius: 10px;
          background: #f0b429; color: #1a1205; cursor: pointer; white-space: nowrap;
        }
        .kt-box button:disabled { opacity: .6; cursor: wait; }
        .kt-kq { margin-top: 1.2rem; border-radius: 12px; padding: 1.1rem 1.3rem; line-height: 1.65; }
        .kt-kq.ok  { background: #10281a; border: 1px solid #2f7d4c; color: #c9f2d8; }
        .kt-kq.err { background: #2b1216; border: 1px solid #8c3a44; color: #f2c9cf; }
        .kt-kq b.ten { font-size: 1.05rem; }
        .kt-kq .kt-hang { color: #9fb0cc; font-size: .95rem; }
      `}</style>
      <h1>🔑 Kiểm Tra Key</h1>
      <p className="kt-mo">
        Nhập key Premium (<b>DL-…</b>) hoặc key bản thường (<b>FREE-…</b>) để xem trạng thái: còn hạn,
        vĩnh viễn, đã hết hạn hay đã khoá. Chủ key hiển thị ở dạng che — không lộ thông tin cá nhân.
      </p>
      <div className="kt-box">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter" && !dang) kiemTra(); }}
          placeholder="DL-XXXX-XXXX-XXXX-XXXX"
          spellCheck={false}
          maxLength={40}
          aria-label="Key cần kiểm tra"
        />
        <button onClick={kiemTra} disabled={dang || !key.trim()}>
          {dang ? "Đang kiểm…" : "Kiểm tra"}
        </button>
      </div>
      {loi ? <div className="kt-kq err">{loi}</div> : null}
      {kq && kq.valid ? (
        <div className="kt-kq ok">
          <b className="ten">✔ KEY HỢP LỆ</b>
          <div>Loại: <b>{kq.plan || "PREMIUM"}</b></div>
          <div className="kt-hang">
            Hạn dùng: {kq.lifetime ? "Vĩnh viễn" : (kq.expires_at || "—")}
            {kq.holder ? ` · Chủ key: ${kq.holder}` : ""}
          </div>
        </div>
      ) : kq && !kq.valid ? (
        <div className="kt-kq err">
          <b className="ten">✖ KEY KHÔNG DÙNG ĐƯỢC</b>
          <div>{LY_DO[kq.reason || ""] || "Không kiểm tra được — thử lại sau."}</div>
          {kq.reason === "KEY_HET_HAN" && kq.expires_at ? (
            <div className="kt-hang">Hạn đã qua: {kq.expires_at}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
