'use client'

import { useEffect, useState } from 'react'
import { CRYPTO_SYMBOLS, MARKET_INSTRUMENTS, MARKET_SYMBOLS, priceChangePercent, type MarketQuote, type MarketResponse, type MarketSymbol } from '@/lib/market'

interface StreamingQuote extends Omit<MarketQuote, 'changePercent' | 'referencePrice'> {
  receivedAt: number
}

interface TickerMessage {
  type?: string
  product_id?: string
  price?: string
  time?: string
}

const priceWithCents = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})
const wholePrice = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 0, maximumFractionDigits: 0,
})
const percentageChange = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 1, maximumFractionDigits: 1,
})

export default function MarketTicker() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([])
  const [stream, setStream] = useState<Partial<Record<MarketSymbol, StreamingQuote>>>({})
  const [connected, setConnected] = useState(false)
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
        const response = await fetch('/api/markets', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Prices unavailable')
        const data = await response.json() as MarketResponse
        if (!Array.isArray(data.quotes)) throw new Error('Invalid prices')
        if (!disposed) {
          setQuotes(previous => data.quotes.map(quote => quote.price === null
            ? { ...(previous.find(item => item.symbol === quote.symbol) ?? quote), stale: true }
            : quote))
        }
      } catch {
        if (!disposed) setQuotes(previous => previous.map(quote => ({ ...quote, stale: true })))
      } finally {
        clearTimeout(timeout)
        controller = null
        if (!disposed) setLoaded(true)
      }
    }
    void refresh()
    const poll = setInterval(() => { setNow(Date.now()); void refresh() }, 15_000)
    return () => { disposed = true; controller?.abort(); clearInterval(poll) }
  }, [])

  useEffect(() => {
    let disposed = false
    let socket: WebSocket | null = null
    let reconnect: ReturnType<typeof setTimeout> | undefined
    let lastMessage = Date.now()
    let retryMs = 1000

    const scheduleReconnect = () => {
      if (disposed) return
      setConnected(false)
      reconnect = setTimeout(connect, retryMs)
      retryMs = Math.min(retryMs * 2, 30_000)
    }
    const connect = () => {
      if (disposed) return
      try {
        const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com')
        socket = ws
        lastMessage = Date.now()
        ws.onopen = () => {
          ws.send(JSON.stringify({
            type: 'subscribe', product_ids: CRYPTO_SYMBOLS.map(symbol => `${symbol}-USD`), channels: ['ticker_batch', 'heartbeat'],
          }))
        }
        ws.onmessage = (event: MessageEvent<string>) => {
          if (disposed) return
          try {
            const message = JSON.parse(event.data) as TickerMessage
            if (message.type !== 'ticker' && message.type !== 'heartbeat') return
            lastMessage = Date.now()
            retryMs = 1000
            setConnected(true)
            if (message.type !== 'ticker') return
            const symbol = CRYPTO_SYMBOLS.find(symbol => message.product_id === `${symbol}-USD`)
            const price = Number(message.price)
            const asOf = Date.parse(message.time ?? '')
            if (!symbol || !Number.isFinite(price) || price <= 0 || !Number.isFinite(asOf)) return
            setStream(previous => ({
              ...previous,
              [symbol]: {
                symbol, price, asOf: new Date(asOf).toISOString(),
                fetchedAt: Date.now(), receivedAt: Date.now(), stale: false,
              },
            }))
          } catch { /* Ignore non-quote messages; polling remains available. */ }
        }
        ws.onerror = () => { ws.close() }
        ws.onclose = scheduleReconnect
      } catch { scheduleReconnect() }
    }
    connect()
    const watchdog = setInterval(() => {
      if (socket && Date.now() - lastMessage > 30_000) {
        setConnected(false)
        socket.close()
      }
    }, 10_000)
    return () => {
      disposed = true
      clearTimeout(reconnect)
      clearInterval(watchdog)
      if (socket) { socket.onclose = null; socket.close() }
    }
  }, [])

  return (
    <section className="market-ticker" aria-label="Market prices in US dollars">
      <div className="market-quotes">
        {MARKET_SYMBOLS.map(symbol => {
          const instrument = MARKET_INSTRUMENTS[symbol]
          const polled = quotes.find(quote => quote.symbol === symbol)
          const streamed = stream[symbol]
          const live = connected && streamed !== undefined && now - streamed.receivedAt < 45_000
          const quote = streamed && (live || !polled?.asOf || Date.parse(streamed.asOf ?? '') > Date.parse(polled.asOf))
            ? streamed : polled ?? streamed
          const stale = !live && ((polled?.stale ?? true) || now - (quote?.fetchedAt ?? 0) > 120_000)
          const status = quote?.price == null ? (loaded ? 'Unavailable' : 'Connecting')
            : stale ? 'Stale' : instrument.yahooSymbol ? 'Delayed' : live ? 'Live' : '15s updates'
          const source = instrument.yahooSymbol
            ? `Yahoo Finance · ${instrument.yahooSymbol} · delayed${instrument.caption ? ` · ${instrument.caption}` : ''}`
            : 'Coinbase · USD'
          const priceParts = quote?.price != null
            ? (Math.abs(quote.price) >= 1000 ? wholePrice : priceWithCents).formatToParts(quote.price) : []
          const price = priceParts.length > 0 ? priceParts.map(part => part.value).join('') : '—'
          const leadingPricePart = priceParts.findIndex(part => part.type === 'integer')
          const referenceIsCurrent = instrument.yahooSymbol !== undefined || (polled !== undefined
            && Math.floor(polled.fetchedAt / 86_400_000) === Math.floor(now / 86_400_000))
          const change = quote?.price != null && polled?.referencePrice != null && referenceIsCurrent
            ? priceChangePercent(quote.price, polled.referencePrice) : null
          const direction = change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down'
          const dailyChange = change === null ? '—' : `${percentageChange.format(Math.trunc(Math.abs(change) * 10) / 10)}%`
          const changeLabel = change === null ? 'Change unavailable'
            : `${direction === 'up' ? 'Up' : direction === 'down' ? 'Down' : 'Unchanged'} ${dailyChange} ${instrument.yahooSymbol ? 'vs previous close' : 'today (since 00:00 UTC)'}`
          return (
            <div
              className="market-quote"
              data-symbol={symbol}
              key={symbol}
              role="group"
              tabIndex={0}
              aria-label={`${instrument.label} ${price}${instrument.priceSuffix ?? ''} USD · ${changeLabel} · ${status}${instrument.caption ? ` · ${instrument.caption}` : ''}`}
              title={`${changeLabel} · ${status} · ${source}${quote?.asOf ? ` · Last trade ${new Date(quote.asOf).toLocaleString()}` : ''}`}
            >
              <span className="quote-symbol">
                {instrument.label}
                {instrument.yahooSymbol && <sup className="quote-marker" title="Delayed quote">†</sup>}
              </span>
              <span className={`quote-price${stale ? ' is-stale' : ''}`}>
                {priceParts.length > 0 ? priceParts.map((part, index) => (
                  <span key={index} className={index === leadingPricePart ? 'price-leading' : 'price-secondary'}>{part.value}</span>
                )) : '—'}
                {instrument.priceSuffix && <span className="price-unit">{instrument.priceSuffix}</span>}
              </span>
              <span className="quote-change" data-direction={stale ? 'stale' : direction} title={changeLabel}>
                {dailyChange}
              </span>
              {stale && quote?.price != null && <span className="stale-label">stale</span>}
            </div>
          )
        })}
      </div>
      <style jsx>{`
        .market-ticker {
          display: flex;
          align-items: center;
          height: 64px;
          min-height: 64px;
          min-width: 0;
          padding: 0 12px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: var(--radius-sm);
        }
        .market-quotes {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          width: 100%;
          min-width: 0;
          overflow-x: auto;
          padding: 6px 0;
          scrollbar-width: thin;
          scrollbar-color: var(--border-bright) transparent;
        }
        .market-quotes::-webkit-scrollbar { height: 2px; }
        .market-quote { display: flex; align-items: baseline; gap: 6px; flex-shrink: 0; white-space: nowrap; }
        .market-quote:focus-visible { outline: 1px solid var(--accent); outline-offset: 3px; border-radius: 3px; }
        .quote-symbol { font-size: 18px; font-weight: 600; letter-spacing: 0.025em; color: #fff; }
        .market-quote[data-symbol='BTC'] .quote-symbol { color: #f4bd64; }
        .market-quote[data-symbol='ETH'] .quote-symbol { color: #b0c3ff; }
        .market-quote[data-symbol='RENDER'] .quote-symbol { color: #8bdbc5; }
        .market-quote[data-symbol='HIEU'] .quote-symbol { color: #c4b5fd; }
        .market-quote[data-symbol='OIL'] .quote-symbol { color: #91cced; }
        .market-quote[data-symbol='GOLD'] .quote-symbol { color: #efd180; }
        .market-quote[data-symbol='SILVER'] .quote-symbol { color: #d3dce8; }
        .quote-marker { font-size: 14px; font-weight: 700; margin-left: 3px; line-height: 1; color: #fff; }
        .quote-price {
          font-size: 29px;
          line-height: 1.15;
          font-weight: 600;
          letter-spacing: -0.025em;
          color: #fff;
          white-space: nowrap;
        }
        .price-leading { font-size: 29px; font-weight: 600; color: #fff; }
        .price-secondary { font-size: 23px; font-weight: 500; color: var(--text-muted); }
        .quote-change { display: inline-flex; align-items: center; gap: 3px; font-size: 18px; font-weight: 500; color: var(--text-secondary); }
        .quote-change[data-direction='up'] { color: #4ade80; }
        .quote-change[data-direction='down'] { color: #f87171; }
        .quote-change[data-direction='stale'], .is-stale { color: var(--text-secondary); }
        .price-unit { font-size: 13px; margin-left: 2px; }
        .stale-label { font-size: 10px; color: var(--text-muted); }
      `}</style>
    </section>
  )
}
