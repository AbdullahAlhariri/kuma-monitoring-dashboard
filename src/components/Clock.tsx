"use client";
import { useEffect, useState } from "react";
import PrayerCountdown from "./PrayerCountdown";

interface ClockProps {
  isKumaFolded?: boolean
}

export default function Clock({ isKumaFolded = true }: ClockProps) {
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
    <div className={`clock-wrap ${isKumaFolded ? 'clock-wrap--folded' : ''}`}>
      <div className="clock-header">
        <div className="clock-time">
          <span className="clock-hm">
            {h}:{m}
          </span>
          <span className="clock-sep" />
          <span className="clock-sec">{s}</span>
        </div>

        <PrayerCountdown now={now} />
      </div>

      <div className="clock-date">{dateStr}</div>

      <style jsx>{`
        .clock-wrap {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
        }
        .clock-wrap--folded {
          gap: 10px;
        }
        .clock-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          gap: 16px;
        }
        .clock-time {
          display: flex;
          align-items: baseline;
          gap: 12px;
          line-height: 1;
          align-self: center;
        }
        .clock-hm {
          font-family: var(--font-mono);
          font-size: clamp(96px, 11.5vw, 156px);
          font-weight: 300;
          letter-spacing: -0.02em;
          color: var(--text-primary);
        }
        .clock-wrap--folded .clock-hm {
          font-size: clamp(108px, 13vw, 172px);
          font-weight: 400;
        }
        .clock-sep {
          display: block;
          width: 2px;
          height: 48px;
          background: var(--border-bright);
          align-self: center;
        }
        .clock-sec {
          font-family: var(--font-mono);
          font-size: clamp(44px, 5vw, 70px);
          font-weight: 300;
          color: var(--text-secondary);
          letter-spacing: 0.02em;
          min-width: 2.2ch;
        }
        .clock-wrap--folded .clock-sec {
          font-size: clamp(52px, 5.8vw, 84px);
        }
        .clock-date {
          font-family: var(--font-sans);
          font-size: clamp(24px, 2.5vw, 34px);
          font-weight: 500;
          color: var(--text-secondary);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .clock-wrap--folded .clock-date {
          font-size: clamp(26px, 2.9vw, 40px);
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: 0.12em;
        }
        .clock-skeleton {
          height: 140px;
        }
      `}</style>
    </div>
  );
}
