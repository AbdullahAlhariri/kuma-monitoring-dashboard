'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'

const Clock = dynamic(() => import('@/components/Clock'), { ssr: false })
const Weather = dynamic(() => import('@/components/Weather'), { ssr: false })
const StatusPanel = dynamic(() => import('@/components/StatusPanel'), { ssr: false })
const MarketTicker = dynamic(() => import('@/components/MarketTicker'), { ssr: false })
const Habits = dynamic(() => import('@/components/Habits'), { ssr: false })

export default function Dashboard() {
  const [isKumaFolded, setIsKumaFolded] = useState(true)

  return (
    <div className="dashboard">
      {/* ── TOP SECTION: Left Column (Clock + Weather stacked) & Right Column (Habits) ── */}
      <div className="top-row">
        {/* Left Column: Stacked Clock on top of Weather */}
        <div className="left-stack">
          <section className="card card-clock">
            <Clock isKumaFolded={isKumaFolded} />
          </section>

          <div className="horizontal-divider" />

          <section className="card card-weather">
            <Weather />
          </section>
        </div>

        <div className="vertical-divider" />

        {/* Right Column: Habits Panel */}
        <section className="card card-habits">
          <Habits isKumaFolded={isKumaFolded} />
        </section>
      </div>

      {/* ── DIVIDER ─────────────────────────────────────── */}
      <div className="mid-divider" />

      <footer className={`bottom-row${isKumaFolded ? '' : ' status-expanded'}`}>
        <section className="card card-status" aria-label="Kuma status">
          <StatusPanel onFoldChange={setIsKumaFolded} />
        </section>
        {isKumaFolded && <MarketTicker />}
      </footer>

      <style jsx>{`
        .dashboard {
          position: fixed;
          inset: 0;
          background: var(--bg);
          display: flex;
          flex-direction: column;
          padding: 20px 24px;
          overflow: hidden;
        }

        /* Top flex row fills available space */
        .top-row {
          display: flex;
          flex-direction: row;
          align-items: stretch;
          flex: 1;
          min-height: 0;
          gap: 0;
        }

        /* Left Column: Stacked Clock & Weather with clean gap */
        .left-stack {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          padding-right: 0;
          gap: 18px;
        }

        .card-clock {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 12px;
          flex-shrink: 0;
          padding: 6px 0 10px 0;
        }

        .horizontal-divider {
          height: 1px;
          background: var(--border);
          flex-shrink: 0;
          width: 100%;
          margin: 4px 0;
        }

        .card-weather {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 14px;
          overflow-y: auto;
          min-width: 0;
        }

        /* Scrolls, but the bar itself stays out of sight */
        .card-weather {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .card-weather::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }

        .vertical-divider {
          width: 1px;
          background: var(--border);
          flex-shrink: 0;
          align-self: stretch;
        }

        .card-habits {
          flex: 1.35;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-left: 24px;
          overflow: hidden;
          min-width: 0;
        }

        /* Horizontal divider between top row and kuma */
        .mid-divider {
          height: 1px;
          background: var(--border);
          margin: 14px 0;
          flex-shrink: 0;
        }

        /* Kuma section shrinks or expands based on status */
        .bottom-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 3fr);
          align-items: center;
          gap: 16px;
          flex-shrink: 0;
          min-height: 64px;
        }

        .bottom-row.status-expanded { grid-template-columns: minmax(0, 1fr); }

        .card-status {
          container-type: inline-size;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-height: 0;
          min-width: 0;
        }

        @media (max-width: 760px) {
          .bottom-row { grid-template-columns: minmax(0, 1fr); gap: 8px; }
        }
      `}</style>
    </div>
  )
}
