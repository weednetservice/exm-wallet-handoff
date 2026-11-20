/**
 * The block clock: one live source of new blocks per network, shared by every component that shows
 * that network. A beat on screen exists only because this file saw the chain's height grow.
 *
 * Sources and request rates (all keyless, CORS-open, research/05-feasibility.md):
 *   EVM      WebSocket `eth_subscribe newHeads` (push, no polling); one `eth_blockNumber` at start.
 *            If the socket cannot open twice in a row: HTTP polling, period = half a block, 250 ms..4 s.
 *   Solana   WebSocket `slotSubscribe`; fallback `getSlot` every 500 ms.
 *   TON      toncenter `masterchainInfo` every 1.1 s (the keyless limit is about 1 request per second).
 *   Bitcoin  mempool.space `blocks/tip/height` every 20 s.
 * Beats are handed to the UI at most 4 times a second: blocks that arrive closer than 250 ms ride in one batch.
 * A hidden tab closes the socket and stops the timers; nothing runs for a network nobody is looking at.
 */
import { useSyncExternalStore } from "react"
import { netById, type Net } from "./networks"

export type Beat = {
  /** height of the newest block in the batch */
  h: number
  /** blocks in the batch: 1, or more when several arrived within 250 ms or one poll */
  n: number
  /** when this browser saw it, ms */
  at: number
}

export type ClockState = {
  /** connecting: no height yet · live · silent: no new block for too long · offline: the node does not answer */
  status: "connecting" | "live" | "silent" | "offline"
  height?: number
  /** when the height last grew (or was first read), ms */
  lastAt?: number
  beats: Beat[]
  via: "ws" | "poll"
}

const BATCH_MS = 250
const KEEP_BEATS = 90

/** toncenter without a key: one request per second, for the clock and for data.ts alike */
let tonNext = 0
export function tonSlot(): Promise<void> {
  const now = Date.now()
  const at = Math.max(now, tonNext)
  tonNext = at + 1100
  return new Promise((r) => setTimeout(r, at - now))
}

async function post<T>(url: string, method: string, params: unknown[], signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal,
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = (await r.json()) as { result?: T; error?: { message?: string } }
  if (j.error || j.result === undefined) throw new Error(j.error?.message ?? "пустой ответ")
  return j.result
}
export const rpc = post

export async function fetchHeight(net: Net, signal?: AbortSignal): Promise<number> {
  if (net.family === "evm") return parseInt(await post<string>(net.http, "eth_blockNumber", [], signal), 16)
  if (net.family === "solana") return post<number>(net.http, "getSlot", [{ commitment: "processed" }], signal)
  if (net.family === "ton") {
    await tonSlot()
    const r = await fetch(`${net.http}/masterchainInfo`, { signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return ((await r.json()) as { last: { seqno: number } }).last.seqno
  }
  const r = await fetch(`${net.http}/blocks/tip/height`, { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return Number(await r.text())
}

/** how long a network may stay without a new block before the screen says so */
export function silenceLimit(net: Net, tempo?: number) {
  if (net.family === "bitcoin") return Infinity
  return Math.max(20_000, (tempo ?? 0) * 4000)
}

class Clock {
  state: ClockState = { status: "connecting", beats: [], via: "poll" }
  private listeners = new Set<() => void>()
  private stopSource: (() => void) | null = null
  private pending: number | null = null
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private lastFlush = 0
  private watchdog: ReturnType<typeof setInterval> | undefined
  private stopTimer: ReturnType<typeof setTimeout> | undefined
  private failures = 0
  /** after a pause the first height only resets the counter: the blocks missed while hidden are not replayed */
  private fresh = true

  constructor(
    private net: Net,
    private tempo?: number,
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    clearTimeout(this.stopTimer)
    if (!this.stopSource && !document.hidden) this.start()
    document.addEventListener("visibilitychange", this.onVisibility)
    return () => {
      this.listeners.delete(fn)
      if (this.listeners.size === 0) {
        // a short grace: moving between two screens that show the same network keeps one socket
        this.stopTimer = setTimeout(() => {
          if (this.listeners.size > 0) return
          this.stop()
          document.removeEventListener("visibilitychange", this.onVisibility)
          clocks.delete(this.net.id)
        }, 400)
      }
    }
  }

  private onVisibility = () => {
    if (document.hidden) this.stop()
    else if (this.listeners.size > 0 && !this.stopSource) this.start()
  }

  private set(patch: Partial<ClockState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  private start() {
    this.fresh = true
    this.failures = 0
    const abort = new AbortController()
    const stops: (() => void)[] = [() => abort.abort()]
    const { net } = this

    const pollEvery = (ms: number) => {
      let timer: ReturnType<typeof setTimeout>
      let dead = false
      const tick = async () => {
        try {
          this.observe(await fetchHeight(net, abort.signal))
          this.failures = 0
        } catch {
          if (dead) return
          if (++this.failures >= 2 && this.state.status !== "offline") this.set({ status: "offline" })
        }
        if (!dead) timer = setTimeout(tick, ms)
      }
      tick()
      stops.push(() => {
        dead = true
        clearTimeout(timer)
      })
    }

    if (net.ws) {
      this.set({ via: "ws" })
      // the height right away, so a 12-second network does not sit on "connecting" until its next block
      fetchHeight(net, abort.signal).then(
        (h) => this.observe(h),
        () => {
          if (this.state.height === undefined && !abort.signal.aborted) this.set({ status: "offline" })
        },
      )
      let socket: WebSocket | null = null
      let closed = false
      let opensFailed = 0
      let retry: ReturnType<typeof setTimeout>
      const open = () => {
        let opened = false
        socket = new WebSocket(net.ws!)
        socket.onopen = () => {
          opened = true
          opensFailed = 0
          socket!.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: net.family === "solana" ? "slotSubscribe" : "eth_subscribe", params: net.family === "solana" ? [] : ["newHeads"] }))
        }
        socket.onmessage = (e) => {
          try {
            const m = JSON.parse(String(e.data)) as { method?: string; params?: { result?: { number?: string; slot?: number } } }
            const r = m.method ? m.params?.result : undefined
            if (!r) return
            const h = r.slot ?? (r.number ? parseInt(r.number, 16) : NaN)
            if (Number.isFinite(h)) this.observe(h)
          } catch {
            /* not a notification */
          }
        }
        socket.onclose = () => {
          if (closed) return
          if (!opened && ++opensFailed >= 2) {
            // sockets are blocked here: fall back to asking for the height
            this.set({ via: "poll" })
            pollEvery(net.family === "solana" ? 500 : Math.min(4000, Math.max(250, (this.tempo ?? 2) * 500)))
            return
          }
          retry = setTimeout(open, opened ? 1000 : 2000)
        }
      }
      open()
      stops.push(() => {
        closed = true
        clearTimeout(retry)
        socket?.close()
      })
    } else {
      this.set({ via: "poll" })
      pollEvery(net.family === "ton" ? 0 : 20_000) // TON: tonSlot() already spaces the calls 1.1 s apart
    }

    this.watchdog = setInterval(() => {
      const { status, lastAt } = this.state
      if (lastAt === undefined || status === "connecting" || status === "offline") return
      const next = Date.now() - lastAt > silenceLimit(net, this.tempo) ? "silent" : "live"
      if (next !== status) this.set({ status: next })
    }, 1000)
    stops.push(() => clearInterval(this.watchdog))
    this.stopSource = () => stops.forEach((s) => s())
  }

  private stop() {
    this.stopSource?.()
    this.stopSource = null
    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    this.pending = null
  }

  private observe(h: number) {
    const now = Date.now()
    if (this.state.height === undefined || this.fresh) {
      this.fresh = false
      if (this.state.height !== undefined && h <= this.state.height) return this.set({ status: "live" })
      return this.set({ height: h, lastAt: now, status: "live" })
    }
    if (h <= Math.max(this.state.height, this.pending ?? 0)) {
      if (this.state.status === "offline") this.set({ status: "live" })
      return
    }
    this.pending = h
    if (this.flushTimer === undefined) this.flushTimer = setTimeout(this.flush, Math.max(0, BATCH_MS - (now - this.lastFlush)))
  }

  private flush = () => {
    this.flushTimer = undefined
    const h = this.pending
    if (h === null || this.state.height === undefined) return
    this.pending = null
    const now = Date.now()
    this.lastFlush = now
    const beats = [...this.state.beats, { h, n: h - this.state.height, at: now }]
    this.set({ height: h, lastAt: now, status: "live", beats: beats.slice(-KEEP_BEATS) })
  }
}

const clocks = new Map<string, Clock>()
const IDLE: ClockState = { status: "connecting", beats: [], via: "poll" }
const noop = () => () => {}

/** The live clock of one network; `null` listens to nothing. `tempo` (s per block) only tunes the silence limit and the fallback period. */
export function useClock(netId: string | null, tempo?: number): ClockState {
  let clock: Clock | undefined
  if (netId) {
    clock = clocks.get(netId)
    if (!clock) {
      clock = new Clock(netById(netId), tempo)
      clocks.set(netId, clock)
    }
  }
  const c = clock
  return useSyncExternalStore(c ? c.subscribe : noop, () => (c ? c.state : IDLE))
}
