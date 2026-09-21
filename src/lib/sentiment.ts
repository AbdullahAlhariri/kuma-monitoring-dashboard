export const SENTIMENT_INDICES = ['crypto', 'market'] as const
export type SentimentKind = typeof SENTIMENT_INDICES[number]

export const SENTIMENT_SOURCES = {
  crypto: {
    label: 'Crypto F&G',
    name: 'Alternative.me',
    url: 'https://alternative.me/crypto/fear-and-greed-index/',
    description: 'Crypto Fear & Greed (Bitcoin sentiment): the 0–100 score displayed as a percentage, not a probability. Red means fear; green means greed. Updated daily.',
  },
  market: {
    label: 'Market VIX',
    name: 'Cboe',
    url: 'https://www.cboe.com/tradable-products/vix',
    description: 'Cboe VIX via Yahoo Finance: expected S&P 500 volatility over the next 30 days, expressed as an annualized percentage. Dashboard colors: green below 20%; red at 20% or above. This is not a Fear & Greed score. Quotes may be delayed.',
  },
} as const

export interface SentimentReading {
  kind: SentimentKind
  value: number | null
  classification: string | null
  asOf: string | null
  fetchedAt: number
  stale: boolean
}

export interface SentimentResponse {
  indices: SentimentReading[]
}
