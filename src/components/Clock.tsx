"use client";
import { useEffect, useState } from "react";
import PrayerCountdown from "./PrayerCountdown";
import { schoolWeekOf } from "@/lib/academicCalendar";
import { moonPhase } from "@/lib/moon";
import Emoji from "./Emoji";

interface ClockProps {
  isKumaFolded?: boolean
}

export default function Clock({ isKumaFolded = true }: ClockProps) {
  const [now, setNow] = useState<Date | null>(null);
  const [swOffset, setSwOffset] = useState(0);
  const [moonPhoto, setMoonPhoto] = useState<{ imageUrl: string | null; illumination: number; name: string } | null>(null);

  // Real lunar imagery from NASA's Dial-A-Moon, refreshed hourly
  useEffect(() => {
    const fetchMoon = (): void => {
      fetch("/api/moon")
        .then((r) => r.json() as Promise<{ imageUrl?: string | null; illumination?: number; name?: string; error?: string }>)
        .then((d) => {
          if (!d.error && typeof d.illumination === "number" && d.name) {
            setMoonPhoto({ imageUrl: d.imageUrl ?? null, illumination: d.illumination, name: d.name });
          }
        })
        .catch(() => {
          /* the locally computed phase stays on screen */
        });
    };
    fetchMoon();
    const id = setInterval(fetchMoon, 60 * 60 * 1000);
    return () => { clearInterval(id) };
  }, []);

  // School-week nudge, persisted in dashboard-settings.json
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json() as Promise<{ schoolWeekOffset?: number }>)
      .then((d) => {
        if (typeof d.schoolWeekOffset === "number") setSwOffset(d.schoolWeekOffset);
      })
      .catch(() => {
        /* keep the default of 0 if settings can't be read */
      });
  }, []);

  const adjustSchoolWeek = (delta: number): void => {
    setSwOffset((prev) => {
      const next = prev + delta;
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolWeekOffset: next }),
      }).catch(() => {
        /* the on-screen value still moves; the file write is best-effort */
      });
      return next;
    });
  };

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => { setNow(new Date()) }, 1000);
    return () => { clearInterval(id) };
  }, []);

  if (!now) return <div className="clock-skeleton" />;

  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");

  // ISO-8601 week number: week 1 is the one containing the first Thursday
  const isoWeek = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  };

  // Lecture week straight from the TU/e calendar table (recesses excluded),
  // plus the manual offset
  const school = schoolWeekOf(now);
  const schoolValue = school.value === null ? "—" : String(school.value + swOffset);
  const schoolTitle = [
    school.note,
    school.quartile ? `Quartile ${String(school.quartile)}` : null,
    school.value !== null ? `Calendar week ${String(school.value)}` : null,
    swOffset !== 0 ? `Offset ${swOffset > 0 ? "+" : ""}${String(swOffset)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const locale = process.env.NEXT_PUBLIC_CLOCK_LOCALE ?? "en-US";
  // Composed by part so the order stays "Sunday, 9 Aug" in any locale
  const weekdayStr = now.toLocaleDateString(locale, { weekday: "long" });
  const dayStr = now.toLocaleDateString(locale, { day: "numeric" });
  const monthStr = now.toLocaleDateString(locale, { month: "short" });
  const dateStr = `${weekdayStr}, ${dayStr} ${monthStr}`;

  // Location strip: "Etten-Leur · Europe/Amsterdam · CEST GMT+2"
  const city = process.env.NEXT_PUBLIC_WEATHER_LABEL ?? "";
  const timezone =
    process.env.NEXT_PUBLIC_WEATHER_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzPart = (style: "short" | "shortOffset") =>
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, timeZoneName: style })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  const utcStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const locationStr = [
    city,
    timezone,
    `${tzPart("short")} ${tzPart("shortOffset")}`.trim(),
    `${utcStr} UTC`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const moon = moonPhase(now);
  const moonName = moonPhoto?.name ?? moon.name;
  const moonIllumination = moonPhoto?.illumination ?? moon.illumination;

  // Hijri date in Arabic (Umm al-Qura), but with Latin digits
  const hijriStr = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <div className={`clock-wrap ${isKumaFolded ? 'clock-wrap--folded' : ''}`}>
      {locationStr && <div className="clock-location">{locationStr}</div>}

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

      <div className="clock-date-row">
        <div className="clock-date-col">
          <div className="clock-date">{dateStr}</div>
          <div className="clock-weeks">
          <span className="clock-week">
            W <span className="week-num">{String(isoWeek(now)).padStart(2, "0")}</span>
          </span>
          <span className="clock-week clock-sw" title={schoolTitle || "School week"}>
            <button
              type="button"
              className="sw-step"
              aria-label="Decrease school week"
              onClick={() => {
                adjustSchoolWeek(-1);
              }}
            >
              −
            </button>
            SW <span className="week-num">{schoolValue}</span>
            <button
              type="button"
              className="sw-step"
              aria-label="Increase school week"
              onClick={() => {
                adjustSchoolWeek(1);
              }}
            >
              +
            </button>
          </span>
          </div>
        </div>

        <div
          className="clock-moon"
          title={`${moonName} · ${String(moonIllumination)}% illuminated · day ${moon.age.toFixed(1)} of the lunar month`}
        >
          {moonPhoto?.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="moon-photo" src={moonPhoto.imageUrl} alt={moonName} />
          ) : (
            <Emoji char={moon.icon} size="2.6em" />
          )}
          <span className="moon-illum">{moonIllumination}%</span>
        </div>

        <div className="clock-hijri" lang="ar" dir="rtl">{hijriStr}</div>
      </div>

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
          font-size: clamp(106px, 12.65vw, 172px);
          font-weight: 300;
          letter-spacing: -0.02em;
          color: var(--text-primary);
        }
        .clock-wrap--folded .clock-hm {
          font-size: clamp(119px, 14.3vw, 189px);
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
          font-size: clamp(48px, 5.5vw, 77px);
          font-weight: 300;
          color: var(--text-secondary);
          letter-spacing: 0.02em;
          min-width: 2.2ch;
        }
        .clock-wrap--folded .clock-sec {
          font-size: clamp(57px, 6.38vw, 92px);
        }
        .clock-date {
          font-family: var(--font-sans);
          font-size: clamp(28px, 2.7vw, 38px);
          font-weight: 500;
          color: var(--text-secondary);
          letter-spacing: 0.05em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .clock-wrap--folded .clock-date {
          font-size: clamp(32px, 3.2vw, 46px);
          font-weight: 400;
          color: var(--text-primary);
          letter-spacing: 0.03em;
        }
        .clock-week {
          font-family: var(--font-mono);
          font-weight: 400;
          color: var(--text-muted);
          letter-spacing: 0.06em;
        }
        /* Digits sit slightly brighter than the W / SW prefixes, same weight */
        .week-num {
          font-weight: 400;
          color: var(--text-secondary);
        }
        /* Steppers stay in the layout so the line never shifts on hover */
        .clock-sw {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          white-space: nowrap;
        }
        .sw-step {
          display: none;
          font-family: var(--font-mono);
          font-size: 0.8em;
          line-height: 1;
          padding: 2px 6px;
          border-radius: 5px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-muted);
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .clock-sw:hover .sw-step {
          display: inline-block;
          opacity: 1;
        }
        .sw-step:hover {
          color: #38bdf8;
          border-color: rgba(56, 189, 248, 0.6);
        }
        .clock-date-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          width: 100%;
          min-width: 0;
        }
        .clock-date-col {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex-shrink: 0;
        }
        .clock-weeks {
          /* Spans the date above it: W pinned left, SW pinned right */
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          gap: 16px;
          font-family: var(--font-mono);
          font-size: clamp(21px, 2vw, 29px);
          color: var(--text-muted);
          white-space: nowrap;
        }
        .moon-photo {
          /* Fills the gap between the two dates, capped so the row stays short */
          width: auto;
          height: auto;
          max-width: 100%;
          max-height: clamp(72px, 7vw, 104px);
          border-radius: 50%;
          object-fit: cover;
          /* The render is a disc on black; trim the surrounding frame */
          background: #000;
        }
        .clock-moon {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          flex: 1;
          min-width: 0;
          font-size: clamp(18px, 1.7vw, 26px);
          font-weight: 400;
          color: var(--text-muted);
          letter-spacing: 0.06em;
          line-height: 1;
          white-space: nowrap;
        }
        .moon-illum {
          font-family: var(--font-mono);
          font-size: 15px;
          line-height: 1;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }
        .clock-hijri {
          font-family: var(--font-arabic), serif;
          font-size: clamp(30px, 2.9vw, 42px);
          font-weight: 400;
          color: var(--text-secondary);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .clock-wrap--folded .clock-hijri {
          font-size: clamp(34px, 3.4vw, 50px);
          color: var(--text-primary);
        }
        .clock-location {
          font-size: 15px;
          font-weight: 400;
          color: var(--text-muted);
          letter-spacing: 0.1em;
          line-height: 1;
        }
        .clock-skeleton {
          height: 140px;
        }
      `}</style>
    </div>
  );
}
