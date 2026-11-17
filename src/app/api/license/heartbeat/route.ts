/* POST /api/license/heartbeat — plugin gọi định kỳ 10–30 phút (kill switch)
   Body: { ticket, hwid, nonce, tm?, wm? }
     • tm  (v3.0.1): telemetry vô hại plugin gửi kèm —
           "jv|agent|debug|classesLoaded|tPrint|mPrint"
           (phiên bản java, số agent, cờ debug, số class đã nạp, 2 vân tay
           hash của T.class/M.class trong jar đang chạy)
     • wm  (v3.0.1): watermark theo key plugin nhận từ vé
   • Thẩm định chữ ký + tuổi thọ vé ngắn hạn (15–60 phút) → vé quá hạn
     trả TICKET_HET_HAN để plugin tự kích hoạt lại lấy vé mới.
   • Vé hợp lệ → tra license còn active không:
       revoked / hết hạn  → KEY_DA_THU_HOI / KEY_HET_HAN (plugin XÓA vé local + về Free)
       sai ID server      → KEY_GAN_MAY_KHAC
   • v3.0.1 TELEMETRY (TẤT CẢ ÂM THẦM — response KHÔNG ĐỔI để kẻ can
     thiệp không biết mình đã bị phát hiện):
       - ghi license_telemetry để tra cứu sau;
       - wm sai so với license → nghi vấn chia sẻ key → licenses.suspicious;
       - vân tay T/M lệch DAULA_BUILD_HASHES → nghi vấn jar bị vá → suspicious;
       - agent/debug bất thường → chỉ ghi, không đánh dấu ngay (tránh nhầm
         server hợp lệ đang chạy profiler). Dồn dữ liệu, quyết định sau.
   • v3.15.5 — HỢP ĐỒNG HTTP CHO PLUGIN: MỌI từ chối LOGIC license (vé
     thiếu/sai, license không tồn tại/thu hồi/hết hạn, sai ID server,
     thiếu trường...) đều trả HTTP **200** + body {"ok":false,"reason":...}
     (deny() đã trả 200 sẵn — chỗ duy nhất còn 400 là TICKET_TRONG, đã
     đổi thành 200). HTTP client của plugin coi mọi status ≥400 = "mất
     kết nối" → admin thấy sai lý do. Lỗi HẠ TẦNG (DB...) vẫn giữ 500. */
import { NextResponse } from "next/server";
import { q, log } from "@/lib/db";
import { isExpired } from "@/lib/keys";
import {
  verifySession, signSession, rsaSignSession, isTicketStale, premiumBlobB64,
  SESSION_MINUTES, GRACE_HOURS, buildHashes, licenseClassHashes,
} from "@/lib/license-server";

export const dynamic = "force-dynamic";

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
}

const LIFETIME = "2275-12-31";

async function markSuspicious(licId: number, why: string) {
  try {
    await q(`UPDATE licenses SET suspicious = true WHERE id=$1 AND suspicious = false`, [licId]);
    await log("LICENSE_SUSPICIOUS", `lic#${licId} · ${why}`, "");
  } catch {
    /* không bao giờ để telemetry làm hỏng heartbeat */
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ticket = String(body.ticket || "").trim();
    const hwid = String(body.hwid || "").trim().slice(0, 40);
    const tm = String(body.tm || "").trim().slice(0, 300);
    const wmIn = Number(body.wm ?? 0);
    /* v3.15.5 — thiếu trường trả 200 (hợp đồng plugin: status ≥400 = mất kết nối) */
    if (!ticket) return NextResponse.json({ ok: false, reason: "TICKET_TRONG" }, { status: 200 });

    const deny = async (reason: string) => {
      await log("LICENSE_HEARTBEAT_DENY", reason + " · " + ticket.slice(0, 30), ipOf(req));
      return NextResponse.json({ ok: false, reason });
    };

    /* vé có dấu "." → thử thẩm định Ed25519; chữ ký sai = rác/key lạ → chặn */
    if (!ticket.includes(".")) return deny("TICKET_KHONG_HOP_LE");
    const s = verifySession(ticket);
    if (!s) return deny("TICKET_KHONG_HOP_LE");

    /* 1) license còn sống không — KILL SWITCH ưu tiên cao nhất */
    let expiry = s.e;
    let boundServerId: string | null = null;
    let licRow: Record<string, unknown> | null = null;
    if (s.l > 0) {
      const lic = await q(`SELECT * FROM licenses WHERE id=$1`, [s.l]);
      if (lic.length === 0) return deny("KEY_KHONG_TON_TAI");
      licRow = lic[0];
      if (lic[0].status === "revoked") return deny("KEY_DA_THU_HOI");
      expiry = String(lic[0].expires_at).slice(0, 10);
      boundServerId = lic[0].server_id ?? lic[0].fingerprint ?? null;
    }
    if (expiry !== LIFETIME && isExpired(expiry)) return deny("KEY_HET_HAN");

    /* 2) vé quá tuổi thọ ngắn hạn (15–60 phút) → plugin tự kích hoạt lại */
    if (isTicketStale(s)) return deny("TICKET_HET_HAN");

    /* 3) máy: vé phải khớp hwid gửi kèm, và khớp server_id đã bind trong DB */
    if (hwid && s.f && hwid !== s.f) return deny("KEY_GAN_MAY_KHAC");
    if (boundServerId && s.f && boundServerId !== s.f) return deny("KEY_GAN_MAY_KHAC");

    /* 4) v3.0.1 — TELEMETRY ÂM THẦM: ghi + đối chiếu, response giữ nguyên */
    if (s.l > 0 && licRow) {
      const licWm = Number((licRow as Record<string, unknown>).wm ?? 0);
      let flags: string[] = [];
      if (tm) {
        const parts = tm.split("|");
        const tPrint = parts[4] || "";
        const mPrint = parts[5] || "";
        const licPrint = parts[6] || ""; /* v3.2 — lp: 5 vân tay class license */
        const agentN = Number(parts[1] ?? 0);
        const dbg = parts[2] === "1";
        const expect = buildHashes();
        if (expect.t && tPrint && tPrint !== "-" && tPrint !== expect.t.slice(0, 16)) {
          flags.push("T_HASH_LECH");
        }
        if (expect.m && mPrint && mPrint !== "-" && mPrint !== expect.m.slice(0, 16)) {
          flags.push("M_HASH_LECH");
        }
        /* v3.2 — vân tay 5 class license lệch build → jar bị vá class lõi */
        const bcEnv = licenseClassHashes();
        if (bcEnv && licPrint && licPrint !== "-") {
          const want = bcEnv.split(",").map((x) => (x.split(":")[1] || "").slice(0, 16));
          const got = licPrint.split(",");
          const lech = want.some((w, i) => w && got[i] && got[i] !== "-" && got[i] !== w);
          if (lech) flags.push("LIC_CLASS_LECH");
        }
        if (agentN > 0) flags.push("AGENT_" + agentN); /* chỉ ghi — profiler hợp lệ có thể dính */
        if (dbg) flags.push("DEBUG");
      }
      const wmMatch: boolean | null =
        wmIn > 0 ? (licWm > 0 ? wmIn === licWm : null) : null;
      if (wmMatch === false) flags.push("WM_SAI(" + wmIn + "≠" + licWm + ")");
      try {
        await q(
          `INSERT INTO license_telemetry (license_id, hwid, tm, wm, wm_match, flags, ip)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [s.l, hwid, tm.slice(0, 300), wmIn, wmMatch, flags.join(",").slice(0, 200), ipOf(req)],
        );
      } catch {
        /* bảng chưa có (chưa migrate) → bỏ qua */
      }
      if (wmMatch === false) {
        await markSuspicious(s.l, "wm heartbeat sai — khả năng chia sẻ key / vé chép tay");
      }
      if (flags.includes("T_HASH_LECH") || flags.includes("M_HASH_LECH") || flags.includes("LIC_CLASS_LECH")) {
        await markSuspicious(s.l, "vân tay T/M/class license lệch build — jar đã bị sửa");
      }
    }

    const session = signSession({
      l: s.l,
      n: s.n,
      e: expiry,
      f: s.f,
      s: Date.now(),
      d: SESSION_MINUTES,
      g: GRACE_HOURS,
      pb: premiumBlobB64(),
      w: s.w,
      v: 3,
    });
    /* v3.2 — bc = hash BUILD class license; plugin re-hash runtime và so ngầm */
    const bc = licenseClassHashes();
    return NextResponse.json({
      ok: true, session, rs: rsaSignSession(session), expires_at: expiry,
      lifetime: expiry === LIFETIME,
      ticket_minutes: SESSION_MINUTES, grace_hours: GRACE_HOURS,
      ...(bc ? { bc } : {}),
    });
  } catch (e) {
    /* v3.15.5 — lỗi HẠ TẦNG (DB...) giữ 500: plugin coi như mất kết nối là đúng */
    return NextResponse.json(
      { ok: false, reason: "LOI_SERVER", detail: String(e).slice(0, 200) },
      { status: 500 },
    );
  }
}
