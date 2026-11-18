"use client";

/* Trang /user — MUA KEY PREMIUM (VietQR chuyển khoản hoặc thẻ cào)
   Đơn luôn ở trạng thái "Chờ admin duyệt" — KHÔNG BAO GIỜ tự cấp key.
   Admin duyệt xong, khách quay lại trang này tra cứu mã đơn để nhận KEY
   và tải jar Premium. */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Pkg {
  code: string;
  name: string;
  days: number;
  price_vnd: number;
  price: number;
  on_sale: boolean;
  discount_pct: number;
}
interface OrderInfo {
  order: {
    code: string;
    type: string;
    buyer_name: string;
    pkg_name: string;
    amount_vnd: number;
    status: string;
  };
  key: string | null;
  expires_at: string | null;
  lifetime: boolean;
  license_status?: string | null;
}
interface Payment {
  bank_name: string;
  bank_account: string;
  bank_holder: string;
  qr_url: string;
}

const fmt = (n: number) => n.toLocaleString("vi-VN") + "đ";
const CARDS = [
  { net: "Viettel", vals: [10000, 20000, 50000, 100000] },
  { net: "Mobifone", vals: [10000, 20000, 50000, 100000] },
  { net: "Vinaphone", vals: [10000, 20000, 50000, 100000] },
];

export default function UserPage() {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [pick, setPick] = useState<string>("");
  const [mode, setMode] = useState<"transfer" | "card">("transfer");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [cardNet, setCardNet] = useState("Viettel");
  const [cardVal, setCardVal] = useState(50000);
  const [cardSerial, setCardSerial] = useState("");
  const [cardPin, setCardPin] = useState("");

  const [step, setStep] = useState<"chon" | "thongtin" | "thanhtoan">("chon");
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [checkCode, setCheckCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/packages")
      .then((r) => r.json())
      .then((d) => setPkgs(d.packages || []))
      .catch(() => setErr("Không tải được bảng giá — thử lại sau."));
    const saved = localStorage.getItem("daula_last_order");
    if (saved) setCheckCode(saved);
  }, []);

  const lookup = useCallback(async (code: string) => {
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/orders/" + encodeURIComponent(code.trim().toUpperCase()));
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Tra cứu lỗi");
      setOrder(d);
      localStorage.setItem("daula_last_order", d.order.code);
      setStep("thanhtoan");
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, []);

  const createOrder = async () => {
    setErr("");
    if (!pick) return setErr("Ngươi chưa chọn gói key!");
    if (!name.trim() || !contact.trim()) return setErr("Nhập đủ Tên gọi và Liên hệ nhé!");
    setBusy(true);
    try {
      const note =
        mode === "card" ? `${cardNet}|${cardVal}|${cardSerial.trim()}|${cardPin.trim()}` : "";
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_code: pick, buyer_name: name.trim(), buyer_contact: contact.trim(), type: mode, note }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Tạo đơn lỗi");
      setPayment(d.payment || null);
      await lookup(d.order.code);
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const copyKey = () => {
    if (order?.key) {
      navigator.clipboard?.writeText(order.key).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const chosen = pkgs.find((p) => p.code === pick);

  /* ---------- GIAO DIỆN ---------- */
  return (
    <>
      <h1>💎 Mua Key Premium</h1>
      <p style={{ color: "var(--muted)" }}>
        Chọn gói → gửi thanh toán → <b>chờ admin duyệt</b> (KHÔNG tự cấp key) → quay lại đây tra cứu mã đơn để nhận
        KEY và tải jar Premium. Hỗ trợ:{" "}
        <a href="https://discord.gg/uNDvZ38TC" target="_blank" rel="noreferrer">
          discord.gg/uNDvZ38TC
        </a>
      </p>

      {err && <div className="alert alert-err">{err}</div>}

      {/* TRA CỨU NHANH */}
      <div className="card">
        <h3>🔍 Tra cứu đơn của ngươi</h3>
        <div className="row">
          <label>
            Mã đơn hàng (SLxxxxxx)
            <input
              className="mono"
              placeholder="SLAB12CD"
              value={checkCode}
              onChange={(e) => setCheckCode(e.target.value)}
            />
          </label>
          <button className="btn btn-ghost" onClick={() => lookup(checkCode)} disabled={busy || !checkCode.trim()}>
            {busy ? "Đang tra..." : "Tra cứu"}
          </button>
        </div>
      </div>

      {/* KẾT QUẢ ĐƠN */}
      {order && (
        <div className="card">
          <h3>
            Đơn <code>{order.order.code}</code>{" "}
            <span className={"chip chip-" + order.order.status}>
              {order.order.status === "pending"
                ? "⏳ Chờ admin duyệt"
                : order.order.status === "approved"
                  ? "✅ Đã duyệt"
                  : "❌ Bị từ chối"}
            </span>
          </h3>
          <p>
            {order.order.pkg_name} — <b>{fmt(order.order.amount_vnd)}</b> · người mua: {order.order.buyer_name}
          </p>

          {order.order.status === "pending" && (
            <>
              <div className="alert alert-warn">
                ⏳ Đang chờ admin xác nhận thanh toán. Thường duyệt trong vài phút — nhắn{" "}
                <a href="https://discord.gg/uNDvZ38TC" target="_blank" rel="noreferrer">
                  Discord SOULLAND
                </a>{" "}
                kèm mã đơn {order.order.code} nếu lâu quá!
              </div>
              {payment && mode === "transfer" && (
                <div className="grid grid-2" style={{ alignItems: "center" }}>
                  <div>
                    <p>
                      🏦 Ngân hàng: <b>{payment.bank_name}</b>
                      <br />
                      💳 STK: <b className="mono">{payment.bank_account}</b>
                      <br />
                      👤 Chủ tk: <b>{payment.bank_holder}</b>
                      <br />
                      💰 Số tiền: <b style={{ color: "var(--gold)" }}>{fmt(order.order.amount_vnd)}</b>
                      <br />
                      ✏️ Nội dung CK: <code>{order.order.code}</code> (bắt buộc đúng!)
                    </p>
                    <div className="alert alert-warn">
                      💬 Chuyển xong mà key chưa về? Nhắn chủ shop qua Discord kèm mã đơn {order.order.code}.
                    </div>
                  </div>
                  <div className="qr-img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={payment.qr_url} alt={"QR chuyển khoản mã đơn " + order.order.code} />
                  </div>
                </div>
              )}
            </>
          )}

          {order.order.status === "rejected" && (
            <div className="alert alert-err">
              Đơn bị từ chối (thẻ cào sai / sai số tiền). Tạo đơn lại hoặc nhắn admin qua Discord kèm mã{" "}
              {order.order.code}.
            </div>
          )}

          {order.order.status === "approved" && (
            <div>
              {order.key ? (
                <>
                  <div className="alert alert-ok">
                    🎉 Đơn đã duyệt! Đây là key PREMIUM của ngươi{" "}
                    {order.lifetime && <span className="chip chip-lifetime">VĨNH VIỄN</span>}
                  </div>
                  <div className="key-box" style={{ userSelect: "all" }}>
                    {order.key}
                  </div>
                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="btn btn-gold btn-sm" onClick={copyKey}>
                      {copied ? "✓ Đã copy" : "📋 Copy key"}
                    </button>
                    <a className="btn btn-green btn-sm" href={"/api/download/premium?order=" + order.order.code}>
                      ⬇ Tải jar Premium
                    </a>
                  </div>
                  <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 10 }}>
                    Hạn dùng: <b>{order.expires_at}</b>
                    {order.lifetime ? " — VĨNH VIỄN, dùng mãi mãi!" : ""} · Dán key vào{" "}
                    <code>config.yml</code> (<code>licensing.key</code>) hoặc{" "}
                    <code>/dl license activate &lt;KEY&gt;</code> — plugin kiểm tra OFFLINE.
                  </p>
                </>
              ) : (
                <div className="alert alert-err">
                  Key của đơn này đã hết hạn hoặc bị khóa (bạn đã mua gói theo ngày). Mua lại để có key mới hoặc nhắn
                  admin qua Discord.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MUA MỚI */}
      <section className="steps">
        <div className="card">
          <h3>Chọn gói key</h3>
          <div className="grid grid-3">
            {pkgs.map((p) => (
              <button
                key={p.code}
                onClick={() => {
                  setPick(p.code);
                  setStep("thongtin");
                }}
                className={"btn " + (pick === p.code ? "btn-gold" : "btn-ghost")}
                style={{ textAlign: "left" }}
              >
                <b>{p.name}</b>
                <br />
                <span style={{ fontWeight: 400, fontSize: "0.9rem" }}>
                  {p.days === 0 ? "hạn 2275 — dùng vĩnh viễn" : `hạn +${p.days} ngày`} ·{" "}
                  {p.on_sale ? (
                    <>
                      <s style={{ color: "var(--muted)" }}>{fmt(p.price_vnd)}</s>{" "}
                      <b style={{ color: "#4ade80" }}>{fmt(p.price)}</b>{" "}
                      <span
                        style={{
                          background: "#e5484d",
                          color: "#fff",
                          borderRadius: 999,
                          padding: "1px 7px",
                          fontSize: "0.72rem",
                          fontWeight: 800,
                        }}
                      >
                        -{p.discount_pct}%
                      </span>
                    </>
                  ) : (
                    <b>{fmt(p.price_vnd)}</b>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {step !== "chon" && chosen && (
          <div className="card">
            <h3>
              Thông tin người mua — {chosen.name} (
              {chosen.on_sale ? (
                <>
                  <s style={{ color: "var(--muted)", fontSize: "0.85em" }}>{fmt(chosen.price_vnd)}</s>{" "}
                  <b style={{ color: "#4ade80" }}>{fmt(chosen.price)}</b> (giá đã giảm)
                </>
              ) : (
                fmt(chosen.price_vnd)
              )}
              )
            </h3>
            <div className="grid grid-2">
              <label>
                Tên gọi trong game / họ tên
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Đường Tam" />
              </label>
              <label>
                Liên hệ (Discord / email / Zalo)
                <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="tangsan#1234" />
              </label>
            </div>
            <label>
              Phương thức thanh toán
              <select value={mode} onChange={(e) => setMode(e.target.value as "transfer" | "card")}>
                <option value="transfer">🏦 Chuyển khoản VietQR (khuyến nghị)</option>
                <option value="card">📱 Thẻ cào điện thoại</option>
              </select>
            </label>

            {mode === "card" && (
              <div className="grid grid-2">
                <label>
                  Nhà mạng
                  <select value={cardNet} onChange={(e) => setCardNet(e.target.value)}>
                    {CARDS.map((c) => (
                      <option key={c.net}>{c.net}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Mệnh giá thẻ
                  <select value={cardVal} onChange={(e) => setCardVal(Number(e.target.value))}>
                    {CARDS[0].vals.map((v) => (
                      <option key={v} value={v}>
                        {fmt(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Serial thẻ
                  <input className="mono" value={cardSerial} onChange={(e) => setCardSerial(e.target.value)} />
                </label>
                <label>
                  Mã PIN dưới lớp bạc
                  <input className="mono" value={cardPin} onChange={(e) => setCardPin(e.target.value)} />
                </label>
                <div className="alert alert-warn" style={{ gridColumn: "1 / -1" }}>
                  ⚠️ Thẻ cào đúng mệnh giá = gói tương ứng theo bảng giá. Admin kiểm tra thẻ thật rồi mới duyệt — thẻ
                  sai mệnh giá sẽ bị từ chối.
                </div>
              </div>
            )}

            <button className="btn btn-gold" onClick={createOrder} disabled={busy} style={{ marginTop: 12 }}>
              {busy ? "Đang tạo đơn..." : mode === "transfer" ? "🏦 Tạo đơn + xem QR thanh toán" : "📱 Gửi thẻ cào"}
            </button>
          </div>
        )}
      </section>

      <div className="card" style={{ textAlign: "center" }}>
        🎮 Chưa có bản FREE? Tải về dùng thử miễn phí:{" "}
        <a className="btn btn-ghost btn-sm" href="/api/download/free">
          ⬇ jar FREE
        </a>{" "}
        · Wiki võ hồn tại <Link href="/">trang chủ</Link>
      </div>
    </>
  );
}
