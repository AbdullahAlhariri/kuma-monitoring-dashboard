'use client'

import { useEffect, useState } from 'react'
import { SENTIMENT_INDICES, SENTIMENT_SOURCES, type SentimentReading, type SentimentResponse } from '@/lib/sentiment'

const vixFormat = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const refreshInterval = 5 * 60_000

export default function FearIndices() {
  const [readings, setReadings] = useState<SentimentReading[]>([])
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    let disposed = false
    let controller: AbortController | null = null
    const refresh = async () => {
      if (controller) return
      controller = new AbortController()
      const timeout = setTimeout(() => { controller?.abort() }, 12_000)
      try {
        const response = await fetch('/api/sentiment', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Sentiment unavailable')
        const data = await response.json() as SentimentResponse
        if (!Array.isArray(data.indices)) throw new Error('Invalid sentiment response')
        if (!disposed) {
          setReadings(previous => data.indices.map(reading => reading.value === null
            ? { ...(previous.find(item => item.kind === reading.kind) ?? reading), stale: true }
            : reading))
        }
      } catch {
        if (!disposed) setReadings(previous => previous.map(reading => ({ ...reading, stale: true })))
      } finally {
        clearTimeout(timeout)
        controller = null
        if (!disposed) { setLoaded(true); setNow(Date.now()) }
      }
    }
    void refresh()
    const poll = setInterval(() => { setNow(Date.now()); void refresh() }, refreshInterval)
    return () => { disposed = true; controller?.abort(); clearInterval(poll) }
  }, [])

  return (
    <aside className="fear-indices" aria-label="Crypto and stock-market fear indicators">
      {SENTIMENT_INDICES.map(kind => {
        const source = SENTIMENT_SOURCES[kind]
        const reading = readings.find(item => item.kind === kind)
        const stale = (reading?.stale ?? true) || now - (reading?.fetchedAt ?? 0) > 30 * 60_000
        const value = reading?.value != null ? (kind === 'crypto' ? String(reading.value) : vixFormat.format(reading.value)) : '—'
        const [leading, decimal] = value.split(',')
        const sentiment = kind === 'crypto'
          ? reading?.classification?.includes('Fear') ? 'fear' : reading?.classification?.includes('Greed') ? 'greed' : 'neutral'
          : reading?.value != null && reading.value >= 20 ? 'fear' : 'greed'
        const status = reading?.value == null ? (loaded ? 'Unavailable' : 'Loading')
          : stale ? 'Stale' : kind === 'crypto' ? reading.classification ?? 'Daily' : `${sentiment === 'fear' ? 'Higher volatility' : 'Calmer market'}; delayed`
        const asOf = reading?.asOf ? ` Updated ${new Date(reading.asOf).toLocaleString('nl-NL')}.` : ''
        return (
          <a
            className={`fear-index${stale ? ' is-stale' : ''}`}
            data-sentiment={reading?.value == null || stale ? 'neutral' : sentiment}
            key={kind}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Source: ${source.name}. ${source.description} ${status}.${asOf}`}
            aria-label={`${source.label}: ${value}${reading?.value != null ? '%' : ''}. ${status}. Source: ${source.name}. ${source.description}${asOf}`}
          >
            <span className="index-label">{source.label}</span>
            <span className="index-reading">
              <span className="index-value">{leading}</span>
              {decimal && <span className="index-decimal">,{decimal}</span>}
              {reading?.value != null && <span className="index-unit">%</span>}
            </span>
          </a>
        )
      })}
      <style jsx>{`
        .fear-indices {
          display: flex;
          align-items: center;
          gap: 18px;
          flex: 0 0 auto;
          align-self: center;
          margin-left: auto;
          padding-left: 16px;
          border-left: 1px solid var(--border-bright);
        }
        .fear-index { display: inline-flex; align-items: baseline; gap: 6px; flex: 0 0 auto; text-decoration: none; white-space: nowrap; }
        .fear-index:focus-visible { outline: 1px solid var(--accent); outline-offset: 4px; border-radius: 3px; }
        .index-label { font-size: 18px; font-weight: 600; letter-spacing: 0.025em; color: var(--text-muted); }
        .index-reading { display: inline-flex; align-items: baseline; font-variant-numeric: tabular-nums; letter-spacing: -0.025em; line-height: 1.15; }
        .index-value { font-size: 29px; font-weight: 600; color: var(--text-secondary); }
        .index-decimal { font-size: 23px; font-weight: 500; color: var(--text-muted); }
        .index-unit { font-size: 18px; font-weight: 500; margin-left: 2px; color: var(--text-muted); }
        [data-sentiment='fear'] .index-value { color: #f87171; }
        [data-sentiment='greed'] .index-value { color: #4ade80; }
        .is-stale .index-value { color: var(--text-muted); }
        @media (max-width: 480px) {
          .fear-indices { gap: 10px; padding-left: 10px; }
        }
      `}</style>
    </aside>
  )
}
