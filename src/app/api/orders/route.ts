/* POST /api/orders — khách tạo đơn mua key (chuyển khoản VietQR hoặc thẻ cào)
   KHÔNG BAO GIỜ tự cấp key ở đây — đơn luôn 'pending' chờ admin duyệt. */
import { NextResponse } from "next/server";
import { q, log, genOrderCode } from "@/lib/db";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    ""
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const packageCode = String(body.package_code || "").trim();
    const buyerName = String(body.buyer_name || "").trim().slice(0, 60);
    const buyerContact = String(body.buyer_contact || "").trim().slice(0, 120);
    const type = String(body.type || "transfer").trim() === "card" ? "card" : "transfer";
    const note = String(body.note || "").trim().slice(0, 300); // thẻ cào: nhà mạng | serial | PIN

    if (!buyerName || !buyerContact) {
      return NextResponse.json({ error: "Thiếu tên hoặc liên hệ của khách" }, { status: 400 });
    }
    if (!["transfer", "card"].includes(type)) {
      return NextResponse.json({ error: "Phương thức không hợp lệ" }, { status: 400 });
    }
    if (type === "card" && !note) {
      return NextResponse.json({ error: "Thẻ cào cần nhập nhà mạng, serial và mã thẻ" }, { status: 400 });
    }

    const pk = await q(`SELECT code, name, days, price_vnd FROM packages WHERE code=$1 AND enabled=1`, [packageCode]);
    if (pk.length === 0) {
      return NextResponse.json({ error: "Gói không tồn tại hoặc đã ngừng bán" }, { status: 400 });
    }
    const pkg = pk[0];

    const code = await genOrderCode();
    await q(
      `INSERT INTO orders (code, type, buyer_name, buyer_contact, package_code, amount_vnd, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [code, type, buyerName, buyerContact, pkg.code, pkg.price_vnd, note || null],
    );
    await log("ORDER_CREATE", `${code} · ${pkg.name} · ${pkg.price_vnd}đ · ${type}`, ipOf(req));

    /* QR VietQR (không cần API key) — admin đổi thông tin ngân hàng trong /admin */
    const st = await q(`SELECT key, value FROM settings WHERE key LIKE 'bank_%'`);
    const bankName = st.find((r) => r.key === "bank_name")?.value || "Vietcombank";
    const bankAccount = st.find((r) => r.key === "bank_account")?.value || "0";
    const bankHolder = st.find((r) => r.key === "bank_holder")?.value || "";
    const qrUrl =
      "https://img.vietqr.io/image/" +
      encodeURIComponent(bankName.replace(/\s+/g, "")) +
      "-" +
      encodeURIComponent(bankAccount) +
      "-compact2.png?amount=" +
      pkg.price_vnd +
      "&addInfo=" +
      encodeURIComponent(code) +
      "&accountName=" +
      encodeURIComponent(bankHolder);

    return NextResponse.json(
      {
        order: {
          code,
          type,
          package_code: pkg.code,
          pkg_name: pkg.name,
          amount_vnd: pkg.price_vnd,
          status: "pending",
          note: note || null,
        },
        payment: { bank_name: bankName, bank_account: bankAccount, bank_holder: bankHolder, qr_url: qrUrl },
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json({ error: "Lỗi tạo đơn", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
