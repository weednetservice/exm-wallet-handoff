/**
 * What the screens know about the wallet: balances of the demo addresses, reference prices, the measured
 * tempo of every network and the fee of a plain transfer. Starts from the dated snapshot (snapshot.ts) and
 * replaces it with live answers, once per page load: about 36 requests in total, then silence.
 */
import { useSyncExternalStore } from "react"
import { rpc, tonSlot } from "./clock"
import { NETS, type Net } from "./networks"
import { SNAPSHOT_BALANCES, SNAPSHOT_PRICES, SNAPSHOT_TEMPO } from "./snapshot"

export type Price = { usd: number; change24h: number }
export type WalletData = {
  balances: Record<string, bigint>
  prices: Record<string, Price>
  /** seconds per block; a network without a steady rhythm (Bitcoin testnet4) has no entry */
  tempo: Record<string, number>
  /** loading: the first live pass is running · live: every answer is fresh · partial: `stale` lists what kept the snapshot */
  phase: "loading" | "live" | "partial"
  stale: string[]
}

let data: WalletData = {
  balances: Object.fromEntries(NETS.map((n) => [n.id, BigInt(SNAPSHOT_BALANCES[n.id] ?? "0")])),
  prices: SNAPSHOT_PRICES,
  tempo: SNAPSHOT_TEMPO,
  phase: "loading",
  stale: [],
}
const listeners = new Set<() => void>()
const emit = (patch: Partial<WalletData>) => {
  data = { ...data, ...patch }
  listeners.forEach((fn) => fn())
}

const signal = () => AbortSignal.timeout(12_000)

async function balanceOf(net: Net): Promise<bigint> {
  if (!net.address) return 0n
  if (net.family === "evm") return BigInt(await rpc<string>(net.http, "eth_getBalance", [net.address, "latest"], signal()))
  if (net.family === "solana") return BigInt((await rpc<{ value: number }>(net.http, "getBalance", [net.address], signal())).value)
  await tonSlot()
  const r = await fetch(`${net.http}/addressInformation?address=${encodeURIComponent(net.address)}&use_v2=false`, { signal: signal() })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return BigInt(((await r.json()) as { balance: string }).balance)
}

/** seconds per block from the chain's own timestamps, not from our clock */
async function tempoOf(net: Net): Promise<number | undefined> {
  if (net.family === "evm") {
    const span = (SNAPSHOT_TEMPO[net.id] ?? 2) >= 5 ? 50 : 200
    type B = { number: string; timestamp: string }
    const head = await rpc<B>(net.http, "eth_getBlockByNumber", ["latest", false], signal())
    const n = parseInt(head.number, 16)
    const back = await rpc<B>(net.http, "eth_getBlockByNumber", ["0x" + (n - span).toString(16), false], signal())
    return (parseInt(head.timestamp, 16) - parseInt(back.timestamp, 16)) / span
  }
  if (net.family === "solana") {
    const s = await rpc<{ numSlots: number; samplePeriodSecs: number }[]>(net.http, "getRecentPerformanceSamples", [3], signal())
    return s.reduce((a, x) => a + x.samplePeriodSecs, 0) / s.reduce((a, x) => a + x.numSlots, 0)
  }
  if (net.family === "ton") {
    await tonSlot()
    const r = await fetch(`${net.http}/blocks?workchain=-1&limit=100&sort=desc`, { signal: signal() })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const b = ((await r.json()) as { blocks: { gen_utime: string }[] }).blocks
    return (Number(b[0].gen_utime) - Number(b[b.length - 1].gen_utime)) / (b.length - 1)
  }
  return undefined
}

/** CoinGecko without a key allows a few calls a minute: one answer serves every reload for 90 s */
const PRICE_KEY = "eb-prices"
async function pricesNow(): Promise<Record<string, Price>> {
  try {
    const c = JSON.parse(sessionStorage.getItem(PRICE_KEY) ?? "null") as { at: number; prices: Record<string, Price> } | null
    if (c && Date.now() - c.at < 90_000) return c.prices
  } catch {
    /* no storage: ask */
  }
  const prices = await pricesFresh()
  try {
    sessionStorage.setItem(PRICE_KEY, JSON.stringify({ at: Date.now(), prices }))
  } catch {
    /* no storage: fine */
  }
  return prices
}
async function pricesFresh(): Promise<Record<string, Price>> {
  const ids = [...new Set(NETS.map((n) => n.cg))].join(",")
  const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, { signal: signal() })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = (await r.json()) as Record<string, { usd: number; usd_24h_change: number }>
  return Object.fromEntries(Object.entries(j).map(([id, q]) => [id, { usd: q.usd, change24h: q.usd_24h_change }]))
}

let started = false
export async function refresh() {
  emit({ phase: "loading" })
  const stale: string[] = []
  const balances = { ...data.balances }
  const tempo = { ...data.tempo }
  let prices = data.prices
  await Promise.all([
    ...NETS.map(async (net) => {
      // a public node may refuse one call (429): one more try after a pause, then the snapshot stays
      for (let attempt = 0; ; attempt++) {
        try {
          const [b, t] = await Promise.all([balanceOf(net), tempoOf(net)])
          balances[net.id] = b
          if (t !== undefined && Number.isFinite(t) && t > 0) tempo[net.id] = t
          return
        } catch {
          if (attempt === 1) return void stale.push(net.name)
          await new Promise((r) => setTimeout(r, 2500))
        }
      }
    }),
    pricesNow().then(
      (p) => {
        prices = { ...prices, ...p }
      },
      () => {
        stale.push("курс")
      },
    ),
  ])
  emit({ balances, tempo, prices, stale, phase: stale.length ? "partial" : "live" })
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  if (!started) {
    started = true
    refresh()
  }
  return () => listeners.delete(fn)
}

export function useWallet(): WalletData {
  return useSyncExternalStore(subscribe, () => data)
}

/** the fee of a plain transfer in the coin's base units, or null where it is only known at signing (TON) */
export async function feeOf(net: Net): Promise<bigint | null> {
  if (net.family === "evm") {
    const price = BigInt(await rpc<string>(net.http, "eth_gasPrice", [], signal()))
    // the node's own estimate: Sepolia answers 15 000, ZKsync far more than 21 000 (05 §1.1)
    const gas = await rpc<string>(net.http, "eth_estimateGas", [{ from: net.address, to: net.address, value: "0x0" }], signal()).then(BigInt, () => 21_000n)
    return price * gas
  }
  // Solana: 5 000 lamports per signature, fixed by the protocol
  if (net.family === "solana") return 5000n
  if (net.family === "bitcoin") {
    const r = await fetch(`${net.http}/v1/fees/recommended`, { signal: signal() })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    // a one-input, two-output native SegWit transfer is 141 vB
    return BigInt(Math.ceil(((await r.json()) as { fastestFee: number }).fastestFee * 141))
  }
  return null
}
