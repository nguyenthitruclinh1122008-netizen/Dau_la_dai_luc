"use client";

/* UserBadge — góc phải header: hiện "Đăng nhập / Đăng ký" hoặc tên đã đăng nhập */
import { useEffect, useState } from "react";

export default function UserBadge() {
  const [user, setUser] = useState<{ username: string; role?: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return <span style={{ opacity: 0.5 }}>…</span>;

  if (user) {
    return (
      <a href="/tai-khoan" className="badge-user" style={{ color: "var(--gold)", fontWeight: 700 }}>
        {user.role === "admin" ? `👑 ${user.username} · Quản trị viên` : `👤 ${user.username}`}
      </a>
    );
  }
  return (
    <>
      <a href="/dang-nhap">Đăng nhập</a>
      <a href="/dang-ky" style={{ color: "var(--gold)", borderColor: "rgba(255,200,61,.5)" }}>
        🎁 Đăng ký nhận key
      </a>
    </>
  );
}
