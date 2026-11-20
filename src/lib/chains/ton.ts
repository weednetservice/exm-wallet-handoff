/** TON testnet through toncenter API v3 (public, rate limited without a key). */
import { getJson } from "../api/http"
import type { Network } from "./networks"
import type { Activity, ChainData } from "./types"

type Msg = { source: string | null; destination: string | null; value: string | null }
type TonTx = { hash: string; now: number; total_fees: string; in_msg: Msg | null; out_msgs: Msg[]; description?: { aborted?: boolean } }
type Book = Record<string, { user_friendly: string }>

/**
 * toncenter without an API key allows about one request per second: requests wait in one queue,
 * spaced 1.1 s apart, and a 429 is retried up to twice. An optional key (VITE_TONCENTER_KEY, free from
 * @tonapibot in Telegram) lifts the limit to 10 per second.
 */
const TON_KEY = (import.meta.env.VITE_TONCENTER_KEY as string | undefined) || ""
const SPACING = TON_KEY ? 120 : 1100
let lastCall = 0
let chain: Promise<unknown> = Promise.resolve()

/** every toncenter call of the app (reads and the signer) waits in this one queue */
function tonQueued<T>(url: string, signal?: AbortSignal, body?: unknown, beforeRequest?: () => void): Promise<T> {
  const headers: Record<string, string> = {}
  if (TON_KEY) headers["X-API-Key"] = TON_KEY
  if (body !== undefined) headers["Content-Type"] = "application/json"
  const init: RequestInit = body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) }
  const run = async (): Promise<T> => {
    const wait = lastCall + SPACING - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCall = Date.now()
    // a 429 comes from the rate limiter before the request is handled, so repeating it is safe, POSTs
    // included (and an external message can be applied only once: its seqno is spent after that)
    for (let attempt = 0; ; attempt++) {
      // A signed message may have waited behind reads or a 429 backoff. Recheck the
      // live vault immediately before every attempt, including the first POST.
      beforeRequest?.()
      try {
        return await getJson<T>(url, { source: "toncenter", signal, init })
      } catch (e) {
        if ((e as { status?: number })?.status !== 429 || attempt >= 2 || signal?.aborted) throw e
        await new Promise((r) => setTimeout(r, SPACING * (attempt + 1) + 300))
        lastCall = Date.now()
      }
    }
  }
  const next = chain.then(run, run)
  chain = next.catch(() => undefined)
  return next
}

/** GET through the shared 1 rps queue */
export const tonGet = <T>(url: string, signal?: AbortSignal) => tonQueued<T>(url, signal)
/** POST (JSON) through the shared 1 rps queue */
export const tonPost = <T>(url: string, body: unknown, signal?: AbortSignal, beforeRequest?: () => void) => tonQueued<T>(url, signal, body, beforeRequest)

/** toncenter v3 base of the TON test network */
export const TONCENTER_TESTNET_V3 = "https://testnet.toncenter.com/api/v3"

export type TonWalletInfo = { seqno: number | null; status: string; balance: string }

/** wallet state from toncenter v3: `seqno` is null until the wallet contract is deployed */
export async function tonWalletInfo(address: string, signal?: AbortSignal): Promise<TonWalletInfo> {
  const r = await tonGet<{ seqno?: number | null; status?: string; balance?: string }>(
    `${TONCENTER_TESTNET_V3}/walletInformation?address=${encodeURIComponent(address)}&use_v2=false`,
    signal,
  )
  let seqno = typeof r.seqno === "number" ? r.seqno : null
  if (seqno === null && r.status === "active") {
    // an active wallet the indexer does not parse: ask the contract itself
    const g = await tonPost<{ exit_code: number; stack?: { type: string; value: string }[] }>(
      `${TONCENTER_TESTNET_V3}/runGetMethod`,
      { address, method: "seqno", stack: [] },
      signal,
    )
    const top = g.stack?.[0]
    if (g.exit_code === 0 && top?.type === "num") seqno = Number(BigInt(top.value))
  }
  return { seqno, status: r.status ?? "uninit", balance: r.balance ?? "0" }
}

/** the transaction an external message started, by the message hash (base64), or null while not indexed */
export async function tonTransactionByMessage(msgHash: string, signal?: AbortSignal): Promise<{ hash: string; hex: string; aborted: boolean; outMessages: Msg[] } | null> {
  const r = await tonGet<{ transactions?: Pick<TonTx, "hash" | "description" | "out_msgs">[] }>(
    `${TONCENTER_TESTNET_V3}/transactionsByMessage?msg_hash=${encodeURIComponent(msgHash)}&direction=in&limit=1`,
    signal,
  )
  const tx = r.transactions?.[0]
  return tx ? { hash: tx.hash, hex: b64ToHex(tx.hash), aborted: tx.description?.aborted === true, outMessages: tx.out_msgs ?? [] } : null
}

/** toncenter hashes are base64; explorers want hex */
export const b64ToHex = (b64: string) =>
  Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")

export function tonData(network: Network): ChainData {
  const api = network.rpcUrl
  return {
    async getBalance(address, signal) {
      const acc = await tonGet<{ balance: string }>(`${api}/account?address=${encodeURIComponent(address)}`, signal).catch((e) => {
        // an address that never received coins does not exist yet: balance 0
        if (e?.status === 404) return { balance: "0" }
        throw e
      })
      return { network, address, native: BigInt(acc.balance), at: Date.now() }
    },

    async getActivity(address, signal) {
      const raw = await tonGet<{ transactions: TonTx[]; address_book: Book }>(
        `${api}/transactions?account=${encodeURIComponent(address)}&limit=15&sort=desc`,
        signal,
      )
      // address_book maps raw addresses ("0:abc…") to the user-friendly form people recognise
      const friendly = (addr?: string | null) => (addr ? (raw.address_book[addr]?.user_friendly ?? addr) : undefined)
      return raw.transactions.map((tx): Activity => {
        const outValue = tx.out_msgs.reduce((s, m) => s + BigInt(m.value ?? "0"), 0n)
        const inValue = BigInt(tx.in_msg?.value ?? "0")
        const direction = outValue > 0n ? "out" : inValue > 0n ? "in" : "self"
        const other = direction === "out" ? tx.out_msgs[0]?.destination : tx.in_msg?.source
        const hex = b64ToHex(tx.hash)
        return {
          id: tx.hash,
          hash: hex,
          direction,
          title: direction === "out" ? "Отправка" : direction === "in" ? "Получение" : "Операция",
          counterparty: friendly(other),
          amount: direction === "out" ? outValue : inValue,
          fee: BigInt(tx.total_fees || "0"),
          status: tx.description?.aborted ? "failed" : "confirmed",
          time: new Date(tx.now * 1000),
          network,
          explorerUrl: network.explorer.tx(hex),
        }
      })
    },

    validateAddress(address) {
      const a = address.trim()
      if (!a) return "Введите адрес"
      const userFriendly = /^[EUk0][Qf][A-Za-z0-9_-]{46}$/.test(a)
      const rawForm = /^-?\d+:[0-9a-fA-F]{64}$/.test(a)
      return userFriendly || rawForm ? null : "Это не похоже на адрес TON: 48 символов, обычно начинается с UQ, EQ, 0Q или kQ"
    },
  }
}
