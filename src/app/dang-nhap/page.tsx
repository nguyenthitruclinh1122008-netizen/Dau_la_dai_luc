"use client";

/* Trang /dang-nhap — đăng nhập tài khoản người chơi → chuyển tới /tai-khoan */
import { useState } from "react";
import Link from "next/link";

export default function DangNhapPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (!username.trim() || !password) return setErr("Nhập đủ tên đăng nhập và mật khẩu nhé!");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Đăng nhập lỗi");
      window.location.href = "/tai-khoan";
    } catch (e) {
      setErr(String((e as Error).message || e));
      setBusy(false);
    }
  };

  return (
    <>
      <h1>🔑 Đăng nhập</h1>
      <p style={{ color: "var(--muted)" }}>
        Đăng nhập để xem <b>KEY BẢN THƯỜNG</b> đã nhận khi đăng ký và quản lý thông tin của ngươi.
      </p>

      {err && <div className="alert alert-err">{err}</div>}

      <div className="card" style={{ maxWidth: 480 }}>
        <label>
          Tên đăng nhập
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="TangSan_3"
            autoComplete="username"
          />
        </label>
        <label>
          Mật khẩu
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </label>
        <button className="btn btn-gold" onClick={submit} disabled={busy} style={{ marginTop: 12 }}>
          {busy ? "Đang đăng nhập..." : "🔑 Đăng nhập"}
        </button>
        <p style={{ color: "var(--muted)", marginTop: 12, marginBottom: 0 }}>
          Chưa có tài khoản? <Link href="/dang-ky">Đăng ký ngay</Link> — tạo xong được tặng key bản thường vĩnh viễn!
        </p>
      </div>
    </>
  );
}
