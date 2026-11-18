"use client";

/* Trang /tai-khoan — thông tin tài khoản + KEY BẢN THƯỜNG đã nhận + đăng xuất */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Me {
  user: {
    id: number;
    username: string;
    role?: string;
    contact: string | null;
    created_at: string;
    last_login: string | null;
    vip?: boolean;
  } | null;
  gift_key?: string | null;
  gift_plan?: string | null;
}

export default function TaiKhoanPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d))
      .catch(() => setMe({ user: null }))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyKey = () => {
    if (me?.gift_key) {
      navigator.clipboard?.writeText(me.gift_key).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <p style={{ color: "var(--muted)" }}>Đang tải...</p>;

  if (!me?.user) {
    return (
      <>
        <h1>👤 Tài khoản</h1>
        <div className="alert alert-warn">
          Ngươi chưa đăng nhập! <Link href="/dang-nhap">Đăng nhập</Link> hoặc{" "}
          <Link href="/dang-ky">đăng ký mới</Link> — tạo xong tài khoản được tặng ngay key bản thường vĩnh viễn.
        </div>
      </>
    );
  }

  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString("vi-VN") : "—");

  return (
    <>
      <h1>👤 Tài khoản: {me.user.username}</h1>
      {me.user.role === "admin" ? (
        <p>
          <span className="chip chip-lifetime">👑 QUẢN TRỊ VIÊN — chủ shop Đấu La Đại Lục</span>
        </p>
      ) : me.user.vip ? (
        <p>
          <span className="chip chip-lifetime">💎 THÀNH VIÊN VIP — PREMIUM</span>
        </p>
      ) : null}
      <p style={{ color: "var(--muted)" }}>
        Tạo lúc {fmtDate(me.user.created_at)} · đăng nhập gần nhất {fmtDate(me.user.last_login)}
        {me.user.contact ? (
          <>
            {" "}
            · liên hệ: <b>{me.user.contact}</b>
          </>
        ) : null}
      </p>

      <div className="card" style={{ borderColor: "rgba(255,200,61,.6)" }}>
        <h3>🎁 KEY BẢN THƯỜNG (quà đăng ký)</h3>
        {me.gift_key ? (
          <>
            <div className="key-box" style={{ userSelect: "all", fontSize: "1.2rem", textAlign: "center" }}>
              {me.gift_key}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-gold btn-sm" onClick={copyKey}>
                {copied ? "✓ Đã copy!" : "📋 Copy key"}
              </button>
              <a className="btn btn-ghost btn-sm" href="/api/download/free">
                ⬇ Tải jar FREE
              </a>
              <span className="chip chip-lifetime">{me.gift_plan || "vĩnh viễn"}</span>
            </div>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 10 }}>
              Kiểm tra key này công khai ở <Link href="/">trang chủ</Link> (mục kiểm tra key). Key thường{" "}
              <b>không dùng được cho jar Premium</b> — mua Premium tại <Link href="/user">trang Mua Key</Link>.
            </p>
          </>
        ) : (
          <div className="alert alert-warn">Tài khoản này chưa có key quà (tạo trước khi cập nhật này).</div>
        )}
      </div>

      {me.user.vip ? (
        <div className="card" style={{ borderColor: "rgba(255,200,61,.6)" }}>
          <h3>💎 TÀI KHOẢN VIP — BẢN PREMIUM</h3>
          <p style={{ color: "var(--muted)" }}>
            Tài khoản này đang ở hạng <b>VIP</b>: tải plugin PREMIUM trực tiếp qua phiên đăng nhập của ngươi (không
            cần đơn hàng) — mở khóa đủ 9 Hồn Hoàn + Hồn Cốt + Võ Hồn Chân Thân.
          </p>
          <div className="row">
            <a className="btn btn-gold" href="/api/download/premium">
              ⬇ TẢI PLUGIN PREMIUM
            </a>
            <span className="chip chip-lifetime">💎 VIP — vĩnh viễn</span>
            <a className="btn btn-ghost btn-sm" href="/api/download/free">
              ⬇ Tải jar FREE
            </a>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 10 }}>
            Kích hoạt trong game cần KEY Premium — dùng key admin cấp khi nâng VIP cho ngươi (key chỉ hiện 1 lần lúc
            cấp; mất thì liên hệ admin cấp lại).
          </p>
        </div>
      ) : (
        <div className="card">
          <h3>💎 Muốn lên PREMIUM?</h3>
          <p style={{ color: "var(--muted)" }}>
            Premium mở khóa đủ 9 Hồn Hoàn + Hồn Cốt + Võ Hồn Chân Thân. Mua tại{" "}
            <Link href="/user">trang Mua Key</Link> (VietQR / thẻ cào) — admin duyệt xong key về ngay và tài khoản
            tự thành VIP.
          </p>
          <div className="row">
            <Link className="btn btn-gold btn-sm" href="/user">
              💎 Mua Key Premium
            </Link>
            <a className="btn btn-ghost btn-sm" href="/api/download/free">
              ⬇ Tải jar FREE
            </a>
            <button className="btn btn-red btn-sm" onClick={logout} disabled={busy}>
              {busy ? "..." : "🚪 Đăng xuất"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
