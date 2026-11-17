"use client";

/* Trang /admin — WEB QUẢN TRỊ
   Đăng nhập bằng ADMIN_SECRET (env trên Vercel) → duyệt đơn cấp key,
   từ chối đơn, khóa key, sửa giá, cấu hình ngân hàng, xem nhật ký. */

import { useCallback, useEffect, useState } from "react";

interface Order {
  code: string;
  type: string;
  buyer_name: string;
  buyer_contact: string;
  package_code: string;
  pkg_name: string;
  amount_vnd: number;
  note: string | null;
  status: string;
  created_at: string;
  key: string | null;
  expires_at: string | null;
  license_status: string | null;
  days: number;
  decided_at: string | null;
}
interface Pkg {
  code: string;
  name: string;
  days: number;
  price_vnd: number;
  enabled: number;
  sort: number;
}
interface Lic {
  id: number;
  key: string;
  order_code: string;
  pkg_name: string | null;
  expires_at: string;
  status: string;
  buyer: string | null;
  still_valid: boolean;
  server_id?: string | null;
  server_changes?: number;
  wm?: number;
  suspicious?: boolean;
}
interface LogRow {
  id: number;
  action: string;
  detail: string | null;
  ip: string | null;
  created_at: string;
}
interface Stats {
  pending: number;
  approved: number;
  rejected: number;
  revenue_vnd: number;
}

const fmt = (n: number) => Number(n).toLocaleString("vi-VN") + "đ";
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("vi-VN") : "-");
const chip = (st: string) => <span className={"chip chip-" + st}>{st}</span>;

export default function AdminPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"orders" | "packages" | "bank" | "licenses" | "logs">("orders");
  const [msg, setMsg] = useState("");

  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [bank, setBank] = useState({ bank_name: "", bank_account: "", bank_holder: "" });
  const [lics, setLics] = useState<Lic[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);

  /* v3.5.0 — TẠO KEY TRỰC TIẾP (không cần đơn) */
  const [ckKind, setCkKind] = useState<"free" | "premium">("premium");
  const [ckDays, setCkDays] = useState<number>(90);
  const [ckCount, setCkCount] = useState<number>(1);
  const [ckBuyer, setCkBuyer] = useState("");
  const [ckKeys, setCkKeys] = useState<{ key: string; expires_at: string }[]>([]);

  const loadOrders = useCallback(async () => {
    const r = await fetch("/api/admin/orders");
    if (r.status === 401) return setAdmin(false);
    const d = await r.json();
    setOrders(d.orders || []);
    setStats(d.stats || null);
  }, []);
  const loadPkgs = useCallback(async () => {
    const r = await fetch("/api/admin/packages");
    if (r.ok) setPkgs((await r.json()).packages || []);
  }, []);
  const loadBank = useCallback(async () => {
    const r = await fetch("/api/admin/settings");
    if (r.ok) setBank((await r.json()).settings || { bank_name: "", bank_account: "", bank_holder: "" });
  }, []);
  const loadLics = useCallback(async () => {
    const r = await fetch("/api/admin/licenses");
    if (r.ok) setLics((await r.json()).licenses || []);
  }, []);
  const loadLogs = useCallback(async () => {
    const r = await fetch("/api/admin/logs");
    if (r.ok) setLogs((await r.json()).logs || []);
  }, []);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => setAdmin(!!d.admin))
      .catch(() => setAdmin(false));
  }, []);

  useEffect(() => {
    if (admin) {
      loadOrders();
      loadPkgs();
      loadBank();
      loadLics();
      loadLogs();
    }
  }, [admin, loadOrders, loadPkgs, loadBank, loadLics, loadLogs]);

  const login = async () => {
    setBusy(true);
    setLoginErr("");
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Đăng nhập thất bại");
      setAdmin(true);
    } catch (e) {
      setLoginErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const act = async (url: string, okMsg: string) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(url, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Thao tác lỗi");
      setMsg(okMsg);
      await loadOrders();
      await loadLics();
    } catch (e) {
      setMsg("❌ " + String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  /* v3.5.0 — tạo key trực tiếp: key thường / Premium có hạn / VÔ HẠN */
  const createKeys = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: ckKind, days: ckDays, count: ckCount, buyer: ckBuyer || "Khách trực tiếp" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lỗi tạo key");
      setCkKeys(d.keys || []);
      setMsg("✅ Đã tạo " + (d.keys || []).length + " key — COPY GỬI KHÁCH NGAY (chỉ hiện 1 lần!)");
      await loadLics();
    } catch (e) {
      setMsg("❌ " + String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };
  const extendLic = async (id: number) => {
    const days = window.prompt("Gia hạn bao nhiêu ngày cho key #" + id + "?", "30");
    if (!days) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/licenses/" + id + "/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: Number(days) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lỗi gia hạn");
      setMsg("✅ Key #" + id + " mới hạn đến " + d.expires_at);
      await loadLics();
    } catch (e) {
      setMsg("❌ " + String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const savePackages = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/packages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packages: pkgs }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Lưu lỗi");
      setPkgs(d.packages || []);
      setMsg("✅ Đã lưu bảng giá mới — khách thấy giá mới lập tức");
    } catch (e) {
      setMsg("❌ " + String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const saveBank = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bank),
      });
      if (!r.ok) throw new Error("Lưu lỗi");
      setMsg("✅ Đã lưu thông tin ngân hàng — QR của khách tự đổi theo");
    } catch (e) {
      setMsg("❌ " + String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  /* ---------- Đăng nhập ---------- */
  if (admin === null) return <p style={{ color: "var(--muted)" }}>Đang kiểm tra phiên...</p>;

  if (!admin) {
    return (
      <div style={{ maxWidth: 420, margin: "60px auto" }}>
        <div className="card">
          <h2>🔐 Đăng nhập quản trị</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            Nhập mật khẩu ADMIN_SECRET (đặt trong Environment Variables của Vercel).
          </p>
          <label>
            Mật khẩu admin
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="••••••••"
            />
          </label>
          {loginErr && <div className="alert alert-err">{loginErr}</div>}
          <button className="btn btn-gold" style={{ width: "100%", marginTop: 14 }} onClick={login} disabled={busy}>
            {busy ? "Đang kiểm tra..." : "Vào web quản trị"}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- Dashboard ---------- */
  return (
    <>
      <div className="row" style={{ alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>🛠 Quản trị Đấu La Đại Lục</h1>
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: "auto" }}
          onClick={async () => {
            await fetch("/api/admin/logout", { method: "POST" });
            setAdmin(false);
          }}
        >
          Đăng xuất
        </button>
      </div>

      {stats && (
        <div className="grid grid-3" style={{ marginTop: 14 }}>
          <div className="card" style={{ margin: 0 }}>
            ⏳ Chờ duyệt: <b style={{ color: "var(--warn)" }}>{stats.pending}</b>
          </div>
          <div className="card" style={{ margin: 0 }}>
            ✅ Đã duyệt: <b style={{ color: "var(--ok)" }}>{stats.approved}</b>
          </div>
          <div className="card" style={{ margin: 0 }}>
            💰 Doanh thu: <b style={{ color: "var(--gold)" }}>{fmt(stats.revenue_vnd)}</b>
          </div>
        </div>
      )}

      {msg && <div className="alert alert-ok">{msg}</div>}

      <div className="tabs">
        <button className={tab === "orders" ? "on" : ""} onClick={() => setTab("orders")}>
          🧾 Giao dịch ({stats?.pending ?? "?"} chờ)
        </button>
        <button className={tab === "packages" ? "on" : ""} onClick={() => setTab("packages")}>
          💵 Gói giá
        </button>
        <button className={tab === "bank" ? "on" : ""} onClick={() => setTab("bank")}>
          🏦 Ngân hàng
        </button>
        <button className={tab === "licenses" ? "on" : ""} onClick={() => setTab("licenses")}>
          🔑 Key đã cấp
        </button>
        <button className={tab === "logs" ? "on" : ""} onClick={() => setTab("logs")}>
          📜 Nhật ký
        </button>
      </div>

      {tab === "orders" && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Gói</th>
                  <th>Tiền</th>
                  <th>Người mua</th>
                  <th>Trạng thái</th>
                  <th>Key</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.code}>
                    <td>
                      <code>{o.code}</code>
                      <br />
                      <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{dt(o.created_at)}</span>
                      <br />
                      <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                        {o.type === "card" ? "📱 thẻ cào" : "🏦 chuyển khoản"}
                        {o.note ? ` · ${o.note}` : ""}
                      </span>
                    </td>
                    <td>{o.pkg_name}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmt(o.amount_vnd)}</td>
                    <td>
                      {o.buyer_name}
                      <br />
                      <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{o.buyer_contact}</span>
                    </td>
                    <td>{chip(o.status)}</td>
                    <td>
                      {o.key ? (
                        <span className="mono" style={{ fontSize: "0.75rem" }}>
                          {o.key.slice(0, 20)}… {o.license_status === "revoked" ? "(đã khóa)" : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {o.status === "pending" ? (
                        <>
                          <button
                            className="btn btn-green btn-sm"
                            disabled={busy}
                            onClick={() => act("/api/admin/orders/" + o.code + "/confirm", "✅ Đã duyệt " + o.code + " — key cấp cho khách")}
                          >
                            ✅ Duyệt &amp; cấp key
                          </button>{" "}
                          <button
                            className="btn btn-red btn-sm"
                            disabled={busy}
                            onClick={() => act("/api/admin/orders/" + o.code + "/reject", "✅ Đã từ chối " + o.code)}
                          >
                            Từ chối
                          </button>
                        </>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{dt(o.decided_at)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "packages" && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Gói</th>
                  <th>Tên hiển thị</th>
                  <th>Giá (đ)</th>
                  <th>Bán?</th>
                </tr>
              </thead>
              <tbody>
                {pkgs.map((p, i) => (
                  <tr key={p.code}>
                    <td>
                      <code>{p.code}</code> ({p.days === 0 ? "vĩnh viễn" : p.days + " ngày"})
                    </td>
                    <td>
                      <input
                        value={p.name}
                        onChange={(e) => {
                          const c = [...pkgs];
                          c[i] = { ...p, name: e.target.value };
                          setPkgs(c);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={p.price_vnd}
                        onChange={(e) => {
                          const c = [...pkgs];
                          c[i] = { ...p, price_vnd: Number(e.target.value) };
                          setPkgs(c);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={p.enabled === 1}
                        onChange={(e) => {
                          const c = [...pkgs];
                          c[i] = { ...p, enabled: e.target.checked ? 1 : 0 };
                          setPkgs(c);
                        }}
                        aria-label="Bật bán gói"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-gold" onClick={savePackages} disabled={busy} style={{ marginTop: 12 }}>
            💾 Lưu bảng giá
          </button>
        </div>
      )}

      {tab === "bank" && (
        <div className="card" style={{ maxWidth: 480 }}>
          <h3>🏦 Thông tin nhận tiền (QR VietQR của khách tự sinh theo)</h3>
          <label>
            Tên ngân hàng (vd: Vietcombank, MB, Vietinbank, Techcombank...)
            <input value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} />
          </label>
          <label>
            Số tài khoản
            <input className="mono" value={bank.bank_account} onChange={(e) => setBank({ ...bank, bank_account: e.target.value })} />
          </label>
          <label>
            Chủ tài khoản (IN HOA không dấu)
            <input value={bank.bank_holder} onChange={(e) => setBank({ ...bank, bank_holder: e.target.value })} />
          </label>
          <button className="btn btn-gold" onClick={saveBank} disabled={busy} style={{ marginTop: 12 }}>
            💾 Lưu ngân hàng
          </button>
        </div>
      )}

      {tab === "licenses" && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>⚡ Tạo key trực tiếp (không cần đơn)</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={ckKind} onChange={(e) => setCkKind(e.target.value as "free" | "premium")} disabled={busy}>
              <option value="premium">PREMIUM (bản VIP)</option>
              <option value="free">KEY THƯỜNG FREE- (bản Free)</option>
            </select>
            <select value={ckDays} onChange={(e) => setCkDays(Number(e.target.value))} disabled={busy || ckKind === "free"}>
              <option value={0}>VÔ HẠN (vĩnh viễn)</option>
              <option value={30}>30 ngày</option>
              <option value={90}>90 ngày</option>
              <option value={180}>180 ngày</option>
              <option value={365}>365 ngày</option>
            </select>
            <input type="number" min={1} max={20} value={ckCount} onChange={(e) => setCkCount(Number(e.target.value) || 1)} style={{ width: 70 }} disabled={busy} title="Số lượng (tối đa 20)" />
            <input placeholder="Tên người mua (không bắt buộc)" value={ckBuyer} onChange={(e) => setCkBuyer(e.target.value)} style={{ width: 210 }} disabled={busy} />
            <button className="btn" onClick={createKeys} disabled={busy}>🔑 Tạo key</button>
          </div>
          {ckKeys.length > 0 && (
            <pre style={{ background: "#0d1117", color: "#7ee787", padding: 12, borderRadius: 8, overflowX: "auto", marginTop: 10 }}>
{ckKeys.map((k) => k.key + "   (hạn " + k.expires_at + ")").join("\n")}
            </pre>
          )}
          <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginBottom: 0 }}>
            Key premium lưu dạng BĂM SHA-256 — key thô chỉ hiện ĐÚNG 1 LẦN ở khung trên, copy gửi khách ngay.
            Key VÔ HẠN ghi hạn 2275-12-31 (dùng vĩnh viễn).
          </p>
        </div>
      )}
      {tab === "licenses" && (
        <div className="card">
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            🔒 Khóa key → verify-key trả <code>KEY_DA_THU_HOI</code>, tải Premium bị chặn 403, plugin server khách
            sẽ tự khóa khi key theo ngày hết hạn (re-check 5 phút). Key LIFETIME hạn 2275 không bao giờ hết hạn.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Gói</th>
                  <th>Đơn</th>
                  <th>Người mua</th>
                  <th>Hạn</th>
                  <th>Server gắn</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {lics.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span className="mono" style={{ fontSize: "0.75rem" }}>
                        {l.key.slice(0, 30)}…
                      </span>
                    </td>
                    <td>{l.pkg_name || "?"}</td>
                    <td>
                      <code>{l.order_code}</code>
                    </td>
                    <td>{l.buyer}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {l.expires_at}{" "}
                      {l.expires_at === "2275-12-31" && <span className="chip chip-lifetime">VĨNH VIỄN</span>}
                    </td>
                    <td style={{ fontSize: "0.7rem" }} title="ID server Minecraft đã gắn (đổi máy tối đa 2 lần/30 ngày)">
                      {l.server_id ? (
                        <span className="mono">{String(l.server_id).slice(0, 13)}…{l.server_changes ? ` (đổi ${l.server_changes}x)` : ""}</span>
                      ) : (
                        <span style={{ opacity: 0.5 }}>—</span>
                      )}
                    </td>
                    <td>
                      {l.status === "active" ? (
                        l.still_valid ? chip("approved") : chip("pending")
                      ) : (
                        chip("revoked")
                      )}{" "}
                      {l.suspicious && (
                        <span className="chip" style={{ background: "#7f1d1d", color: "#fecaca" }} title="Telemetry heartbeat báo bất thường (vân tay jar lệch build / watermark sai / agent lạ). Kiểm tra license_telemetry rồi xem xét thu hồi.">
                          ⚠ nghi vấn
                        </span>
                      )}
                      {l.wm ? (
                        <span className="mono" style={{ opacity: 0.55, fontSize: "0.65rem", marginLeft: 4 }} title="Watermark theo key — truy nguồn rò rỉ">wm{l.wm}</span>
                      ) : null}
                    </td>
                    <td>
                      {l.status === "active" && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            className="btn btn-red btn-sm"
                            disabled={busy}
                            onClick={() => act("/api/admin/licenses/" + l.id + "/revoke", "🔒 Đã khóa key #" + l.id)}
                          >
                            🔒 Khóa key
                          </button>
                          {l.server_id && (
                            <button
                              className="btn btn-sm"
                              disabled={busy}
                              title="Xóa ID server đã gắn + mở lại lượt đổi máy (2 lần/30 ngày)"
                              onClick={() => act("/api/admin/licenses/" + l.id + "/rebind", "🔓 Đã reset bind key #" + l.id)}
                            >
                              🔓 Reset máy
                            </button>
                          )}
                          <button
                            className="btn btn-sm"
                            disabled={busy}
                            title="Cộng thêm ngày dùng cho key (trừ key VĨNH VIỄN)"
                            onClick={() => extendLic(l.id)}
                          >
                            ⏫ Gia hạn
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "logs" && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Hành động</th>
                  <th>Chi tiết</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{dt(l.created_at)}</td>
                    <td>
                      <b>{l.action}</b>
                    </td>
                    <td style={{ color: "var(--muted)" }}>{l.detail}</td>
                    <td>{l.ip || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
