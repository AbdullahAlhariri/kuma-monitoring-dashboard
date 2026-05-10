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

export default function StatusPanel() {
  const [data, setData] = useState<KumaData | null>(null)
  const [error, setError] = useState(false)
  const [now, setNow] = useState(Date.now())
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sirenRef = useRef<{ osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null>(null)
  const prevDegradedRef = useRef(false)

  // Unlock AudioContext after first user gesture (browser autoplay policy)
  useEffect(() => {
    const unlock = () => { audioCtxRef.current?.resume() }
    document.addEventListener('click', unlock)
    document.addEventListener('keydown', unlock)
    return () => { document.removeEventListener('click', unlock); document.removeEventListener('keydown', unlock) }
  }, [])

  // Start/stop siren on degraded state transitions
  useEffect(() => {
    if (!data) return
    const isDegraded = !data.monitors.every(m => m.status === 1)

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
        ctx.resume()
      } catch (_) {}
    } else if (!isDegraded && prevDegradedRef.current && sirenRef.current && audioCtxRef.current) {
      // Fade out over 0.8 s then stop
      const { osc, lfo, gain } = sirenRef.current
      const ctx = audioCtxRef.current
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8)
      setTimeout(() => { try { osc.stop(); lfo.stop() } catch (_) {} }, 850)
      sirenRef.current = null
    }

    prevDegradedRef.current = isDegraded
  }, [data])

  // Cleanup siren on unmount
  useEffect(() => {
    return () => {
      if (sirenRef.current) {
        try { sirenRef.current.osc.stop(); sirenRef.current.lfo.stop() } catch (_) {}
        sirenRef.current = null
      }
      audioCtxRef.current?.close()
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

  const allUp = data.monitors.every(m => m.status === 1)
  const anyDown = data.monitors.some(m => m.status === 0)

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
        <span className="s-last-updated" title={data.fetchedAt}>
          fetched {timeAgo(data.fetchedAt, now)}
        </span>
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
