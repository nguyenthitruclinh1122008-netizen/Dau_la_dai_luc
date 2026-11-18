"use client";

/* BẢNG GIÁ KEY PREMIUM trên trang chủ — nguồn /api/packages (cùng nguồn, cùng giá
   với trang /user). Chỉ đọc hiển thị; mua key vẫn làm ở /user để giữ đúng luồng duyệt đơn.
   Gói đang khuyến mãi: giá gốc GẠCH NGANG + giá sau giảm nổi bật + nhãn "-X%". */
import { useEffect, useState } from "react";
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

const fmt = (n: number) => n.toLocaleString("vi-VN") + "đ";

export default function PriceTable() {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/api/packages")
      .then((r) => r.json())
      .then((d) => setPkgs(d.packages || []))
      .catch(() => setErr(true));
  }, []);

  return (
    <section className="card" style={{ textAlign: "center" }}>
      <h2 style={{ marginTop: 0 }}>💎 GIÁ KEY PREMIUM</h2>
      <p style={{ color: "var(--muted)", marginTop: -6 }}>
        Giá đồng bộ với <Link href="/user">trang Mua Key</Link> — đơn được duyệt thì key cấp ngay, kích hoạt OFFLINE.
      </p>
      {pkgs.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          {err ? "Không tải được bảng giá — thử tải lại trang." : "Đang tải bảng giá…"}
        </p>
      ) : (
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
          {pkgs.map((p) => (
            <div
              key={p.code}
              className="card"
              style={{
                minWidth: 200,
                margin: 0,
                position: "relative",
                ...(p.on_sale ? { borderColor: "var(--gold, #ffd257)", boxShadow: "0 0 14px rgba(255,210,87,.25)" } : {}),
              }}
            >
              {p.on_sale && (
                <div
                  style={{
                    position: "absolute",
                    top: -10,
                    right: -6,
                    background: "#e5484d",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: "0.78rem",
                    padding: "3px 9px",
                    borderRadius: 999,
                    transform: "rotate(6deg)",
                  }}
                >
                  -{p.discount_pct}%
                </div>
              )}
              <h3 style={{ margin: "6px 0" }}>{p.name}</h3>
              <div style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
                {p.days === 0 ? "hạn 2275 — dùng vĩnh viễn" : `hạn +${p.days} ngày`}
              </div>
              {p.on_sale && (
                <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 8 }}>
                  <s>{fmt(p.price_vnd)}</s>
                </div>
              )}
              <div
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  margin: "10px 0",
                  color: p.on_sale ? "#4ade80" : "var(--gold, #ffd257)",
                }}
              >
                {fmt(p.on_sale ? p.price : p.price_vnd)}
                {p.on_sale && <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#e5484d" }}>🔥 GIÁ SALE</div>}
              </div>
              <Link className="btn btn-gold" href="/user">
                Mua ngay
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
