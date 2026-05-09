'use client'
import { useEffect, useState } from 'react'
import { wmoToInfo, dayLabel } from './weatherUtils'

interface WeatherData {
  current: {
    temperature_2m: number
    apparent_temperature: number
    weather_code: number
    relative_humidity_2m: number
    wind_speed_10m: number
  }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
  }
  hourly: {
    time: string[]
    temperature_2m: number[]
    weather_code: number[]
  }
}

type WeatherApiResponse = WeatherData | { error: string }

export default function Weather() {
  const [data, setData] = useState<WeatherData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchWeather = (): void => {
      fetch('/api/weather')
        .then(r => r.json() as Promise<WeatherApiResponse>)
        .then(d => {
          if ('error' in d) { setError(true) }
          else { setData(d) }
        })
        .catch(() => { setError(true) })
    }

    fetchWeather()
    const id = setInterval(() => {
      fetch('/api/weather')
        .then(r => r.json() as Promise<WeatherApiResponse>)
        .then(d => { if (!('error' in d)) setData(d) })
        .catch(() => { /* silently ignore polling errors; last data stays displayed */ })
    }, 15 * 60 * 1000)
    return () => { clearInterval(id) }
  }, [])

  if (error) return <div className="w-err">Weather unavailable</div>
  if (!data) return <div className="w-loading">Loading weather…</div>

  const cur = data.current
  const curInfo = wmoToInfo(cur.weather_code)

  const hourlySlots = data.hourly.time
    .slice(0, 24)
    .filter((_, i) => i % 3 === 0)
    .map((t, i) => ({
      hour: t.slice(11, 16),
      temp: Math.round(data.hourly.temperature_2m[i * 3]),
      code: data.hourly.weather_code[i * 3],
    }))

  return (
    <div className="w-root">
      {/* Current + Hourly side by side */}
      <div className="w-top-row">
        <div className="w-current">
          <div className="w-cur-icon">{curInfo.icon}</div>
          <div className="w-cur-info">
            <div className="w-cur-temp">{Math.round(cur.temperature_2m)}°</div>
            <div className="w-cur-label">{curInfo.label}</div>
            <div className="w-cur-meta">
              <span>Feels {Math.round(cur.apparent_temperature)}°</span>
              <span className="w-dot">·</span>
              <span>{cur.relative_humidity_2m}% hum</span>
              <span className="w-dot">·</span>
              <span>{Math.round(cur.wind_speed_10m)} km/h</span>
            </div>
          </div>
        </div>

        <div className="w-hourly">
          {hourlySlots.map(slot => (
            <div key={slot.hour} className="w-hour-slot">
              <span className="w-hour-label">{slot.hour}</span>
              <span className="w-hour-icon">{wmoToInfo(slot.code).icon}</span>
              <span className="w-hour-temp">{slot.temp}°</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly */}
      <div className="w-week">
        {data.daily.time.map((d, i) => {
          const info = wmoToInfo(data.daily.weather_code[i])
          const max = Math.round(data.daily.temperature_2m_max[i])
          const min = Math.round(data.daily.temperature_2m_min[i])
          const rain = data.daily.precipitation_probability_max[i]
          return (
            <div key={d} className={`w-day ${i === 0 ? 'w-day--today' : ''}`}>
              <span className="w-day-name">{dayLabel(d, i)}</span>
              <span className="w-day-icon">{info.icon}</span>
              {rain > 20 && <span className="w-day-rain">{rain}%</span>}
              <span className="w-day-range">
                <span className="w-day-max">{max}°</span>
                <span className="w-day-slash">/</span>
                <span className="w-day-min">{min}°</span>
              </span>
            </div>
          )
        })}
      </div>

      <style jsx>{`
        .w-root { display: flex; flex-direction: column; gap: 16px; width: 100%; }
        .w-err, .w-loading {
          font-family: var(--font-mono);
          font-size: 18px;
          color: var(--text-muted);
        }

        /* Top row: current + hourly side by side */
        .w-top-row {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          gap: 20px;
        }

        /* Current */
        .w-current {
          display: flex;
          align-items: center;
          gap: 18px;
          flex-shrink: 0;
        }
        .w-cur-icon { font-size: 80px; line-height: 1; }
        .w-cur-info { display: flex; flex-direction: column; gap: 4px; }
        .w-cur-temp {
          font-family: var(--font-mono);
          font-size: clamp(64px, 7vw, 88px);
          font-weight: 300;
          color: var(--text-primary);
          line-height: 1;
        }
        .w-cur-label {
          font-size: 26px;
          font-weight: 300;
          color: var(--text-secondary);
        }
        .w-cur-meta {
          display: flex;
          gap: 6px;
          font-size: 20px;
          font-family: var(--font-mono);
          color: var(--text-muted);
          flex-wrap: wrap;
        }
        .w-dot { opacity: 0.4; }

        /* Hourly */
        .w-hourly {
          flex: 1;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-content: flex-start;
          overflow: hidden;
        }
        .w-hour-slot {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 10px 12px;
          min-width: 62px;
        }
        .w-hour-label {
          font-family: var(--font-mono);
          font-size: 17px;
          color: var(--text-muted);
        }
        .w-hour-icon { font-size: 32px; }
        .w-hour-temp {
          font-family: var(--font-mono);
          font-size: 22px;
          font-weight: 400;
          color: var(--text-primary);
        }

        /* Weekly — horizontal row of day cards */
        .w-week {
          display: flex;
          flex-direction: row;
          gap: 6px;
        }
        .w-day {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 8px 6px;
          border-radius: var(--radius-sm);
          background: transparent;
          border: 1px solid transparent;
        }
        .w-day--today {
          background: var(--surface);
          border-color: var(--border);
        }
        .w-day-name {
          font-size: 17px;
          font-weight: 400;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .w-day--today .w-day-name { color: var(--text-primary); }
        .w-day-icon { font-size: 30px; }
        .w-day-rain {
          font-family: var(--font-mono);
          font-size: 16px;
          color: var(--accent);
        }
        .w-day-range {
          font-family: var(--font-mono);
          font-size: 20px;
          display: flex;
          gap: 2px;
          align-items: baseline;
        }
        .w-day-max { color: var(--text-primary); font-weight: 500; }
        .w-day-slash { color: var(--text-muted); }
        .w-day-min { color: var(--text-muted); }
      `}</style>
    </div>
  )
}
