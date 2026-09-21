import { NextResponse } from 'next/server'
import { SENTIMENT_INDICES, type SentimentKind, type SentimentReading } from '@/lib/sentiment'

export const dynamic = 'force-dynamic'

interface AlternativeResponse {
  data?: { value?: string; value_classification?: string; timestamp?: string }[]
}

interface VixResponse {
  chart?: {
    result?: { meta?: { symbol?: string; regularMarketPrice?: number; regularMarketTime?: number } }[] | null
  }
}

interface CachedReading {
  reading: SentimentReading
  retryAt: number
}

const cache = new Map<SentimentKind, CachedReading>()
const pending = new Map<SentimentKind, Promise<SentimentReading>>()
const classifications = new Set(['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed'])

async function fetchReading(kind: SentimentKind): Promise<SentimentReading> {
  const previous = cache.get(kind)?.reading
  let reading: SentimentReading
  try {
    const response = await fetch(kind === 'crypto'
      ? 'https://api.alternative.me/fng/?limit=1'
      : 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    })
    if (!response.ok) throw new Error('Sentiment feed unavailable')

    let value: number
    let timestamp: number
    let classification: string | null = null
    if (kind === 'crypto') {
      const body = await response.json() as AlternativeResponse | null
      const latest = body?.data?.[0]
      if (!latest?.value?.trim()) throw new Error('Missing sentiment score')
      value = Number(latest.value)
      timestamp = Number(latest.timestamp) * 1000
      if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error('Invalid Fear & Greed score')
      if (latest.value_classification && classifications.has(latest.value_classification)) {
        classification = latest.value_classification
      }
    } else {
      const body = await response.json() as VixResponse | null
      const meta = body?.chart?.result?.[0]?.meta
      if (meta?.symbol !== '^VIX') throw new Error('Unexpected market index')
      value = meta.regularMarketPrice ?? NaN
      timestamp = (meta.regularMarketTime ?? NaN) * 1000
      if (value <= 0) throw new Error('Invalid VIX value')
    }
    if (!Number.isFinite(value) || !Number.isFinite(timestamp) || timestamp <= 0) {
      throw new Error('Invalid sentiment data')
    }
    reading = {
      kind, value, classification, asOf: new Date(timestamp).toISOString(), fetchedAt: Date.now(),
      stale: kind === 'crypto' && Date.now() - timestamp > 48 * 60 * 60 * 1000,
    }
  } catch {
    reading = {
      kind, value: previous?.value ?? null, classification: previous?.classification ?? null,
      asOf: previous?.asOf ?? null, fetchedAt: previous?.fetchedAt ?? 0, stale: true,
    }
  }
  cache.set(kind, { reading, retryAt: Date.now() + (kind === 'crypto' ? 15 : 5) * 60_000 })
  return reading
}

function getReading(kind: SentimentKind): Promise<SentimentReading> {
  const cached = cache.get(kind)
  if (cached && Date.now() < cached.retryAt) return Promise.resolve(cached.reading)
  const active = pending.get(kind)
  if (active) return active
  const request = fetchReading(kind).finally(() => { pending.delete(kind) })
  pending.set(kind, request)
  return request
}

export async function GET() {
  const indices = await Promise.all(SENTIMENT_INDICES.map(getReading))
  return NextResponse.json({ indices }, { headers: { 'Cache-Control': 'no-store' } })
}
