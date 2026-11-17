"use client";

/* Thanh đánh giá plugin — KHÔNG cần đăng nhập Gmail, kéo chấm điểm 1-10 rồi gửi */
import { useEffect, useState } from "react";

export default function Rating() {
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [score, setScore] = useState(10);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/ratings")
      .then((r) => r.json())
      .then((d) => {
        setAvg(d.avg);
        setCount(d.count);
      })
      .catch(() => {});
  }, []);

  const send = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Gửi không thành công");
      setAvg(d.avg);
      setCount(d.count);
      setSent(true);
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>⭐ Đánh giá plugin</h2>
      {avg !== null && (
        <p className="sub" style={{ color: "var(--muted)" }}>
          Trung bình <b style={{ color: "var(--gold)" }}>{avg}/10</b> từ {count} Hồn Sư đánh giá — không cần tài khoản
          Gmail.
        </p>
      )}
      <div style={{ maxWidth: 420 }}>
        <input
          className="rating-slider"
          type="range"
          min={1}
          max={10}
          value={score}
          disabled={busy || sent}
          onChange={(e) => setScore(Number(e.target.value))}
          aria-label="Chấm điểm từ 1 đến 10"
        />
        <div className="stars" aria-hidden>
          {"★".repeat(Math.round(score / 2.5))}
          <span style={{ color: "var(--muted)" }}> {score}/10</span>
        </div>
        {err && <div className="alert alert-err">{err}</div>}
        {sent ? (
          <div className="alert alert-ok">Cảm ơn Hồn Sư! Điểm của ngươi đã vào bảng.</div>
        ) : (
          <button className="btn btn-gold btn-sm" onClick={send} disabled={busy}>
            {busy ? "Đang gửi..." : "Gửi đánh giá"}
          </button>
        )}
      </div>
    </div>
  );
}
