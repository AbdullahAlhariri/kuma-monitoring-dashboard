export const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'RENDER'] as const
export const MARKET_SYMBOLS = [...CRYPTO_SYMBOLS, 'HIEU', 'OIL', 'GOLD', 'SILVER'] as const
export type MarketSymbol = typeof MARKET_SYMBOLS[number]

interface MarketInstrument {
  label: string
  yahooSymbol?: string
  caption?: string
  priceDivisor?: number
  priceSuffix?: string
}

// Exact troy-ounce conversion used by precious-metal quotes (NIST).
const GRAMS_PER_TROY_OUNCE = 31.1034768

export const MARKET_INSTRUMENTS: Record<MarketSymbol, MarketInstrument> = {
  BTC: { label: 'BTC' },
  ETH: { label: 'ETH' },
  RENDER: { label: 'RENDER' },
  HIEU: { label: 'HIEU', yahooSymbol: 'HIEU.L' },
  OIL: { label: 'Oil', yahooSymbol: 'CL=F', caption: 'WTI futures · USD/barrel' },
  GOLD: { label: 'Gold', yahooSymbol: 'GC=F', caption: 'Futures · USD/gram', priceDivisor: GRAMS_PER_TROY_OUNCE, priceSuffix: '/g' },
  SILVER: { label: 'Silver', yahooSymbol: 'SI=F', caption: 'Futures · USD/gram', priceDivisor: GRAMS_PER_TROY_OUNCE, priceSuffix: '/g' },
}

export interface MarketQuote {
  symbol: MarketSymbol
  price: number | null
  changePercent: number | null
  referencePrice: number | null
  asOf: string | null
  fetchedAt: number
  stale: boolean
}

export interface MarketResponse {
  quotes: MarketQuote[]
}

export function priceChangePercent(price: number, reference: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(reference) || reference === 0) return null
  const change = ((price - reference) / Math.abs(reference)) * 100
  return Number.isFinite(change) ? change : null
}
