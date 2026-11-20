/**
 * Live market data from public APIs (no keys): reference prices (Binance, then Coinbase, then
 * CoinGecko), candles and the order book (Binance, with Coinbase as the fallback). These are
 * mainnet market prices, shown for reference next to testnet balances.
 */
import { ApiError, getJson } from "./http"

export type Quote = { usd: number; change24h: number; source: "CoinGecko" | "Binance" | "Coinbase" | "Kraken" }

/** a ticker whose last trade is older than this is a halted pair, not a price */
const STALE_MS = 30 * 60_000

let quotePage = typeof window === "undefined" ? undefined : new AbortController()
if (quotePage) {
  const stopQuotes = () => quotePage?.abort()
  window.addEventListener("beforeunload", stopQuotes)
  window.addEventListener("pagehide", stopQuotes)
  window.addEventListener("pageshow", () => {
    if (quotePage?.signal.aborted) quotePage = new AbortController()
  })
}

/**
 * CoinGecko ids we know a live Binance USDT pair for (each checked 2026-11-15). One unknown symbol
 * makes Binance refuse the whole batch (-1121 "Invalid symbol"), so only listed pairs go here:
 * Monad has none (MONUSDT is invalid), it comes from Coinbase or CoinGecko.
 */
const BINANCE_PAIR: Record<string, string> = {
  ethereum: "ETHUSDT",
  solana: "SOLUSDT",
  "the-open-network": "TONUSDT",
  bitcoin: "BTCUSDT",
  "polygon-ecosystem-token": "POLUSDT",
  "avalanche-2": "AVAXUSDT",
  binancecoin: "BNBUSDT",
  "usd-coin": "USDCUSDT",
}

/** Coinbase USD products (live 2026-11-15); USDC has none, it is Coinbase's own quote currency */
const COINBASE_PRODUCT: Record<string, string> = {
  ethereum: "ETH-USD",
  solana: "SOL-USD",
  "the-open-network": "TON-USD",
  bitcoin: "BTC-USD",
  "polygon-ecosystem-token": "POL-USD",
  "avalanche-2": "AVAX-USD",
  binancecoin: "BNB-USD",
  monad: "MON-USD",
  tether: "USDT-USD",
}

async function binanceQuotes(ids: string[], signal?: AbortSignal) {
  const pairs = ids.filter((id) => BINANCE_PAIR[id])
  if (!pairs.length) return {}
  const url = "https://api.binance.com/api/v3/ticker/24hr?symbols=" + encodeURIComponent(JSON.stringify(pairs.map((id) => BINANCE_PAIR[id])))
  const rows = await getJson<{ symbol: string; lastPrice: string; priceChangePercent: string; closeTime: number }[]>(url, { source: "Binance", signal })
  const out: Record<string, Quote> = {}
  for (const id of pairs) {
    const r = rows.find((x) => x.symbol === BINANCE_PAIR[id])
    // a halted pair (TON/USDT since 2026-11) keeps answering with its last, stale price: skip it
    if (r && Date.now() - r.closeTime < STALE_MS) out[id] = { usd: +r.lastPrice, change24h: +r.priceChangePercent, source: "Binance" }
  }
  return out
}

/** Coinbase 24 h stats per product: `last` now and `open` 24 h ago give the change */
async function coinbaseQuotes(ids: string[], signal?: AbortSignal) {
  const out: Record<string, Quote> = {}
  await Promise.all(
    ids
      .filter((id) => COINBASE_PRODUCT[id])
      .map(async (id) => {
        try {
          const s = await getJson<{ open: string; last: string }>(`https://api.exchange.coinbase.com/products/${COINBASE_PRODUCT[id]}/stats`, {
            source: "Coinbase",
            signal,
            timeoutMs: 8_000,
          })
          const last = +s.last
          const open = +s.open
          if (last > 0 && open > 0) out[id] = { usd: last, change24h: ((last - open) / open) * 100, source: "Coinbase" }
        } catch (e) {
          if (signal?.aborted) throw e
        }
      }),
  )
  return out
}

async function coingeckoQuotes(ids: string[], signal?: AbortSignal) {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&include_24hr_change=true&ids=" + encodeURIComponent(ids.join(","))
  const raw = await getJson<Record<string, { usd?: number; usd_24h_change?: number }>>(url, { source: "CoinGecko", signal })
  const out: Record<string, Quote> = {}
  for (const id of ids) {
    const q = raw[id]
    if (typeof q?.usd === "number" && Number.isFinite(q.usd) && q.usd > 0) {
      out[id] = { usd: q.usd, change24h: typeof q.usd_24h_change === "number" && Number.isFinite(q.usd_24h_change) ? q.usd_24h_change : 0, source: "CoinGecko" }
    }
  }
  return out
}

async function krakenDaiQuote(signal?: AbortSignal): Promise<Quote> {
  const raw = await getJson<{ error: string[]; result: { DAIUSD?: (string | number)[][] } }>(
    "https://api.kraken.com/0/public/OHLC?pair=DAIUSD&interval=15",
    { source: "Kraken", signal },
  )
  if (raw.error?.length) throw new ApiError("Kraken: курс DAI недоступен", "Kraken")
  const rows = raw.result?.DAIUSD?.filter((row) => Number(row[0]) * 1000 >= Date.now() - 24 * 60 * 60_000) ?? []
  const open = Number(rows[0]?.[1])
  const last = rows.at(-1)
  const close = Number(last?.[4])
  if (rows.length < 2 || !Number.isFinite(open) || open <= 0 || !Number.isFinite(close) || close <= 0 || Number(last?.[0]) * 1000 < Date.now() - STALE_MS) {
    throw new ApiError("Kraken: нет свежего курса DAI", "Kraken")
  }
  return { usd: close, change24h: (close / open - 1) * 100, source: "Kraken" }
}

/**
 * { ethereum: { usd, change24h, source }, ... }. Binance 24 h tickers first (no per-IP quota to
 * speak of), then Coinbase for what Binance lacks or refuses (it is unavailable in some countries,
 * and halted pairs are skipped), then CoinGecko. Empty ids ("" = no price source) are ignored; a
 * coin no source knows is simply absent, so the UI shows no USD value rather than a wrong one.
 */
export async function getQuotes(ids: readonly (string | null | undefined)[], signal?: AbortSignal): Promise<Record<string, Quote>> {
  signal ??= quotePage?.signal
  signal?.throwIfAborted()
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  let out: Record<string, Quote> = {}
  if (!unique.length) return out
  try {
    out = await binanceQuotes(unique, signal)
  } catch (e) {
    if (signal?.aborted) throw e
  }
  let missing = unique.filter((id) => !out[id])
  if (missing.length) out = { ...out, ...(await coinbaseQuotes(missing, signal)) }
  missing = unique.filter((id) => !out[id])
  if (missing.includes("dai")) {
    try { out.dai = await krakenDaiQuote(signal) }
    catch (e) { if (signal?.aborted) throw e }
  }
  missing = unique.filter((id) => !out[id])
  if (missing.length) {
    try {
      out = { ...out, ...(await coingeckoQuotes(missing, signal)) }
    } catch (e) {
      // nothing at all is an error; a partial answer is still an answer
      if (signal?.aborted || !Object.keys(out).length) throw e
    }
  }
  return out
}

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number }
export type CandleRange = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL"

const RANGE: Record<CandleRange, { interval: string; limit: number }> = {
  "1H": { interval: "1m", limit: 60 },
  "ALL": { interval: "1w", limit: 300 },
  "1D": { interval: "15m", limit: 96 },
  "1W": { interval: "2h", limit: 84 },
  "1M": { interval: "8h", limit: 90 },
  "1Y": { interval: "3d", limit: 122 },
}

const INTERVAL_MS: Record<string, number> = { "1m": 60e3, "15m": 900e3, "2h": 7200e3, "8h": 28800e3, "3d": 259200e3, "1w": 604800e3 }

/** Coinbase granularity (s) and count per range: its API allows 60/300/900/3600/21600/86400 and ≤ 300 candles */
const COINBASE_RANGE: Record<CandleRange, { granularity: number; count: number }> = {
  "1H": { granularity: 60, count: 60 },
  "1D": { granularity: 900, count: 96 },
  "1W": { granularity: 3600, count: 168 },
  "1M": { granularity: 21600, count: 120 },
  "1Y": { granularity: 86400, count: 300 },
  ALL: { granularity: 86400, count: 300 },
}

const coinbaseProduct = (binanceSymbol: string) => binanceSymbol.replace(/USDT$/, "") + "-USD"

async function coinbaseCandles(symbol: string, range: CandleRange, signal?: AbortSignal): Promise<Candle[]> {
  const { granularity, count } = COINBASE_RANGE[range]
  const end = Math.floor(Date.now() / 1000)
  const start = end - granularity * count
  const url = `https://api.exchange.coinbase.com/products/${coinbaseProduct(symbol)}/candles?granularity=${granularity}&start=${start}&end=${end}`
  // [time s, low, high, open, close, volume], newest first
  const rows = await getJson<[number, number, number, number, number, number][]>(url, { source: "Coinbase", signal })
  return rows
    .map(([t, low, high, open, close, volume]) => ({ time: t * 1000, open, high, low, close, volume }))
    .sort((a, b) => a.time - b.time)
}

export async function getBinanceCandles(symbol: string, range: CandleRange, signal?: AbortSignal) {
  const { interval, limit } = RANGE[range]
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  const rows = await getJson<[number, string, string, string, string, string][]>(url, { source: "Binance", signal })
  return {
    step: INTERVAL_MS[interval],
    candles: rows.map(([time, o, h, l, c, v]) => ({ time, open: +o, high: +h, low: +l, close: +c, volume: +v })),
  }
}

/** price candles for a range: Binance, or Coinbase when Binance refuses or the pair is halted */
export async function getCandles(symbol: string, range: CandleRange, signal?: AbortSignal): Promise<Candle[]> {
  try {
    const { candles, step } = await getBinanceCandles(symbol, range, signal)
    const last = candles[candles.length - 1]
    // halted pairs return old candles: the last one must be within a few intervals of now
    if (last && Date.now() - last.time < 3 * step + STALE_MS) return candles
  } catch (e) {
    if (signal?.aborted) throw e
  }
  return coinbaseCandles(symbol, range, signal)
}

export type BookLevel = { price: number; size: number }
export type OrderBook = { bids: BookLevel[]; asks: BookLevel[]; source: "Binance" | "Coinbase"; at: number }

const toLevels = (rows: [string, string, ...unknown[]][]) => rows.map(([p, s]) => ({ price: +p, size: +s }))

/** top of the book, best prices first */
export async function getOrderBook(binanceSymbol: string, depth = 100, signal?: AbortSignal): Promise<OrderBook> {
  try {
    const url = `https://api.binance.com/api/v3/depth?symbol=${binanceSymbol}&limit=${depth}`
    const raw = await getJson<{ bids: [string, string][]; asks: [string, string][] }>(url, { source: "Binance", signal })
    // a halted pair answers 200 with an empty book: fall through to Coinbase
    if (!raw.bids.length || !raw.asks.length) throw new ApiError("Binance: торги этой парой остановлены", "Binance")
    return { bids: toLevels(raw.bids), asks: toLevels(raw.asks), source: "Binance", at: Date.now() }
  } catch (e) {
    if (signal?.aborted) throw e
    // ETHUSDT → ETH-USD on Coinbase
    const url = `https://api.exchange.coinbase.com/products/${coinbaseProduct(binanceSymbol)}/book?level=2`
    const raw = await getJson<{ bids: [string, string, number][]; asks: [string, string, number][] }>(url, {
      source: "Coinbase",
      signal,
    }).catch(() => {
      throw e instanceof ApiError ? e : new ApiError("Стакан заявок сейчас недоступен", "Binance")
    })
    return { bids: toLevels(raw.bids).slice(0, depth), asks: toLevels(raw.asks).slice(0, depth), source: "Coinbase", at: Date.now() }
  }
}
