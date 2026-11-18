/* Trang chủ / — Wiki 9 Võ Hồn + nút tải JAR + bảng giá Premium + thanh đánh giá (không cần Gmail)
   Version hiển thị lấy từ jar đang host (plugin.yml bên trong file) — admin nạp jar mới là tự đổi. */
import Link from "next/link";
import Rating from "./rating";
import KeyCheck from "@/components/KeyCheck";
import PriceTable from "@/components/PriceTable";
import JarChecksum from "@/components/JarChecksum";
import { SOULS, SKILL_LABEL, COMMANDS } from "@/data/souls";
import { getJarMeta } from "@/lib/jar-registry";

export default async function Home() {
  const v = (await getJarMeta("free"))?.version ?? "";
  return (
    <>
      <section className="hero">
        <h1>⚔ ĐẤU LA ĐẠI LỤC ⚔</h1>
        <p className="sub">
          Plugin Minecraft <b>Đấu La Đại Lục{v ? ` v${v}` : ""}</b> — Thức tỉnh 9 Võ Hồn, tu luyện Hồn Lực, hấp thụ Hồn
          Hoàn, Hồn Cốt, triệu hồi Hồn Thú. Bản FREE miễn phí — bản PREMIUM mở khóa đủ 9 Hồn Hoàn + Hồn Cốt + Võ Hồn đỉnh
          cao.
        </p>
        <div className="actions">
          <a className="btn btn-gold" href="/api/download/free">
            ⚡ TẢI JAR FREE{v ? ` — v${v}` : ""}
          </a>
          <Link className="btn btn-ghost" href="/user">
            💎 Mua Key Premium
          </Link>
          <Link className="btn btn-green" href="/dang-ky">
            🎁 Đăng ký nhận KEY THƯỜNG
          </Link>
        </div>
        <JarChecksum />
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Hỗ trợ:{" "}
          <a href="https://discord.gg/uNDvZ38TC" target="_blank" rel="noreferrer">
            discord.gg/uNDvZ38TC
          </a>
        </p>
      </section>

      <PriceTable />

      <Rating />

      <section className="card" style={{ borderColor: "rgba(255,200,61,.6)", textAlign: "center" }}>
        <h2 style={{ marginTop: 0 }}>🎁 TÀI KHOẢN THÀNH VIÊN — TẶNG KEY BẢN THƯỜNG</h2>
        <p style={{ color: "var(--muted)", maxWidth: 640, margin: "0 auto 14px" }}>
          <b>Đăng ký tài khoản miễn phí</b> — tạo xong là nhận ngay <b>1 KEY BẢN THƯỜNG (FREE) vĩnh viễn</b>, lưu trong
          trang tài khoản, tra cứu được ở mục kiểm tra key phía dưới. Muốn PREMIUM thì mua key tại{" "}
          <Link href="/user">trang Mua Key</Link>.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn btn-gold" href="/dang-ky">
            📝 Đăng ký ngay
          </Link>
          <Link className="btn btn-ghost" href="/dang-nhap">
            🔑 Đăng nhập
          </Link>
        </div>
      </section>

      <KeyCheck />


      <section>
        <h2 style={{ textAlign: "center" }}>🌀 WIKI 9 VÕ HỒN</h2>
        <p style={{ color: "var(--muted)", textAlign: "center", marginTop: -6 }}>
          Đúng nguyên văn trong game — mỗi Võ Hồn có 9 Hồn Kỹ, lĩnh ngộ đủ sẽ mở Võ Hồn Chân Thân.
        </p>
        <div className="grid grid-2">
          {SOULS.map((s) => (
            <article className="card soul-card" key={s.id} style={{ ["--soul-color" as string]: s.color }}>
              <div className="soul-head">
                <img
                  className="soul-thumb"
                  src={`/img/vohon/${s.id}.webp`}
                  alt={`Võ Hồn ${s.name}`}
                  width={380}
                  height={380}
                  loading="lazy"
                />
                <h3 style={{ margin: 0 }}>{s.name}</h3>
                <span className="chip" style={{ marginLeft: "auto", color: s.color, borderColor: s.color }}>
                  tỷ lệ {s.weight}/96
                </span>
              </div>
              <p className="soul-desc">{s.description}</p>
              <div className="soul-meta">
                <span>🛡 Vật chủ động: {s.passiveLabel}</span>
              </div>
              <details className="skill-list">
                <summary>Xem 9 Hồn Kỹ ({s.skills.length})</summary>
                {s.skills.map((k) => (
                  <div className="skill-row" key={k.name}>
                    <span>
                      <b>{k.name}</b>
                      <span style={{ color: "var(--muted)" }}> — {SKILL_LABEL[k.type] || k.type}</span>
                    </span>
                    <span className="meta">
                      {k.damage ? `${k.damage} sát thương · ` : ""}
                      {k.radius ? `bán kính ${k.radius} · ` : ""}
                      {k.duration ? `${k.duration}s · ` : ""}
                      {k.cost} hồn lực · hồi {k.cooldown}s
                    </span>
                  </div>
                ))}
              </details>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>📜 Lệnh trong game</h2>
        <div className="table-wrap">
          <table>
            <tbody>
              {COMMANDS.map((c) => (
                <tr key={c.cmd}>
                  <td>
                    <code>{c.cmd}</code>
                  </td>
                  <td style={{ color: "var(--muted)" }}>{c.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>🚀 Cách cài vào server</h2>
        <ol style={{ color: "var(--muted)" }}>
          <li>
            Tải jar FREE ở nút vàng phía trên (hoặc bản PREMIUM sau khi mua key tại{" "}
            <Link href="/user">trang Mua Key</Link>).
          </li>
          <li>
            Thả file <code>DauLaDaiLuc-...jar</code> vào thư mục <code>plugins/</code> của server (Paper/Spigot 1.17+).
          </li>
          <li>Restart server — vào game gõ <code>/dl thuctinh</code> để thức tỉnh Võ Hồn.</li>
          <li>
            Bản PREMIUM: dán key vào <code>config.yml</code> (<code>licensing.key</code>) hoặc{" "}
            <code>/dl license activate &lt;KEY&gt;</code>. Key kiểm tra <b>OFFLINE</b> — server không cần internet.
          </li>
        </ol>
        <div className="alert alert-warn">
          ⏱️ Key theo ngày (30/90/180/365) hết hạn là Premium tự khóa ngay trong server đang chạy (plugin tự re-check
          mỗi 5 phút). Key <b>LIFETIME hạn 2275</b> dùng được <b>vĩnh viễn</b>.
        </div>
      </section>
    </>
  );
}
