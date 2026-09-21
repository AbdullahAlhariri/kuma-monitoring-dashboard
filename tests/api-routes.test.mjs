import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
const market = {}
runInNewContext(ts.transpileModule(
  readFileSync(new URL('../src/lib/market.ts', import.meta.url), 'utf8'), { compilerOptions },
).outputText, { exports: market })
const sentiment = {}
runInNewContext(ts.transpileModule(
  readFileSync(new URL('../src/lib/sentiment.ts', import.meta.url), 'utf8'), { compilerOptions },
).outputText, { exports: sentiment })

// Execute the actual route handlers with deterministic upstream feeds and time.
function loadRoute(route, fetch, { enabled = true, timedOut = false } = {}) {
  let now = Date.parse('2026-09-21T12:00:00Z')
  const timeouts = []
  const exports = {}
  const source = readFileSync(new URL(`../src/app/api/${route}/route.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions,
  })
  runInNewContext(outputText, {
    exports,
    fetch,
    Date: class extends Date { static now() { return now } },
    AbortSignal: {
      timeout(ms) {
        timeouts.push(ms)
        return timedOut ? AbortSignal.abort(new DOMException('Timed out', 'TimeoutError')) : AbortSignal.timeout(ms)
      },
    },
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: Response.json } }
      if (name === '@/lib/market') return market
      if (name === '@/lib/sentiment') return sentiment
      if (name === '@/lib/config') return { config: { kuma: { enabled, baseUrl: 'https://kuma.test', slug: 'public' } } }
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  return { get: exports.GET, advance: ms => { now += ms }, timeouts }
}

const marketFeed = url => {
  if (url.includes('yahoo')) {
    const symbol = decodeURIComponent(new URL(url).pathname.split('/').at(-1))
    const prices = { 'HIEU.L': 36.245, 'CL=F': 93.56, 'GC=F': 4383.2, 'SI=F': 66.375 }
    const previousCloses = { 'HIEU.L': 36.5, 'CL=F': 96.08, 'GC=F': 4300, 'SI=F': 66.375 }
    return Response.json({ chart: { result: [{ meta: {
      currency: 'USD', symbol, regularMarketPrice: prices[symbol], regularMarketTime: 1789986807,
      chartPreviousClose: previousCloses[symbol],
    } }] } })
  }
  if (url.includes('/candles?')) {
    const dayStart = Date.parse(new URL(url).searchParams.get('start')) / 1000
    const open = url.includes('BTC') ? 84000 : url.includes('RENDER') ? 1.7695 : 2800
    return Response.json([[dayStart, open, open, open, open, 1]])
  }
  return Response.json({ price: url.includes('BTC') ? '84500.58' : url.includes('RENDER') ? '1.7695' : '2718.74', time: '2026-09-21T12:00:00Z' })
}

test('returns all seven USD assets; caches and deduplicates requests', async () => {
  const calls = []
  const route = loadRoute('markets', async (url, options) => {
    calls.push(url)
    assert.equal(options.cache, 'no-store')
    assert.ok(options.signal instanceof AbortSignal)
    return marketFeed(url)
  })
  const [first, concurrent] = await Promise.all([route.get(), route.get()])
  const data = await first.json()
  assert.deepEqual(data.quotes.map(q => [q.symbol, q.price, q.stale]), [
    ['BTC', 84500.58, false], ['ETH', 2718.74, false], ['RENDER', 1.7695, false], ['HIEU', 36.245, false],
    ['OIL', 93.56, false], ['GOLD', 4383.2 / 31.1034768, false], ['SILVER', 66.375 / 31.1034768, false],
  ])
  assert.deepEqual(await concurrent.json(), data)
  assert.equal(first.headers.get('cache-control'), 'no-store')
  assert.equal(calls.length, 10)
  await route.get()
  assert.equal(calls.length, 10)
  route.advance(16_000)
  await route.get()
  assert.equal(calls.length, 13, 'Daily opening prices are reused while current crypto prices refresh')
  assert.ok(route.timeouts.every(ms => ms === 8000))
})

test('calculates positive, negative, and unchanged prices against the correct reference', async () => {
  const route = loadRoute('markets', async url => marketFeed(url))
  const { quotes } = await (await route.get()).json()
  const changes = Object.fromEntries(quotes.map(quote => [quote.symbol, Math.sign(quote.changePercent)]))
  assert.deepEqual(changes, { BTC: 1, ETH: -1, RENDER: 0, HIEU: -1, OIL: -1, GOLD: 1, SILVER: 0 })
})

test('gold and silver are USD per gram while their percentage changes keep the same basis', async () => {
  const route = loadRoute('markets', async url => marketFeed(url))
  const { quotes } = await (await route.get()).json()
  const gold = quotes.find(quote => quote.symbol === 'GOLD')
  const silver = quotes.find(quote => quote.symbol === 'SILVER')
  assert.equal(gold.price.toFixed(2), '140.92')
  assert.equal(silver.price.toFixed(2), '2.13')
  assert.equal(gold.changePercent, ((4383.2 - 4300) / 4300) * 100)
  assert.equal(silver.changePercent, 0)
  assert.equal(market.MARKET_INSTRUMENTS.GOLD.priceSuffix, '/g')
  assert.equal(market.MARKET_INSTRUMENTS.SILVER.priceSuffix, '/g')
})

test('comparison feed failures keep crypto prices available without inventing a change', async () => {
  const route = loadRoute('markets', async url => {
    if (url.includes('/candles?')) throw new Error('Daily opening prices unavailable')
    return marketFeed(url)
  })
  const { quotes } = await (await route.get()).json()
  assert.ok(quotes.slice(0, 3).every(quote => quote.price > 0 && quote.changePercent === null && !quote.stale))
})

test('crypto uses today’s opening candle and refreshes it at the next UTC day', async () => {
  const starts = []
  const route = loadRoute('markets', async url => {
    if (!url.includes('/candles?')) return marketFeed(url)
    const start = new URL(url).searchParams.get('start')
    starts.push(start)
    const day = Date.parse(start) / 1000
    const opening = start.startsWith('2026-09-21') ? 80000 : 90000
    // Coinbase can include older candles; only today's exact bucket is valid.
    return Response.json([[day - 86400, 1, 1, 1, 1, 1], [day, opening, opening, opening, opening, 1]])
  })
  const first = await (await route.get()).json()
  assert.equal(first.quotes[0].referencePrice, 80000)
  assert.ok(first.quotes[0].changePercent > 0)
  route.advance(12 * 60 * 60 * 1000)
  const nextDay = await (await route.get()).json()
  assert.equal(nextDay.quotes[0].referencePrice, 90000)
  assert.ok(nextDay.quotes[0].changePercent < 0)
  assert.equal(starts.filter(start => start === '2026-09-22T00:00:00.000Z').length, 3)
})

test('missing today’s candle never substitutes yesterday’s opening price', async () => {
  const route = loadRoute('markets', async url => url.includes('/candles?')
    ? Response.json([[0, 1, 1, 1, 1, 1]]) : marketFeed(url))
  const { quotes } = await (await route.get()).json()
  assert.ok(quotes.slice(0, 3).every(quote => quote.referencePrice === null && quote.changePercent === null && !quote.stale))
})

test('missing or zero comparison prices stay neutral, including live crypto comparisons', () => {
  assert.equal(market.priceChangePercent(100, 0), null)
  assert.equal(market.priceChangePercent(100, NaN), null)
  assert.equal(market.priceChangePercent(110, 100), 10)
  assert.equal(market.priceChangePercent(90, 100), -10)
  assert.equal(market.priceChangePercent(-10, -20), 50)
})

test('one unavailable feed does not hide the other prices', async () => {
  const route = loadRoute('markets', async url => url.includes('HIEU.L')
    ? new Response('Rate limited', { status: 429 }) : marketFeed(url))
  const { quotes } = await (await route.get()).json()
  assert.equal(quotes[0].price, 84500.58)
  assert.equal(quotes[1].price, 2718.74)
  assert.equal(quotes[2].price, 1.7695)
  assert.equal(quotes[3].price, null)
  assert.equal(quotes[3].stale, true)
  assert.ok(quotes.slice(4).every(quote => quote.price !== null && !quote.stale))
})

test('WTI futures can legitimately have a negative price', async () => {
  const route = loadRoute('markets', async url => {
    const response = marketFeed(url)
    if (!url.includes('CL%3DF')) return response
    const body = await response.json()
    body.chart.result[0].meta.regularMarketPrice = -37.63
    return Response.json(body)
  })
  const { quotes } = await (await route.get()).json()
  assert.equal(quotes.find(quote => quote.symbol === 'OIL').price, -37.63)
  assert.equal(quotes.find(quote => quote.symbol === 'OIL').stale, false)
})

test('keeps last prices and timestamps during outages, then recovers', async () => {
  let offline = false
  const route = loadRoute('markets', async url => {
    if (offline) throw new Error('Network offline')
    return marketFeed(url)
  })
  const first = await (await route.get()).json()
  route.advance(61_000)
  offline = true
  const failed = await (await route.get()).json()
  for (let i = 0; i < first.quotes.length; i++) {
    assert.equal(failed.quotes[i].price, first.quotes[i].price)
    assert.equal(failed.quotes[i].fetchedAt, first.quotes[i].fetchedAt)
    assert.equal(failed.quotes[i].asOf, first.quotes[i].asOf)
    assert.equal(failed.quotes[i].changePercent, first.quotes[i].changePercent)
    assert.equal(failed.quotes[i].stale, true)
  }
  offline = false
  route.advance(61_000)
  const recovered = await (await route.get()).json()
  assert.ok(recovered.quotes.every(q => !q.stale))
})

test('rejects prices in the wrong currency and invalid crypto quotes', async () => {
  const route = loadRoute('markets', async url => {
    if (url.includes('yahoo')) return Response.json({ chart: { result: [{ meta: {
      symbol: 'HIEU.L', currency: 'EUR', regularMarketPrice: 36.245, regularMarketTime: 1789986807,
    } }] } })
    return Response.json({ price: url.includes('BTC') ? '-1' : 'NaN', time: 'invalid' })
  })
  const { quotes } = await (await route.get()).json()
  assert.ok(quotes.every(q => q.price === null && q.stale))
})

const kumaFeed = url => Response.json(url.includes('heartbeat')
  ? { heartbeatList: { 1: [{ status: 0, time: '2026-09-21T12:00:00Z', msg: 'Down', ping: null }] }, uptimeList: { '1_24': 0.99 } }
  : { title: 'Status', publicGroupList: [{ name: 'Services', monitorList: [{ id: 1, name: 'Example' }] }] })

test('a reachable Kuma still reports actual monitor outages', async () => {
  const route = loadRoute('kuma', async url => kumaFeed(url))
  const response = await route.get()
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.monitors[0].status, 0)
  assert.equal(data.monitors[0].uptime24, 99)
  assert.deepEqual(route.timeouts, [8000])
})

test('Kuma connection failures, invalid payloads, and timeouts are unavailable, not healthy', async () => {
  for (const scenario of ['network', 'invalid', 'http', 'timeout']) {
    const route = loadRoute('kuma', async (_url, options) => {
      options.signal.throwIfAborted()
      if (scenario === 'network') throw new Error('Connection refused')
      if (scenario === 'http') return new Response('Unavailable', { status: 503 })
      return Response.json({})
    }, { timedOut: scenario === 'timeout' })
    const response = await route.get()
    assert.equal(response.status, 502, scenario)
    assert.equal(typeof (await response.json()).error, 'string')
  }
})

test('disabled Kuma does not call the upstream', async () => {
  const route = loadRoute('kuma', () => assert.fail('Should not fetch disabled Kuma'), { enabled: false })
  const response = await route.get()
  assert.equal((await response.json()).enabled, false)
})

const sentimentFeed = url => Response.json(url.includes('alternative.me')
  ? { data: [{ value: '70', value_classification: 'Greed', timestamp: '1789948800' }] }
  : { chart: { result: [{ meta: { symbol: '^VIX', regularMarketPrice: 15.03, regularMarketTime: 1789992000 } }] } })

test('sentiment returns crypto Fear & Greed and market VIX independently, with caching', async () => {
  const calls = []
  const route = loadRoute('sentiment', async (url, options) => {
    calls.push(url)
    assert.ok(options.signal instanceof AbortSignal)
    return sentimentFeed(url)
  })
  const [first, concurrent] = await Promise.all([route.get(), route.get()])
  const data = await first.json()
  assert.deepEqual(data.indices.map(index => [index.kind, index.value, index.classification, index.stale]), [
    ['crypto', 70, 'Greed', false], ['market', 15.03, null, false],
  ])
  assert.deepEqual(await concurrent.json(), data)
  assert.equal(first.headers.get('cache-control'), 'no-store')
  assert.equal(calls.length, 2)
  await route.get()
  assert.equal(calls.length, 2)
  route.advance(5 * 60_000 + 1000)
  await route.get()
  assert.equal(calls.length, 3, 'VIX refreshes after five minutes')
  route.advance(10 * 60_000)
  await route.get()
  assert.equal(calls.length, 5, 'Crypto refreshes after fifteen minutes')
})

test('an unavailable crypto fear feed does not hide VIX', async () => {
  const route = loadRoute('sentiment', async url => url.includes('alternative.me')
    ? new Response('Unavailable', { status: 503 }) : sentimentFeed(url))
  const { indices } = await (await route.get()).json()
  assert.equal(indices[0].value, null)
  assert.equal(indices[0].stale, true)
  assert.equal(indices[1].value, 15.03)
  assert.equal(indices[1].stale, false)
})

test('sentiment preserves previous readings on failure and recovers without inventing values', async () => {
  let offline = false
  const route = loadRoute('sentiment', async url => {
    if (offline) throw new Error('Offline')
    return sentimentFeed(url)
  })
  const first = await (await route.get()).json()
  offline = true
  route.advance(16 * 60_000)
  const failed = await (await route.get()).json()
  failed.indices.forEach((index, position) => {
    assert.equal(index.value, first.indices[position].value)
    assert.equal(index.fetchedAt, first.indices[position].fetchedAt)
    assert.equal(index.asOf, first.indices[position].asOf)
    assert.equal(index.stale, true)
  })
  offline = false
  route.advance(16 * 60_000)
  const recovered = await (await route.get()).json()
  assert.ok(recovered.indices.every(index => !index.stale))
})

test('crypto accepts 0 as extreme fear, while VIX is not capped at 100', async () => {
  const route = loadRoute('sentiment', async url => Response.json(url.includes('alternative.me')
    ? { data: [{ value: '0', value_classification: 'Extreme Fear', timestamp: '1789948800' }] }
    : { chart: { result: [{ meta: { symbol: '^VIX', regularMarketPrice: 110, regularMarketTime: 1789992000 } }] } }))
  const { indices } = await (await route.get()).json()
  assert.equal(indices[0].value, 0)
  assert.equal(indices[0].classification, 'Extreme Fear')
  assert.equal(indices[1].value, 110)
  assert.ok(indices.every(index => !index.stale))
})

test('invalid sentiment scores, malformed payloads, and wrong index symbols are rejected', async () => {
  for (const invalid of [null, {}, { data: [{ value: '101', timestamp: '1789948800' }] }, { data: [{ value: '', timestamp: '1789948800' }] }]) {
    const route = loadRoute('sentiment', async url => Response.json(url.includes('alternative.me') ? invalid
      : { chart: { result: [{ meta: { symbol: '^GSPC', regularMarketPrice: 6000, regularMarketTime: 1789992000 } }] } }))
    const { indices } = await (await route.get()).json()
    assert.ok(indices.every(index => index.value === null && index.stale))
  }
})

test('sentiment timeouts return quiet unavailable states', async () => {
  const route = loadRoute('sentiment', async (_url, options) => {
    options.signal.throwIfAborted()
    assert.fail('A timed-out feed should abort')
  }, { timedOut: true })
  const { indices } = await (await route.get()).json()
  assert.ok(indices.every(index => index.value === null && index.stale))
  assert.deepEqual(route.timeouts, [8000, 8000])
})

test('an old crypto sentiment observation is visibly stale even if the feed responds', async () => {
  const route = loadRoute('sentiment', async url => sentimentFeed(url))
  route.advance(3 * 24 * 60 * 60_000)
  const { indices } = await (await route.get()).json()
  assert.equal(indices[0].value, 70)
  assert.equal(indices[0].stale, true)
})
