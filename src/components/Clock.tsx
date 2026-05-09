"use client";
import { useEffect, useState } from "react";

export default function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => { setNow(new Date()) }, 1000);
    return () => { clearInterval(id) };
  }, []);

  if (!now) return <div className="clock-skeleton" />;

  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");

  const locale = process.env.NEXT_PUBLIC_CLOCK_LOCALE ?? "en-US";
  const dateStr = now.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="clock-wrap">
      <div className="clock-time">
        <span className="clock-hm">
          {h}:{m}
        </span>
        <span className="clock-sep" />
        <span className="clock-sec">{s}</span>
      </div>
      <div className="clock-date">{dateStr}</div>

      <style jsx>{`
        .clock-wrap {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .clock-time {
          display: flex;
          align-items: baseline;
          gap: 10px;
          line-height: 1;
        }
        .clock-hm {
          font-family: var(--font-mono);
          font-size: clamp(72px, 9vw, 128px);
          font-weight: 300;
          letter-spacing: -0.02em;
          color: var(--text-primary);
        }
        .clock-sep {
          display: block;
          width: 1px;
          height: 40px;
          background: var(--border-bright);
          align-self: center;
        }
        .clock-sec {
          font-family: var(--font-mono);
          font-size: clamp(32px, 3.6vw, 52px);
          font-weight: 300;
          color: var(--text-secondary);
          letter-spacing: 0.02em;
          min-width: 2.2ch;
        }
        .clock-date {
          font-family: var(--font-sans);
          font-size: clamp(18px, 1.8vw, 24px);
          font-weight: 400;
          color: var(--text-secondary);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .clock-skeleton {
          height: 140px;
        }
      `}</style>
    </div>
  );
}
