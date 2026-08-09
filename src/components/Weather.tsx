'use client'
import { useEffect, useState } from 'react'
import { wmoToInfo, dayLabel } from './weatherUtils'
import Emoji from './Emoji'

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
        .catch(() => { /* silently ignore polling errors */ })
    }, 15 * 60 * 1000)
    return () => { clearInterval(id) }
  }, [])

  if (error) return <div className="w-err">Weather unavailable</div>
  if (!data) return <div className="w-loading">Loading weather…</div>

  return (
    <div className="w-root">
      <div className="w-days-container">
        {data.daily.time.slice(0, 7).map((d, i) => {
          const isToday = i === 0
          const dateStr = d
          const info = wmoToInfo(data.daily.weather_code[i])
          const max = Math.round(data.daily.temperature_2m_max[i])
          const min = Math.round(data.daily.temperature_2m_min[i])
          const rain = data.daily.precipitation_probability_max[i]

          let apparent = max
          let humidity = 50
          let wind = 12

          if (isToday) {
            apparent = Math.round(data.current.apparent_temperature)
            humidity = data.current.relative_humidity_2m
            wind = Math.round(data.current.wind_speed_10m)
          } else {
            for (let idx = 0; idx < data.hourly.time.length; idx++) {
              if (data.hourly.time[idx].startsWith(dateStr) && data.hourly.time[idx].endsWith('12:00')) {
                apparent = Math.round(data.hourly.temperature_2m[idx])
                break
              }
            }
          }

          const dayHourlySlots: { hour: string; temp: number; code: number }[] = []
          for (let idx = 0; idx < data.hourly.time.length; idx++) {
            const t = data.hourly.time[idx]
            if (t.startsWith(dateStr)) {
              const hourNum = parseInt(t.slice(11, 13), 10)
              if (hourNum % 3 === 0) {
                dayHourlySlots.push({
                  hour: String(hourNum),
                  temp: Math.round(data.hourly.temperature_2m[idx]),
                  code: data.hourly.weather_code[idx],
                })
              }
            }
          }

          return (
            <div key={d} className={`w-day-card ${isToday ? 'w-day-card--today' : ''}`}>
              {/* Left: Big Icon + Day Name + Temp + Label + Meta Specs */}
              <div className="w-day-hero">
                <div className="w-day-icon">
                  <Emoji char={info.icon} />
                </div>
                <div className="w-day-info">
                  <div className="w-day-header">
                    <span className="w-day-name">{dayLabel(d, i)}</span>
                    <div className="w-day-temps">
                      <span className="w-day-max">{max}°</span>
                      <span className="w-day-slash">/</span>
                      <span className="w-day-min">{min}°</span>
                    </div>
                  </div>
                  <div className="w-day-label">{info.label}</div>
                  <div className="w-day-meta">
                    <span>Feels {apparent}°</span>
                    <span>{humidity}% hum</span>
                    <span>{wind} km/h wind</span>
                    {rain > 10 && (
                      <span className="w-rain-badge">
                        <Emoji char="💧" /> {rain}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: In-day hourly breakdown chips */}
              <div className="w-day-hourly-row">
                {dayHourlySlots.map((slot) => (
                  <div key={slot.hour} className="w-hour-slot">
                    <span className="w-hour-label">{slot.hour}</span>
                    <span className="w-hour-icon">
                      <Emoji char={wmoToInfo(slot.code).icon} />
                    </span>
                    <span className="w-hour-temp">{slot.temp}°</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <style jsx>{`
        .w-root {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
          margin: 0;
          padding: 0;
        }
        .w-err, .w-loading {
          font-family: var(--font-mono);
          font-size: 20px;
          color: var(--text-muted);
        }

        .w-days-container {
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: 100%;
          margin: 0;
          padding: 0;
        }

        .w-day-card {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 10px 0;
          margin: 0;
          width: 100%;
          border: none;
          background: transparent;
          box-shadow: none;
          transition: all 0.2s ease;
        }

        .w-day-card--today {
          background: transparent;
          border: none;
          box-shadow: none;
          padding: 16px 0;
          margin: 0 0 20px 0;
          width: 100%;
        }

        .w-day-hero {
          display: flex;
          align-items: center;
          gap: 18px;
          flex-shrink: 0;
          min-width: 290px;
        }

        .w-day-card--today .w-day-hero {
          gap: 22px;
          min-width: 360px;
        }

        .w-day-card--today .w-day-icon {
          font-size: 88px;
          line-height: 1;
          filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5));
        }

        /* Apple's set where it exists (macOS/iOS ship it); Noto elsewhere so a
           Linux/Windows dashboard still gets one consistent pack. */
        .w-day-icon,
        .w-hour-icon {
          /* Only reached if a bundled emoji image is missing */
          font-family: 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
        }

        .w-day-icon {
          font-size: 57px;
          line-height: 1;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
        }

        .w-day-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .w-day-header {
          display: flex;
          align-items: baseline;
          gap: 12px;
        }

        .w-day-name {
          font-family: var(--font-mono);
          font-size: 22px;
          font-weight: 500;
          color: var(--text-primary);
          letter-spacing: 0.04em;
        }

        .w-day-card--today .w-day-name {
          font-size: 33px;
          font-weight: 500;
          color: #ffffff;
          letter-spacing: 0.05em;
        }

        .w-day-temps {
          display: flex;
          align-items: baseline;
          gap: 4px;
          font-family: var(--font-mono);
        }

        .w-day-max {
          font-size: 24px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .w-day-card--today .w-day-max {
          font-size: 35px;
          font-weight: 500;
          color: #ffffff;
        }

        .w-day-slash {
          font-size: 16px;
          color: var(--text-muted);
        }

        .w-day-min {
          font-size: 18px;
          font-weight: 400;
          color: var(--text-muted);
        }

        .w-day-card--today .w-day-min {
          font-size: 22px;
          font-weight: 400;
        }

        .w-day-label {
          font-size: 20px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .w-day-card--today .w-day-label {
          font-size: 24px;
          font-weight: 400;
          color: var(--text-primary);
        }

        /* Stacked so the metrics stay inside the hero column and never run
           under the hourly chips */
        .w-day-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          font-family: var(--font-mono);
          font-size: 15px;
          line-height: 1.35;
          color: var(--text-muted);
        }

        .w-day-card--today .w-day-meta {
          font-size: 18px;
          color: var(--text-secondary);
        }

        .w-rain-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #38bdf8;
          font-family: 'Apple Color Emoji', 'Segoe UI Emoji', var(--font-mono);
          font-size: 20px;
          font-weight: 500;
          background: transparent;
          border: none;
          padding: 0;
          box-shadow: none;
        }

        .w-day-card--today .w-rain-badge {
          font-size: 22px;
        }

        .w-day-hourly-row {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 0;
          justify-content: flex-end;
          /* Never wrap under the hero text — chips shrink instead */
          flex-wrap: nowrap;
          overflow: hidden;
        }

        .w-hour-slot {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          background: transparent;
          border: none;
          padding: 6px 10px;
          min-width: 0;
          flex: 0 1 64px;
        }

        .w-day-card--today .w-hour-slot {
          padding: 10px 16px;
          flex: 0 1 74px;
        }

        .w-hour-label {
          font-family: var(--font-mono);
          font-size: 18px;
          font-weight: 500;
          color: #9ca3af;
        }

        .w-day-card--today .w-hour-label {
          font-size: 20px;
          font-weight: 500;
          color: #cbd5e1;
        }

        .w-hour-icon {
          font-size: 31px;
        }

        .w-day-card--today .w-hour-icon {
          font-size: 35px;
        }

        .w-hour-temp {
          font-family: var(--font-mono);
          font-size: 18px;
          font-weight: 500;
          color: #ffffff;
        }

        .w-day-card--today .w-hour-temp {
          font-size: 20px;
          font-weight: 500;
          color: #ffffff;
        }
      `}</style>
    </div>
  )
}
