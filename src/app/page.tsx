'use client'
import dynamic from 'next/dynamic'

const Clock = dynamic(() => import('@/components/Clock'), { ssr: false })
const Weather = dynamic(() => import('@/components/Weather'), { ssr: false })
const StatusPanel = dynamic(() => import('@/components/StatusPanel'), { ssr: false })

export default function Dashboard() {
  return (
    <div className="dashboard">

      {/* ── TOP ROW: Clock + Weather ─────────────────────── */}
      <div className="top-row">
        <section className="card card-clock">
          <Clock />
        </section>
        <div className="top-divider" />
        <section className="card card-weather">
          <div className="section-label">{process.env.NEXT_PUBLIC_WEATHER_LABEL ?? 'Weather'}</div>
          <Weather />
        </section>
      </div>

      {/* ── DIVIDER ─────────────────────────────────────── */}
      <div className="mid-divider" />

      {/* ── KUMA GRID ───────────────────────────────────── */}
      <section className="card card-status">
        {/*<div className="section-label">Infrastructure Status</div>*/}
        <StatusPanel />
      </section>

      <style jsx>{`
        .dashboard {
          position: fixed;
          inset: 0;
          background: var(--bg);
          display: flex;
          flex-direction: column;
          padding: 28px 32px 0;
          overflow: hidden;
        }

        /* Top flex row */
        .top-row {
          display: flex;
          flex-direction: row;
          align-items: stretch;
          flex-shrink: 0;
          max-height: 400px;
        }

        .card-clock {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 14px;
          padding-right: 28px;
          flex-shrink: 0;
        }

        .top-divider {
          width: 1px;
          background: var(--border);
          flex-shrink: 0;
          align-self: stretch;
        }

        .card-weather {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding-left: 28px;
          overflow-y: auto;
          min-width: 0;
        }
        .card-weather::-webkit-scrollbar { width: 2px; }
        .card-weather::-webkit-scrollbar-thumb { background: var(--border-bright); }

        /* Horizontal divider between top row and kuma */
        .mid-divider {
          height: 1px;
          background: var(--border);
          margin: 20px 0;
          flex-shrink: 0;
        }

        /* Kuma section fills remaining space — no scroll, everything must fit */
        .card-status {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 14px;
          overflow: hidden;
          min-height: 0;
        }

        /* Section labels */
        .section-label {
          font-size: 15px;
          font-weight: 400;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-muted);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}
