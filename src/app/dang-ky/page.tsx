"use client";

/* Trang /dang-ky — TẠO TÀI KHOẢN → NHẬN NGAY KEY BẢN THƯỜNG (FREE) VĨNH VIỄN */

import { useState } from "react";
import Link from "next/link";

export default function DangKyPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ gift_key: string; username: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setErr("");
    if (!username.trim() || !password) return setErr("Nhập đủ tên đăng nhập và mật khẩu nhé!");
    if (password !== password2) return setErr("Mật khẩu gõ lại chưa khớp!");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, contact: contact.trim() }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Tạo tài khoản lỗi");
      setDone({ gift_key: d.gift_key, username: d.user.username });
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const copyKey = () => {
    if (done?.gift_key) {
      navigator.clipboard?.writeText(done.gift_key).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  if (done) {
    return (
      <>
        <h1>🎉 Tạo tài khoản thành công!</h1>
        <p style={{ color: "var(--muted)" }}>
          Chào mừng <b style={{ color: "var(--gold)" }}>{done.username}</b> gia nhập Đấu La Đại Lục! Đây là{" "}
          <b>KEY BẢN THƯỜNG</b> quà tặng thành viên của ngươi — <b>vĩnh viễn, không hết hạn</b>.
        </p>

        <div className="card" style={{ borderColor: "rgba(255,200,61,.6)" }}>
          <h3>🎁 KEY BẢN THƯỜNG CỦA NGƯƠI</h3>
          <div className="key-box" style={{ userSelect: "all", fontSize: "1.25rem", textAlign: "center" }}>
            {done.gift_key}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-gold btn-sm" onClick={copyKey}>
              {copied ? "✓ Đã copy!" : "📋 Copy key"}
            </button>
            <Link className="btn btn-green btn-sm" href="/tai-khoan">
              👤 Vào trang tài khoản
            </Link>
            <a className="btn btn-ghost btn-sm" href="/api/download/free">
              ⬇ Tải jar FREE
            </a>
          </div>
          <div className="alert alert-warn" style={{ marginTop: 12 }}>
            💾 <b>Lưu key lại ngay</b> (chụp màn hình / copy vào giấy). Muốn xem lại thì{" "}
            <Link href="/dang-nhap">đăng nhập</Link> bất cứ lúc nào — key luôn nằm trong trang tài khoản.
            <br />
            ℹ️ Key này là <b>key bản thường</b>: dùng cho bản FREE / xác minh thành viên trên web.{" "}
            <b>Không dùng được cho jar Premium</b> — muốn Premium thì mua key tại <Link href="/user">trang Mua Key</Link>.
          </div>
        </div>

        <div className="card">
          <h3>🚀 Bước tiếp theo</h3>
          <ol style={{ color: "var(--muted)" }}>
            <li>
              Tải <b>jar FREE</b> về, thả vào thư mục <code>plugins/</code> của server, restart.
            </li>
            <li>
              Vào game gõ <code>/dl thuctinh</code> để thức tỉnh Võ Hồn đầu tiên!
            </li>
            <li>
              Thích thì lên <b>PREMIUM</b> — đủ 9 Hồn Hoàn + Hồn Cốt + Võ Hồn Chân Thân tại{" "}
              <Link href="/user">trang Mua Key</Link>.
            </li>
          </ol>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>📝 Đăng ký tài khoản — nhận ngay KEY THƯỜNG</h1>
      <p style={{ color: "var(--muted)" }}>
        Tạo xong tài khoản là được tặng ngay <b style={{ color: "var(--gold)" }}>1 KEY BẢN THƯỜNG (FREE) vĩnh viễn</b> —
        miễn phí, không cần thanh toán, không cần duyệt.
      </p>

      {err && <div className="alert alert-err">{err}</div>}

      <div className="card" style={{ maxWidth: 560 }}>
        <label>
          Tên đăng nhập <span style={{ color: "var(--err)" }}>*</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="vd: TangSan_3"
            maxLength={20}
            autoComplete="username"
          />
          <small style={{ color: "var(--muted)" }}>3–20 ký tự: chữ không dấu, số, dấu gạch dưới (_)</small>
        </label>
        <label>
          Mật khẩu <span style={{ color: "var(--err)" }}>*</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="ít nhất 6 ký tự"
            autoComplete="new-password"
          />
        </label>
        <label>
          Gõ lại mật khẩu <span style={{ color: "var(--err)" }}>*</span>
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label>
          Liên hệ (Discord / Zalo — không bắt buộc)
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="discord của ngươi" />
        </label>

        <button className="btn btn-gold" onClick={submit} disabled={busy} style={{ marginTop: 12 }}>
          {busy ? "Đang tạo tài khoản..." : "🎁 Tạo tài khoản + nhận key"}
        </button>

        <p style={{ color: "var(--muted)", marginTop: 12, marginBottom: 0 }}>
          Đã có tài khoản? <Link href="/dang-nhap">Đăng nhập ngay</Link> — key thường nằm trong{" "}
          <Link href="/tai-khoan">trang tài khoản</Link>.
        </p>
      </div>

      <div className="card">
        <h3>❓ Key bản thường dùng để làm gì?</h3>
        <ul style={{ color: "var(--muted)" }}>
          <li>Là <b>chứng nhận thành viên</b> của shop — tra cứu công khai ở mục kiểm tra key trang chủ.</li>
          <li>Dùng cho <b>bản FREE</b> — bản FREE vốn miễn phí, không cần key cũng chơi được.</li>
          <li>Key thường <b>không kích hoạt được jar Premium</b> (plugin Premium từ chối định dạng FREE-).</li>
          <li>Admin có thể khóa key nếu phát hiện gian lận — chơi đẹp là được 😄</li>
        </ul>
      </div>
    </>
  );
}
