/**
 * Prediction markets from Polymarket's public read API (Gamma for markets, CLOB for price history).
 * Read only: the wallet shows real markets and odds; placing bets is not part of a testnet wallet.
 */
import { getJson } from "./http"

export type Outcome = { name: string; price: number; tokenId?: string }

export type PredictionMarket = {
  id: string
  question: string
  /** event title, e.g. "What price will Bitcoin hit in November?" */
  event: string
  slug: string
  image?: string
  outcomes: Outcome[]
  volume24h: number
  volume: number
  endDate?: string
  url: string
}

type GammaMarket = {
  id: string
  question: string
  slug: string
  image?: string
  icon?: string
  outcomes?: string
  outcomePrices?: string
  clobTokenIds?: string
  volume24hr?: number
  volumeNum?: number
  endDate?: string
  active?: boolean
  closed?: boolean
}
type GammaEvent = { id: string; title: string; slug: string; image?: string; markets?: GammaMarket[] }

const parseList = (s?: string): string[] => {
  try {
    const v = JSON.parse(s ?? "[]")
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

/** busiest open markets for a Polymarket tag ("crypto" by default), one market per event */
export async function getMarkets(tag = "crypto", limit = 12, signal?: AbortSignal): Promise<PredictionMarket[]> {
  const url =
    `https://gamma-api.polymarket.com/events?tag_slug=${encodeURIComponent(tag)}` +
    `&active=true&closed=false&order=volume24hr&ascending=false&limit=${limit}`
  const events = await getJson<GammaEvent[]>(url, { source: "Polymarket", signal })
  const out: PredictionMarket[] = []
  for (const ev of events) {
    const live = (ev.markets ?? []).filter((m) => m.active !== false && !m.closed)
    const m = live.sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0))[0]
    if (!m) continue
    const names = parseList(m.outcomes)
    const prices = parseList(m.outcomePrices).map(Number)
    const tokens = parseList(m.clobTokenIds)
    if (!names.length || names.length !== prices.length) continue
    out.push({
      id: m.id,
      question: m.question,
      event: ev.title,
      slug: m.slug,
      image: m.image || m.icon || ev.image,
      outcomes: names.map((name, i) => ({ name, price: prices[i], tokenId: tokens[i] })),
      volume24h: m.volume24hr ?? 0,
      volume: m.volumeNum ?? 0,
      endDate: m.endDate,
      url: `https://polymarket.com/event/${ev.slug}`,
    })
  }
  return out
}

/** price of one outcome over time, 0..1 */
export async function getPriceHistory(tokenId: string, interval: "1d" | "1w" | "1m" | "max" = "1w", signal?: AbortSignal) {
  const fidelity = interval === "1d" ? 10 : interval === "1w" ? 60 : 360
  const url = `https://clob.polymarket.com/prices-history?market=${tokenId}&interval=${interval}&fidelity=${fidelity}`
  const raw = await getJson<{ history: { t: number; p: number }[] }>(url, { source: "Polymarket", signal })
  return raw.history.map((h) => ({ time: h.t * 1000, price: h.p }))
}
