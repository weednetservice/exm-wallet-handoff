/** Solana over public JSON-RPC: balance, recent signatures and their SOL deltas. */
import { ApiError, getJson, rpc } from "../api/http"
import { base58 } from "@scure/base"
import type { Network } from "./networks"
import type { Token } from "./tokens"
import type { Activity, ChainData } from "./types"

type Sig = { signature: string; blockTime: number | null; err: unknown; confirmationStatus?: string }
type Tx = {
  meta: { fee: number; preBalances: number[]; postBalances: number[]; err: unknown } | null
  transaction: { message: { accountKeys: (string | { pubkey: string })[] } }
} | null

const key = (k: string | { pubkey: string }) => (typeof k === "string" ? k : k.pubkey)

export function solanaData(network: Network): ChainData {
  const source = "Solana " + network.testnetName
  return {
    async getBalance(address, signal) {
      const r = await rpc<{ value: number }>(network.rpcUrl, "getBalance", [address, { commitment: "confirmed" }], { source, signal })
      return { network, address, native: BigInt(r.value), at: Date.now() }
    },

    async getActivity(address, signal) {
      // Shared RPCs can limit getTransaction calls even inside a single HTTP batch.
      const sigs = await rpc<Sig[]>(network.rpcUrl, "getSignaturesForAddress", [address, { limit: 8 }], { source, signal })
      if (!sigs.length) return []
      const byId = new Map<number, Tx>()
      if (network.id === "solana-mainnet") {
        // PublicNode accepts at most one getTransaction per HTTP request without an API token.
        for (let i = 0; i < sigs.length; i++) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const tx = await rpc<Tx>(network.rpcUrl, "getTransaction", [
                sigs[i].signature, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" },
              ], { source, signal })
              byId.set(i, tx)
              break
            } catch (e) {
              if (!(e instanceof ApiError) || (e.status !== 429 && e.rpcCode !== 429) || attempt === 2) throw e
              await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1800))
            }
          }
        }
      } else {
        let pending = sigs.map((_, i) => i)
        for (let attempt = 0; pending.length && attempt < 3; attempt++) {
          if (attempt) await new Promise((resolve) => setTimeout(resolve, attempt * 1800))
          const requests = pending.map((i) => ({
            jsonrpc: "2.0", id: i, method: "getTransaction",
            params: [sigs[i].signature, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }],
          }))
          let batch: { id?: number; result?: Tx; error?: { code?: number; message: string } }[]
          try {
            batch = await getJson<typeof batch>(network.rpcUrl, {
              source, signal, init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requests) },
            })
          } catch (e) {
            if (!(e instanceof ApiError) || e.status !== 429 || attempt === 2) throw e
            continue
          }
          if (!Array.isArray(batch)) throw new ApiError(`${source}: неожиданный ответ истории`, source)
          for (const item of batch) {
            if (typeof item.id !== "number" || !pending.includes(item.id)) continue
            if (item.error?.code === 429) continue
            if (item.error) throw new ApiError(`${source}: ${item.error.message}`, source, undefined, item.error.code)
            byId.set(item.id, item.result ?? null)
          }
          // JSON-RPC batch replies can be shuffled or partial. Retry only the 429/missing ids.
          pending = pending.filter((id) => !byId.has(id))
        }
        if (pending.length) throw new ApiError(`${source}: история временно ограничена узлом (429)`, source, 429)
      }
      return sigs.map((s, i): Activity => {
        const tx = byId.get(i)
        const keys = tx?.transaction.message.accountKeys.map(key) ?? []
        const me = keys.indexOf(address)
        const delta = tx?.meta && me >= 0 ? tx.meta.postBalances[me] - tx.meta.preBalances[me] : 0
        const fee = tx?.meta?.fee ?? 0
        // the fee payer (index 0) pays the fee: take it out to show the transferred amount
        const moved = me === 0 ? delta + fee : delta
        const direction = moved < 0 ? "out" : moved > 0 ? "in" : "self"
        const other = keys.find((k, idx) => idx !== me && idx < 3 && k !== "11111111111111111111111111111111")
        return {
          id: s.signature,
          hash: s.signature,
          direction,
          title: direction === "out" ? "Отправка" : direction === "in" ? "Получение" : "Вызов программы",
          counterparty: other,
          amount: BigInt(Math.abs(moved)),
          fee: me === 0 ? BigInt(fee) : undefined,
          status: s.err ? "failed" : s.confirmationStatus === "processed" ? "pending" : "confirmed",
          time: s.blockTime ? new Date(s.blockTime * 1000) : undefined,
          network,
          explorerUrl: network.explorer.tx(s.signature),
        }
      })
    },

    /** SPL balance: the sum over the owner's token accounts for this mint (usually one) */
    async getTokenBalance(address: string, token: Token, signal?: AbortSignal) {
      type Parsed = { account: { data: { parsed?: { info?: { tokenAmount?: { amount: string } } } } } }
      const r = await rpc<{ value: Parsed[] }>(
        network.rpcUrl,
        "getTokenAccountsByOwner",
        [address, { mint: token.address }, { encoding: "jsonParsed", commitment: "confirmed" }],
        { source, signal },
      )
      return r.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed?.info?.tokenAmount?.amount ?? "0"), 0n)
    },

    validateAddress(address) {
      if (!address.trim()) return "Введите адрес"
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim())) return "Это не похоже на адрес Solana: 32–44 символа без 0, O, I и l"
      return base58.decode(address.trim()).length === 32 ? null : "Адрес Solana должен содержать ровно 32 байта"
    },
  }
}
