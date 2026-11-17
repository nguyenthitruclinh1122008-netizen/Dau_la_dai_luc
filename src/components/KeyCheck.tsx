"use client";

/* KeyCheck — ô kiểm tra key công khai trên trang chủ (hỗ trợ cả key thường FREE-) */
import { useState } from "react";

interface Result {
  valid: boolean;
  reason?: string;
  plan?: string;
  holder?: string;
  expires_at?: string | null;
  lifetime?: boolean;
}

const REASON_VI: Record<string, string> = {
  KEY_TRONG: "Chưa nhập key",
  KEY_SAI_DINH_DANG: "Key sai định dạng (định dạng hợp lệ: FREE-XXXX-XXXX-XXXX hoặc key Premium)",
  KEY_KHONG_TON_TAI: "Key không tồn tại trong sổ của shop",
  KEY_DA_THU_HOI: "Key đã bị admin thu hồi",
  KEY_HET_HAN: "Key đã hết hạn",
  KEY_KHONG_HOP_LE: "Key không hợp lệ (chữ ký sai)",
  KEY_SAI_NGAY_HET_HAN: "Key sai ngày hết hạn",
  KEY_THIEU_THONG_TIN: "Key thiếu thông tin",
  KEY_SAI_PHIEN_BAN: "Key sai phiên bản",
};

export default function KeyCheck() {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  const check = async () => {
    setRes(null);
    if (!key.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      setRes(await r.json());
    } catch {
      setRes({ valid: false, reason: "Lỗi kết nối — thử lại sau" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3>🔍 Kiểm tra key (công khai)</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 10px" }}>
        Dán key thường (FREE-…) hoặc key Premium vào đây để tra trạng thái: còn hạn / hết hạn / bị khóa.
      </p>
      <div className="row">
        <input
          className="mono"
          placeholder="FREE-AB2C-D3EF-G4HJ hoặc key Premium"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && check()}
        />
        <button className="btn btn-ghost" onClick={check} disabled={busy || !key.trim()}>
          {busy ? "Đang tra..." : "Kiểm tra"}
        </button>
      </div>
      {res && (
        <div className={"alert " + (res.valid ? "alert-ok" : "alert-err")} style={{ marginTop: 12 }}>
          {res.valid ? (
            <>
              ✅ <b>KEY HỢP LỆ</b> — gói: <b>{res.plan}</b>
              {res.lifetime ? " · vĩnh viễn" : res.expires_at ? ` · hết hạn ngày ${String(res.expires_at).slice(0, 10)}` : ""}{" "}
              · chủ key: <b>{res.holder}</b>
            </>
          ) : (
            <>❌ <b>KEY KHÔNG HỢP LỆ</b> — {REASON_VI[res.reason || ""] || res.reason}</>
          )}
        </div>
      )}
    </section>
  );
}
