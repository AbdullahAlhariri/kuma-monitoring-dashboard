'use client'
import { useEffect, useState } from 'react'

interface PrayerData {
  name: string
  time: string
  iqamah: string
}

interface PrayerApiResponse {
  dateKey: string
  prayers: PrayerData[]
  tomorrowFajr: string
  tomorrowFajrIqamah: string
}

export default function PrayerCountdown({ now }: { now: Date }) {
  const [data, setData] = useState<PrayerApiResponse | null>(null)

  useEffect(() => {
    const fetchPrayers = (): void => {
      fetch('/api/prayer-times')
        .then((r) => r.json() as Promise<PrayerApiResponse | { error: string }>)
        .then((d) => {
          if (!('error' in d)) {
            setData(d)
          }
        })
        .catch(() => {
          /* silently ignore fetch errors */
        })
    }

    fetchPrayers()
    const id = setInterval(fetchPrayers, 30 * 60 * 1000)
    return () => {
      clearInterval(id)
    }
  }, [])

  if (!data?.prayers || data.prayers.length === 0) {
    return null
  }

  const nowMs = now.getTime()

  let selectedPrayer: PrayerData | null = null
  let isIqamahPhase = false
  let targetTimeMs = 0

  for (const p of data.prayers) {
    const [azH, azM] = p.time.split(':').map(Number)
    const [iqH, iqM] = p.iqamah.split(':').map(Number)

    const azanDate = new Date(now)
    azanDate.setHours(azH, azM, 0, 0)

    const iqamahDate = new Date(now)
    iqamahDate.setHours(iqH, iqM, 0, 0)

    // Phase 1: Between Azan and Iqamah (Time after Azan till actual Iqamah prayer!)
    if (nowMs >= azanDate.getTime() && nowMs < iqamahDate.getTime()) {
      selectedPrayer = p
      isIqamahPhase = true
      targetTimeMs = iqamahDate.getTime()
      break
    }

    // Phase 2: Before Azan
    if (nowMs < azanDate.getTime()) {
      selectedPrayer = p
      isIqamahPhase = false
      targetTimeMs = azanDate.getTime()
      break
    }
  }

  // If all prayers today have passed, target Tomorrow's Fajr
  if (!selectedPrayer) {
    const [tmH, tmM] = data.tomorrowFajr.split(':').map(Number)
    const tmAzanDate = new Date(now)
    tmAzanDate.setDate(now.getDate() + 1)
    tmAzanDate.setHours(tmH, tmM, 0, 0)

    selectedPrayer = {
      name: 'Fajr',
      time: data.tomorrowFajr,
      iqamah: data.tomorrowFajrIqamah,
    }
    isIqamahPhase = false
    targetTimeMs = tmAzanDate.getTime()
  }

  const diffMs = Math.max(0, targetTimeMs - nowMs)
  const totalSecs = Math.floor(diffMs / 1000)
  const hrs = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60

  let countdownText = ''
  let sizeClass = 'prayer-countdown--hrs'
  const secsStr = String(secs).padStart(2, '0')
  if (hrs > 0) {
    const hrsStr = String(hrs)
    const minsStr = String(mins).padStart(2, '0')
    countdownText = `${hrsStr}:${minsStr}:${secsStr}`
    sizeClass = 'prayer-countdown--hrs'
  } else if (mins > 0) {
    const minsStr = String(mins)
    countdownText = `${minsStr}:${secsStr}`
    sizeClass = 'prayer-countdown--mins'
  } else {
    countdownText = secsStr
    sizeClass = 'prayer-countdown--secs'
  }

  return (
    <div className={`prayer-widget ${isIqamahPhase ? 'prayer-widget--iqamah' : ''}`}>
      <div className="prayer-header">
        <span className="prayer-name">{selectedPrayer.name}</span>
      </div>
      <div className={`prayer-countdown ${sizeClass}`}>{countdownText}</div>
      <div className="prayer-target">
        <span className="prayer-time-green">{selectedPrayer.time}</span>
        <span className="prayer-sep">·</span>
        <span className="prayer-time-red">{selectedPrayer.iqamah}</span>
      </div>

      <style jsx>{`
        .prayer-widget {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: center;
          padding: 0;
          margin: auto 0 auto auto;
          background: transparent;
          border: none;
          box-shadow: none;
          gap: 4px;
          flex-shrink: 0;
          align-self: center;
          transition: all 0.2s ease;
        }

        .prayer-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 36px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .prayer-name {
          color: #ffffff;
        }

        .prayer-countdown {
          font-family: var(--font-mono);
          font-weight: 800;
          color: #22c55e;
          letter-spacing: 0.01em;
          line-height: 1;
          transition: font-size 0.2s ease;
        }

        .prayer-countdown--hrs {
          font-size: 76px;
        }

        .prayer-countdown--mins {
          font-size: 104px;
        }

        .prayer-countdown--secs {
          font-size: 136px;
        }

        .prayer-target {
          display: flex;
          align-items: center;
          font-family: var(--font-mono);
          font-size: 26px;
        }

        .prayer-time-green {
          color: #22c55e;
          font-weight: 700;
        }

        .prayer-time-red {
          color: #ef4444;
          font-weight: 700;
        }

        .prayer-sep {
          margin: 0 8px;
          opacity: 0.4;
          color: var(--text-muted);
        }

        /* Iqamah Phase (Time after Azan till actual Iqamah prayer): Bright Red Countdown */
        .prayer-widget--iqamah .prayer-countdown {
          color: #ef4444;
        }
      `}</style>
    </div>
  )
}
