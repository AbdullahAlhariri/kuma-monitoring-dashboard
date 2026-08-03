'use client'
import { useEffect, useRef, useState } from 'react'

interface Monitor {
  id: number
  name: string
  group: string
  status: number  // 0=down, 1=up, 2=pending, 3=maintenance, -1=unknown
  msg: string
  ping: number | null
  uptime24: number | null
  checkedAt: string | null
}

interface KumaData {
  title: string
  monitors: Monitor[]
  fetchedAt: string
}

type KumaApiResponse = KumaData | { error: string }

const STATUS_MAP: Record<number, { label: string; color: string; dot: string }> = {
  1:  { label: 'Up',          color: 'var(--up)',         dot: '#22c55e' },
  0:  { label: 'Down',        color: 'var(--down)',       dot: '#ef4444' },
  2:  { label: 'Pending',     color: 'var(--pending)',    dot: '#f59e0b' },
  3:  { label: 'Maintenance', color: 'var(--pending)',    dot: '#f59e0b' },
  [-1]: { label: 'Unknown',   color: 'var(--pending)',    dot: '#f59e0b' },
}

function timeAgo(timeStr: string, now: number): string {
  const d = new Date(timeStr.includes('T') ? timeStr : timeStr.replace(' ', 'T'))
  const sec = Math.floor((now - d.getTime()) / 1000)
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  return `${Math.floor(min / 60)}h ago`
}

interface StatusPanelProps {
  onFoldChange?: (isFolded: boolean) => void
}

export default function StatusPanel({ onFoldChange }: StatusPanelProps = {}) {
  const [data, setData] = useState<KumaData | null>(null)
  const [error, setError] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [userExpanded, setUserExpanded] = useState(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const sirenRef = useRef<{ osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null>(null)
  const prevDegradedRef = useRef(false)

  // Unlock AudioContext after first user gesture (browser autoplay policy)
  useEffect(() => {
    const unlock = () => { void audioCtxRef.current?.resume() }
    document.addEventListener('click', unlock)
    document.addEventListener('keydown', unlock)
    return () => { document.removeEventListener('click', unlock); document.removeEventListener('keydown', unlock) }
  }, [])

  // Start/stop siren on degraded state transitions & handle auto un-collapse / auto collapse
  const prevAllUpRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (!data) return
    const allUp = data.monitors.every(m => m.status === 1)
    const isDegraded = !allUp

    // Handle auto un-collapse on outage & auto collapse on recovery
    if (prevAllUpRef.current !== null) {
      if (!allUp && prevAllUpRef.current) {
        // Outage detected: Auto un-collapse to show degraded monitors
        setUserExpanded(true)
      } else if (allUp && !prevAllUpRef.current) {
        // All systems recovered: Auto collapse back into folded status bar
        setUserExpanded(false)
      }
    }
    prevAllUpRef.current = allUp

    if (isDegraded && !prevDegradedRef.current) {
      try {
        const ctx = audioCtxRef.current ?? new AudioContext()
        audioCtxRef.current = ctx

        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = 500

        // LFO gives the wailing sweep: 500 Hz ± 160 Hz at 0.5 Hz
        const lfo = ctx.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = 0.5
        const lfoGain = ctx.createGain()
        lfoGain.gain.value = 160
        lfo.connect(lfoGain)
        lfoGain.connect(osc.frequency)

        const gain = ctx.createGain()
        gain.gain.value = 0.06
        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start()
        lfo.start()
        sirenRef.current = { osc, lfo, gain }
        void ctx.resume()
      } catch {}
    } else if (!isDegraded && prevDegradedRef.current && sirenRef.current && audioCtxRef.current) {
      // Fade out over 0.8 s then stop
      const { osc, lfo, gain } = sirenRef.current
      const ctx = audioCtxRef.current
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8)
      setTimeout(() => { try { osc.stop(); lfo.stop() } catch {} }, 850)
      sirenRef.current = null
    }

    prevDegradedRef.current = isDegraded
  }, [data])

  // Cleanup siren on unmount
  useEffect(() => {
    return () => {
      if (sirenRef.current) {
        try { sirenRef.current.osc.stop(); sirenRef.current.lfo.stop() } catch {}
        sirenRef.current = null
      }
      void audioCtxRef.current?.close()
    }
  }, [])

  useEffect(() => {
    const fetchData = (): void => {
      fetch('/api/kuma')
        .then(r => r.json() as Promise<KumaApiResponse>)
        .then(d => {
          if ('error' in d) setError(true)
          else { setData(d); setError(false) }
        })
        .catch(() => { setError(true) })
    }

    fetchData()
    const poll = setInterval(fetchData, 15_000)
    const ticker = setInterval(() => { setNow(Date.now()) }, 1000)
    return () => { clearInterval(poll); clearInterval(ticker) }
  }, [])

  const allUp = data ? data.monitors.every(m => m.status === 1) : true
  const anyDown = data ? data.monitors.some(m => m.status === 0) : false
  const isCollapsed = allUp && !userExpanded

  useEffect(() => {
    onFoldChange?.(isCollapsed)
  }, [isCollapsed, onFoldChange])

  if (error) return (
    <div className="s-err">
      <span>●</span> Status unreachable
    </div>
  )
  if (!data) return <div className="s-loading">Connecting to status…</div>

  const groups: Record<string, Monitor[]> = {}
  for (const m of data.monitors) {
    if (!Object.hasOwn(groups, m.group)) groups[m.group] = []
    groups[m.group].push(m)
  }

  if (isCollapsed) {
    const upCount = data.monitors.filter(m => m.status === 1).length
    const totalCount = data.monitors.length
    return (
      <div
        className="s-collapsed-bar"
        onClick={() => {
          setUserExpanded(true)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setUserExpanded(true)
          }
        }}
        title="All systems operational. Click to expand full status view."
      >
        <div className="s-collapsed-left">
          <span className="s-dot-pulse" />
          <span className="s-collapsed-title">
            <strong>({upCount}/{totalCount} UP)</strong>
          </span>
        </div>

        <div className="s-collapsed-groups">
          {Object.entries(groups).map(([group, monitors]) => {
            const groupUp = monitors.filter(m => m.status === 1).length
            const groupTotal = monitors.length
            const isGroupAllUp = groupUp === groupTotal
            return (
              <div key={group} className="s-collapsed-group-chip">
                <span className="s-group-chip-name">{group}</span>
                <span
                  className="s-group-chip-count"
                  style={{ color: isGroupAllUp ? '#22c55e' : '#ef4444' }}
                >
                  {groupUp}/{groupTotal}
                </span>
              </div>
            )
          })}
        </div>

        <div className="s-collapsed-right">
          <span className="s-last-updated" title={data.fetchedAt}>
            fetched {timeAgo(data.fetchedAt, now)}
          </span>
          <button
            type="button"
            className="s-expand-btn"
            onClick={(e) => {
              e.stopPropagation()
              setUserExpanded(true)
            }}
          >
            Expand View ▲
          </button>
        </div>

        <style jsx>{`
          .s-collapsed-bar {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 24px;
            padding: 16px 24px;
            border-radius: var(--radius-sm);
            background: var(--surface);
            border: 1px solid rgba(34, 197, 94, 0.4);
            box-shadow: 0 0 20px rgba(34, 197, 94, 0.1);
            width: 100%;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
          }

          .s-collapsed-bar:hover {
            background: var(--surface-hover);
            border-color: rgba(34, 197, 94, 0.7);
            box-shadow: 0 0 28px rgba(34, 197, 94, 0.18);
          }

          .s-collapsed-left {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-shrink: 0;
          }

          .s-dot-pulse {
            width: 11px;
            height: 11px;
            border-radius: 50%;
            background: #22c55e;
            box-shadow: 0 0 12px #22c55e;
            animation: pulse-glow 2s ease-in-out infinite;
          }

          @keyframes pulse-glow {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.25); opacity: 0.6; }
          }

          .s-collapsed-title strong {
            font-family: var(--font-mono);
            color: #22c55e;
            font-size: 20px;
            letter-spacing: 0.02em;
          }

          .s-collapsed-groups {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            flex: 1;
            min-width: 0;
            overflow-x: auto;
            padding: 2px 0;
          }

          .s-collapsed-groups::-webkit-scrollbar {
            display: none;
          }

          .s-collapsed-group-chip {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid var(--border-bright);
            flex-shrink: 0;
          }

          .s-group-chip-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .s-group-chip-count {
            font-family: var(--font-mono);
            font-size: 16px;
            font-weight: 700;
          }

          .s-collapsed-right {
            display: flex;
            align-items: center;
            gap: 16px;
            flex-shrink: 0;
          }

          .s-last-updated {
            font-family: var(--font-mono);
            font-size: 15px;
            color: var(--text-secondary);
          }

          .s-expand-btn {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid var(--border-bright);
            color: var(--text-primary);
            padding: 6px 16px;
            border-radius: var(--radius-sm);
            font-family: var(--font-mono);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .s-expand-btn:hover {
            background: rgba(255, 255, 255, 0.16);
            border-color: #fff;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="s-root">
      {!allUp && (
        <div className="s-degraded-overlay">
          DEGRADED
        </div>
      )}
      <div className="s-header">
        <div className="s-overall">
          <div
            className="s-overall-dot"
            style={{ background: anyDown ? 'var(--down)' : allUp ? 'var(--up)' : 'var(--pending)' }}
          />
          <span className="s-overall-label">
            {anyDown ? 'Outage detected' : allUp ? 'All systems operational' : 'Partial degradation'}
          </span>
        </div>
        <div className="s-header-right">
          <span className="s-last-updated" title={data.fetchedAt}>
            fetched {timeAgo(data.fetchedAt, now)}
          </span>
          {allUp && (
            <button
              type="button"
              className="s-collapse-btn"
              onClick={() => {
                setUserExpanded(false)
              }}
            >
              Collapse ▼
            </button>
          )}
        </div>
      </div>

      <div className="s-groups">
        {Object.entries(groups).map(([group, monitors]) => {
          const upCount = monitors.filter(m => m.status === 1).length
          const countColor = upCount === monitors.length ? 'var(--up)' : upCount === 0 ? 'var(--down)' : 'var(--pending)'
          return (
          <div key={group} className="s-group">
            <div className="s-group-name">
              <span>{group}</span>
              <span className="s-group-count" style={{ color: countColor }}>{upCount}/{monitors.length}</span>
            </div>
            <div className="s-monitors">
              {monitors.map(m => {
                const s = STATUS_MAP[m.status] ?? STATUS_MAP[-1]
                return (
                  <div key={m.id} className="s-monitor">
                    <div className="s-monitor-top">
                      <span
                        className="s-dot"
                        style={{ background: s.dot, boxShadow: m.status === 1 ? `0 0 6px ${s.dot}66` : 'none' }}
                      />
                      <span className="s-monitor-name">{m.name}</span>
                      <span className="s-status-label" style={{ color: s.color }}>{s.label}</span>
                    </div>
                    <div className="s-monitor-bottom">
                      {m.ping != null && <span className="s-ping">{m.ping}ms</span>}
                      {m.checkedAt && <span className="s-checked">{timeAgo(m.checkedAt, now)}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )})}
      </div>

      <style jsx>{`
        .s-root { display: flex; flex-direction: column; gap: 12px; width: 100%; flex: 1; min-height: 0; }

        .s-degraded-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          pointer-events: none;
          font-family: var(--font-mono);
          font-size: clamp(72px, 12vw, 160px);
          font-weight: 700;
          color: #ef4444;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          animation: degrade-flash 0.8s ease-in-out infinite;
        }
        @keyframes degrade-flash {
          0%, 100% { opacity: 1; text-shadow: 0 0 40px #ef4444, 0 0 80px #ef444466; }
          50%       { opacity: 0.1; text-shadow: none; }
        }

        .s-err, .s-loading {
          font-family: var(--font-mono);
          font-size: 17px;
          color: var(--text-muted);
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .s-err span { color: var(--down); }

        .s-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .s-overall { display: flex; align-items: center; gap: 8px; }
        .s-header-right { display: flex; align-items: center; gap: 14px; }
        .s-overall-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          animation: pulse 2.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
        .s-overall-label {
          font-size: 19px;
          font-weight: 400;
          color: var(--text-secondary);
          letter-spacing: 0.04em;
        }
        .s-last-updated {
          font-family: var(--font-mono);
          font-size: 17px;
          color: var(--text-secondary);
        }
        .s-collapse-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--border);
          color: var(--text-primary);
          padding: 4px 12px;
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .s-collapse-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: var(--border-bright);
        }

        .s-groups {
          display: flex;
          flex-direction: row;
          gap: 12px;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding-bottom: 16px;
          align-items: flex-start;
        }
        .s-groups::-webkit-scrollbar { height: 2px; }
        .s-groups::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 2px; }

        .s-group {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .s-group-name {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          font-size: 17px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-primary);
          margin-bottom: 4px;
          padding-bottom: 6px;
          border-bottom: 1px solid var(--border-bright);
        }
        .s-group-count {
          font-family: var(--font-mono);
          font-size: 19px;
          font-weight: 700;
          letter-spacing: 0;
          flex-shrink: 0;
        }

        .s-monitors {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .s-monitor {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          background: var(--surface);
          border: 1px solid var(--border);
          min-width: 0;
          overflow: hidden;
        }
        .s-monitor-top {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .s-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .s-monitor-name {
          flex: 1;
          font-size: 17px;
          font-weight: 400;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .s-status-label {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          flex-shrink: 0;
        }
        .s-monitor-bottom {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-left: 18px;
        }
        .s-ping {
          font-family: var(--font-mono);
          font-size: 15px;
          color: var(--text-secondary);
        }
        .s-checked {
          font-family: var(--font-mono);
          font-size: 15px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  )
}
