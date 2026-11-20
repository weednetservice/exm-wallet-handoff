/**
 * Market data for the "Рынок" tab: the coins the wallet supports, their price history and order book.
 *
 * Binance first for actively traded pairs, Coinbase when a pair is stale, and Kraken for DAI/USD.
 * A halted exchange pair may still return old candles with HTTP 200, so every series is checked
 * against the current time before display.
 */
import { useQuery } from "@tanstack/react-query"
import { NETWORKS, tokensOf } from "@/lib/chains"
import { getBinanceCandles, getOrderBook, type BookLevel } from "@/lib/api/market"
import type { ChartRange } from "./format"
import { ApiError, getJson } from "@/lib/api/http"
import { useQuotes } from "../data"

export type Coin = {
  /** CoinGecko id, the key of `useQuotes()` */
  id: string
  symbol: string
  name: string
  binanceSymbol: string
}

/** market names: CoinGecko and exchanges call the coin of Ethereum "Ethereum", of TON "Toncoin" */
const NAMES: Record<string, string> = { ethereum: "Ethereum", solana: "Solana", "the-open-network": "Toncoin" }

/** one row per coin: Sepolia and Base Sepolia both hold ETH */
const nativeCoins: Coin[] = NETWORKS.filter((n, i) => NETWORKS.findIndex((m) => m.coingeckoId === n.coingeckoId) === i).map((n) => ({
  id: n.coingeckoId,
  symbol: n.native.symbol,
  name: NAMES[n.coingeckoId] ?? n.native.name,
  binanceSymbol: n.binanceSymbol,
}))
const ethereum = NETWORKS.find((network) => network.id === "ethereum-mainnet")!
const marketTokens = tokensOf(ethereum).map((token) => ({ id: token.coingeckoId, symbol: token.symbol, name: token.name, binanceSymbol: token.binanceSymbol }))
export const COINS: Coin[] = [nativeCoins[0], ...marketTokens, ...nativeCoins.slice(1)]
/** The market also lists coins that EXM currently exposes only on test networks. */
export const MAINNET_COIN_IDS = new Set([
  ...NETWORKS.filter((network) => network.environment === "mainnet").map((network) => network.coingeckoId),
  ...marketTokens.map((token) => token.id),
])

/* ------------------------------------------------------------------ price history */

export type PricePoint = { time: number; value: number }
export type PriceSeries = {
  /** close prices, oldest first; `time` is the close time of each candle */
  points: PricePoint[]
  /** open of the first candle: the start of the range */
  open: number
  complete: boolean
  source: "Binance" | "Coinbase" | "Kraken"
  pair: string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const RANGE_MS: Record<ChartRange, number> = { "1D": DAY, "1W": 7 * DAY, "1M": 30 * DAY, "1Y": 365 * DAY }
const COINBASE_SECONDS: Record<ChartRange, number> = { "1D": 900, "1W": 3600, "1M": 21600, "1Y": 86400 }
const KRAKEN_MINUTES: Record<ChartRange, number> = { "1D": 15, "1W": 60, "1M": 240, "1Y": 1440 }

type SeriesCandle = { time: number; open: number; close: number }

function candleSeries(candles: SeriesCandle[], step: number, range: ChartRange, now: number, source: PriceSeries["source"], pair: string): PriceSeries {
  const cutoff = now - RANGE_MS[range]
  const byStart = new Map<number, SeriesCandle>()
  for (const candle of candles) {
    if (Number.isSafeInteger(candle.time) && candle.time + step > cutoff && candle.time <= now &&
        Number.isFinite(candle.open) && candle.open > 0 && Number.isFinite(candle.close) && candle.close > 0) {
      byStart.set(candle.time, candle)
    }
  }
  const sorted = [...byStart.values()].sort((a, b) => a.time - b.time)
  if (sorted.length < 2 || sorted[sorted.length - 1].time < now - 3 * step ||
      sorted.some((candle, index) => index > 0 && candle.time - sorted[index - 1].time < step)) {
    throw new ApiError(`${source}: нет свежих данных за выбранный период`, source)
  }
  // Only the current bucket can close at `now`. Overlapping starts would collapse multiple points onto it.
  const byClose = new Map(sorted.map((candle) => [Math.min(candle.time + step, now), candle.close]))
  const points = [...byClose].map(([time, value]) => ({ time, value }))
  if (points.length < 2) throw new ApiError(`${source}: нет свежих данных за выбранный период`, source)
  const complete = points[points.length - 1].time - points[0].time >= RANGE_MS[range] - 2 * step
  return { points, open: sorted[0].open, source, pair, complete }
}

export async function loadSeries(coin: Coin, range: ChartRange, signal?: AbortSignal): Promise<PriceSeries> {
  // DAI's Binance/Coinbase pairs are delisted or stale. Kraken has a live DAI/USD book.
  if (coin.id === "dai") {
    const minutes = KRAKEN_MINUTES[range]
    const raw = await getJson<{ error: string[]; result: { DAIUSD?: (string | number)[][] } }>(`https://api.kraken.com/0/public/OHLC?pair=DAIUSD&interval=${minutes}`, { source: "Kraken", signal })
    if (raw.error?.length) throw new ApiError("Курс DAI сейчас недоступен", "Kraken")
    const candles = raw.result?.DAIUSD?.map((row) => ({ time: Number(row[0]) * 1000, open: Number(row[1]), close: Number(row[4]) })) ?? []
    return candleSeries(candles, minutes * MINUTE, range, Date.now(), "Kraken", "DAI/USD")
  }
  let binanceError: unknown
  try {
    const { candles, step } = await getBinanceCandles(coin.binanceSymbol, range, signal)
    return candleSeries(candles, step, range, Date.now(), "Binance", `${coin.symbol}/USDT`)
  } catch (e) {
    if (signal?.aborted) throw e
    binanceError = e
  }
  try {
    return await coinbaseSeries(coin.symbol, range, signal)
  } catch (e) {
    if (signal?.aborted) throw e
    // both reasons, e.g. "На Binance пара TON/USDT сейчас не торгуется. Coinbase: нет свежих свечей."
    const binance = binanceError instanceof Error ? binanceError.message : `На Binance пара ${coin.symbol}/USDT сейчас не торгуется`
    const coinbase = e instanceof Error ? e.message : "Coinbase не ответил"
    throw new ApiError(`${binance}. ${coinbase}.`, "Coinbase")
  }
}

async function coinbaseSeries(symbol: string, range: ChartRange, signal?: AbortSignal): Promise<PriceSeries> {
  const granularity = COINBASE_SECONDS[range]
  const step = granularity * 1000
  const end = Date.now()
  // Allow for the current partial bucket and the shared boundary between requests.
  const chunk = 299 * step
  const requests: Promise<[number, number, number, number, number, number][]>[] = []
  for (let from = end - RANGE_MS[range]; from < end; from += chunk) {
    const to = Math.min(end, from + chunk)
    const url =
      `https://api.exchange.coinbase.com/products/${symbol}-USD/candles?granularity=${granularity}` +
      `&start=${new Date(from).toISOString()}&end=${new Date(to).toISOString()}`
    requests.push(getJson(url, { source: "Coinbase", signal }))
  }
  const candles = (await Promise.all(requests)).flat().map(([time, , , open, close]) => ({ time: time * 1000, open, close }))
  return candleSeries(candles, step, range, end, "Coinbase", `${symbol}-USD`)
}

/** price history of one coin; the list's sparklines share the "1D" entry with the coin screen */
export function useSeries(coin: Coin, range: ChartRange) {
  return useQuery({
    queryKey: ["series", coin.id, range],
    queryFn: ({ signal }) => loadSeries(coin, range, signal),
    refetchInterval: range === "1D" ? 60_000 : 5 * 60_000,
    staleTime: range === "1D" ? 50_000 : 4 * 60_000,
  })
}

/* ------------------------------------------------------------------ price of a coin */

export type CoinQuote = { usd: number; change24h?: number; source: string }

export function formatMarketSavedTime(at: number, now = Date.now()) {
  const saved = new Date(at)
  const today = new Date(now)
  const sameDay = saved.getFullYear() === today.getFullYear() && saved.getMonth() === today.getMonth() && saved.getDate() === today.getDate()
  return new Intl.DateTimeFormat("ru-RU", {
    ...(!sameDay ? { day: "numeric" as const, month: "short" as const, ...(saved.getFullYear() !== today.getFullYear() ? { year: "numeric" as const } : {}) } : {}),
    hour: "2-digit", minute: "2-digit",
  }).format(saved)
}

/**
 * The price shown for a coin. `useQuotes` (shared with Кошелёк) asks CoinGecko and, when CoinGecko
 * refuses, falls back to Binance's 24 h ticker. For a pair Binance has halted that ticker is frozen
 * (TON/USDT still reports $1.60 from July 2026 while the market trades near $1.08), so a Binance
 * quote is only used when Binance's own candles for the coin are live. Otherwise the price and
 * 24 h change come from the day series of the exchange that does trade the coin, named as the source.
 */
export function useCoinQuote(coin: Coin) {
  const quotes = useQuotes()
  const day = useSeries(coin, "1D")
  const q = quotes.data?.[coin.id]
  let quote: CoinQuote | undefined
  let updatedAt: number | undefined
  let refreshError: Error | null = null
  let fromDay = false
  if (q && (q.source !== "Binance" || day.data?.source === "Binance")) {
    quote = q
    updatedAt = quotes.dataUpdatedAt
    refreshError = quotes.error
  }
  else if (day.data && day.data.points.length > 1) {
    // Use fresh exchange candles when a ticker is stale or the quote service is unavailable.
    const last = day.data.points[day.data.points.length - 1].value
    quote = { usd: last, change24h: day.data.complete ? ((last - day.data.open) / day.data.open) * 100 : undefined, source: day.data.source }
    updatedAt = day.dataUpdatedAt
    refreshError = day.error
    fromDay = true
  }
  const pending = !quote && (quotes.isPending || day.isPending)
  const error = !quote && !pending ? (quotes.error ?? day.error ?? null) : null
  return { quote, pending, error, updatedAt, refreshError, refetch: () => { if (fromDay) void day.refetch(); else void quotes.refetch() } }
}

/* ------------------------------------------------------------------ order book */

export type DepthLevel = { price: number; size: number; total: number }
export type DepthBook = {
  mid: number
  spread: number
  /** best (highest) bucket first, cumulative `total` */
  bids: DepthLevel[]
  /** best (lowest) bucket first, cumulative `total` */
  asks: DepthLevel[]
  /** price step of one bucket */
  step: number
  source: "Binance" | "Coinbase"
  pair: string
  at: number
}

/** buckets per side and the share of the mid price they aim to cover on each side */
const LEVELS = 16
const WINDOW = 0.005

/** largest 1 / 2 / 5 × 10^k not above `raw` */
function stepBelow(raw: number) {
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const r = raw / magnitude
  return (r >= 5 ? 5 : r >= 2 ? 2 : 1) * magnitude
}

const decimalsOf = (step: number) => Math.max(0, Math.ceil(-Math.log10(step) - 1e-9))

/**
 * Group raw levels into `LEVELS` price buckets per side, the way exchanges aggregate a book:
 * a bid bucket k holds prices in [k·step, (k+1)·step) and is drawn at its lower edge, an ask bucket
 * holds (k−1)·step .. k·step and is drawn at its upper edge, so `total` is exactly the size resting
 * between the best price and the drawn price. A bucket the fetched levels don't reach past is dropped
 * rather than shown half full.
 */
export function bucketBook(bids: BookLevel[], asks: BookLevel[]) {
  const bestBid = bids[0].price
  const bestAsk = asks[0].price
  const mid = (bestBid + bestAsk) / 2
  const step = stepBelow((mid * WINDOW) / LEVELS)
  const digits = decimalsOf(step)
  const eps = 1e-9

  const side = (levels: BookLevel[], dir: -1 | 1): DepthLevel[] => {
    const key = (p: number) => (dir < 0 ? Math.floor(p / step + eps) : Math.ceil(p / step - eps))
    const sizes = new Map<number, number>()
    for (const l of levels) sizes.set(key(l.price), (sizes.get(key(l.price)) ?? 0) + l.size)
    const edge = levels[levels.length - 1].price
    const first = key(levels[0].price)
    const out: DepthLevel[] = []
    let total = 0
    for (let i = 0; i < LEVELS; i++) {
      const k = first + dir * i
      const price = Number((k * step).toFixed(digits))
      const covered = dir < 0 ? edge < price : edge > price
      if (!covered) break
      total += sizes.get(k) ?? 0
      out.push({ price, size: sizes.get(k) ?? 0, total })
    }
    return out
  }

  return { mid, spread: bestAsk - bestBid, step, bids: side(bids, -1), asks: side(asks, 1) }
}

export async function loadBook(coin: Coin, signal?: AbortSignal): Promise<DepthBook> {
  // 500 levels: about ±0.5 % of the price on ETH/USDT (request weight 25 of Binance's 6000 a minute)
  let raw: { bids: BookLevel[]; asks: BookLevel[]; source: "Binance" | "Coinbase"; at: number } = await getOrderBook(
    coin.binanceSymbol,
    500,
    signal,
  )
  if (raw.source === "Binance" && (!raw.bids.length || !raw.asks.length)) {
    const cb = await getJson<{ bids: [string, string, number][]; asks: [string, string, number][] }>(
      `https://api.exchange.coinbase.com/products/${coin.symbol}-USD/book?level=2`,
      { source: "Coinbase", signal },
    ).catch((e: unknown) => {
      if (signal?.aborted) throw e
      throw new ApiError(
        `На Binance стакан ${coin.symbol}/USDT пуст. ${e instanceof Error ? e.message : "Coinbase не ответил"}.`,
        "Coinbase",
      )
    })
    const levels = (rows: [string, string, number][]) => rows.map(([p, s]) => ({ price: +p, size: +s }))
    raw = { bids: levels(cb.bids), asks: levels(cb.asks), source: "Coinbase", at: Date.now() }
  }
  const pair = raw.source === "Binance" ? `${coin.symbol}/USDT` : `${coin.symbol}-USD`
  if (!raw.bids.length || !raw.asks.length) {
    return { mid: NaN, spread: NaN, bids: [], asks: [], step: NaN, source: raw.source, pair, at: raw.at }
  }
  return { ...bucketBook(raw.bids, raw.asks), source: raw.source, pair, at: raw.at }
}

/** live book of the open coin: every 5 s while the coin screen is on screen */
export function useBook(coin: Coin) {
  return useQuery({
    queryKey: ["book", coin.id],
    queryFn: ({ signal }) => loadBook(coin, signal),
    refetchInterval: 5_000,
    staleTime: 4_000,
  })
}
