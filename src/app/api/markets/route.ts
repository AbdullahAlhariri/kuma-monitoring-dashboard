import { NextResponse } from 'next/server'
import { MARKET_INSTRUMENTS, MARKET_SYMBOLS, priceChangePercent, type MarketQuote, type MarketSymbol } from '@/lib/market'

export const dynamic = 'force-dynamic'

interface CachedQuote {
  quote: MarketQuote
  retryAt: number
}

interface CoinbaseTicker {
  price?: string
  time?: string
}

interface YahooChart {
  chart?: {
    result?: {
      meta?: {
        symbol?: string
        currency?: string
        regularMarketPrice?: number
        regularMarketTime?: number
        previousClose?: number
        chartPreviousClose?: number
      }
    }[] | null
  }
}

// Share requests across displays and retain the last good price during an outage.
const cache = new Map<MarketSymbol, CachedQuote>()
const pending = new Map<MarketSymbol, Promise<MarketQuote>>()
const dailyOpens = new Map<MarketSymbol, { dayStart: number; price: number }>()

async function getDailyOpen(symbol: MarketSymbol, options: RequestInit): Promise<number | null> {
  const dayStart = Math.floor(Date.now() / 86_400_000) * 86_400_000
  const cached = dailyOpens.get(symbol)
  if (cached?.dayStart === dayStart) return cached.price
  try {
    const start = encodeURIComponent(new Date(dayStart).toISOString())
    const end = encodeURIComponent(new Date(dayStart + 86_400_000).toISOString())
    const response = await fetch(`https://api.exchange.coinbase.com/products/${symbol}-USD/candles?granularity=86400&start=${start}&end=${end}`, options)
    if (!response.ok) return null
    const candles = await response.json() as unknown
    if (!Array.isArray(candles)) return null
    const candle: unknown = candles.find((item: unknown) => Array.isArray(item) && item[0] === dayStart / 1000)
    const opening: unknown = Array.isArray(candle) ? candle[3] : null
    if (typeof opening !== 'number' || !Number.isFinite(opening) || opening <= 0) return null
    dailyOpens.set(symbol, { dayStart, price: opening })
    return opening
  } catch {
    return null
  }
}

async function fetchQuote(symbol: MarketSymbol): Promise<MarketQuote> {
  const previous = cache.get(symbol)
  const { yahooSymbol, priceDivisor = 1 } = MARKET_INSTRUMENTS[symbol]
  let quote: MarketQuote
  try {
    const url = yahooSymbol
      ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`
      : `https://api.exchange.coinbase.com/products/${symbol}-USD/ticker`
    const options: RequestInit = {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    }
    const [response, dailyOpen] = await Promise.all([
      fetch(url, options),
      yahooSymbol ? Promise.resolve(null) : getDailyOpen(symbol, options),
    ])
    if (!response.ok) throw new Error('Quote feed unavailable')

    let price: number
    let asOf: number
    let reference: number
    if (yahooSymbol) {
      const body = await response.json() as YahooChart
      const meta = body.chart?.result?.[0]?.meta
      // Validate the exact listing and USD denomination for stocks and futures.
      if (meta?.currency !== 'USD' || meta.symbol !== yahooSymbol) {
        throw new Error('Unexpected quote listing or currency')
      }
      price = meta.regularMarketPrice ?? NaN
      asOf = (meta.regularMarketTime ?? NaN) * 1000
      reference = meta.previousClose ?? meta.chartPreviousClose ?? NaN
    } else {
      const body = await response.json() as CoinbaseTicker
      price = Number(body.price)
      asOf = Date.parse(body.time ?? '')
      reference = dailyOpen ?? NaN
    }
    // WTI futures can legitimately trade at zero or negative prices.
    if (!Number.isFinite(price) || (symbol !== 'OIL' && price <= 0) || !Number.isFinite(asOf) || asOf <= 0) {
      throw new Error('Invalid quote')
    }
    quote = {
      symbol,
      price: price / priceDivisor,
      changePercent: priceChangePercent(price, reference),
      referencePrice: Number.isFinite(reference) ? reference / priceDivisor : null,
      asOf: new Date(asOf).toISOString(), fetchedAt: Date.now(), stale: false,
    }
  } catch {
    quote = {
      symbol,
      price: previous?.quote.price ?? null,
      changePercent: previous?.quote.changePercent ?? null,
      referencePrice: previous?.quote.referencePrice ?? null,
      asOf: previous?.quote.asOf ?? null,
      fetchedAt: previous?.quote.fetchedAt ?? 0,
      stale: true,
    }
  }
  const nextDay = (Math.floor(Date.now() / 86_400_000) + 1) * 86_400_000
  const retryAt = yahooSymbol ? Date.now() + 60_000 : Math.min(Date.now() + 15_000, nextDay)
  cache.set(symbol, { quote, retryAt })
  return quote
}

function getQuote(symbol: MarketSymbol): Promise<MarketQuote> {
  const cached = cache.get(symbol)
  if (cached && Date.now() < cached.retryAt) return Promise.resolve(cached.quote)
  const active = pending.get(symbol)
  if (active) return active
  const request = fetchQuote(symbol).finally(() => { pending.delete(symbol) })
  pending.set(symbol, request)
  return request
}

export async function GET() {
  const quotes = await Promise.all(MARKET_SYMBOLS.map(getQuote))
  return NextResponse.json({ quotes }, { headers: { 'Cache-Control': 'no-store' } })
}
