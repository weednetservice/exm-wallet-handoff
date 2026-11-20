/**
 * EVM test networks: balances over JSON-RPC (with fallback endpoints), history from the network's
 * keyless indexer: Blockscout API v2 or Routescan's Etherscan-compatible API. Networks without one
 * (`history: null`) answer `NoHistoryError`, so the UI can say so instead of showing an empty list.
 */
import { ApiError, getJson, isTransient, rpc } from "../api/http"
import type { HistorySource, Network } from "./networks"
import type { Token } from "./tokens"
import type { Activity, ChainData } from "./types"

/** this network has no keyless history API */
export class NoHistoryError extends Error {
  constructor(readonly network: Network) {
    super("История для этой сети недоступна")
    this.name = "NoHistoryError"
  }
}

/** JSON-RPC against the network's endpoints in order: the next one is tried only when the previous did not answer */
export async function evmRpc<T>(network: Network, method: string, params: unknown[], signal?: AbortSignal): Promise<T> {
  const urls = [network.rpcUrl, ...(network.rpcFallbacks ?? [])]
  let last: unknown
  for (const url of urls) {
    try {
      return await rpc<T>(url, method, params, { source: network.testnetName, signal })
    } catch (e) {
      if (signal?.aborted || !isTransient(e)) throw e
      last = e
    }
  }
  throw last
}

const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a)
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/** contract methods people meet in a wallet, named the way they think of them */
const METHOD_TITLES: [RegExp, string][] = [
  [/^(exactInput|exactOutput|swap|multicall|execute)/i, "Обмен"],
  [/^approve$|^permit/i, "Разрешение на токен"],
  [/^(transfer|transferFrom|safeTransferFrom)$/i, "Перевод токена"],
  [/^(mint|safeMint)/i, "Выпуск токена"],
]
const methodTitle = (network: Network, method: string, to?: string) => {
  if (network.environment === "mainnet" && network.chainId === 1 && same(to, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")) {
    if (/^deposit$/i.test(method)) return "Обёртка ETH в WETH"
    if (/^withdraw$/i.test(method)) return "Возврат из WETH"
  }
  return METHOD_TITLES.find(([re]) => re.test(method))?.[1] ?? "Вызов контракта"
}
const plainTitle = (direction: Activity["direction"]) => (direction === "out" ? "Отправка" : direction === "in" ? "Получение" : "Перевод себе")

/* ------------------------------------------------------------ Blockscout v2 */

type BsAddr = { hash: string; ens_domain_name?: string | null; name?: string | null }
type BsTx = {
  hash: string
  timestamp: string | null
  status: "ok" | "error" | null
  value: string
  method: string | null
  block_number: number | null
  fee?: { value: string }
  from: BsAddr
  to: BsAddr | null
  created_contract?: BsAddr | null
  transaction_types?: string[]
}

async function blockscoutActivity(network: Network, api: string, address: string, signal?: AbortSignal): Promise<Activity[]> {
  const raw = await getJson<{ items: BsTx[] }>(`${api}/addresses/${address}/transactions`, { source: "Blockscout", signal }).catch((e) => {
    // a fresh address Blockscout has never seen answers 404: that is "no operations", not an error
    if (e?.status === 404) return { items: [] as BsTx[] }
    throw e
  })
  if (!Array.isArray(raw?.items)) throw new ApiError("Blockscout: неожиданный ответ", "Blockscout")
  return raw.items.flatMap((tx): Activity[] => {
    const destination = tx.to ?? tx.created_contract
    const out = same(tx.from.hash, address)
    const inn = same(destination?.hash, address)
    if (!out && !inn) return []
    const direction = out && inn ? "self" : out ? "out" : "in"
    const other = direction === "out" ? destination : tx.from
    const isPlain = (tx.transaction_types ?? []).every((t) => t === "coin_transfer")
    return [{
      id: tx.hash,
      hash: tx.hash,
      direction,
      title: !tx.to && tx.created_contract ? "Создание контракта" : isPlain || !tx.method ? plainTitle(direction) : methodTitle(network, tx.method, tx.to?.hash),
      counterparty: other?.hash,
      amount: BigInt(tx.value || "0"),
      fee: tx.fee ? BigInt(tx.fee.value) : undefined,
      status: tx.block_number == null ? "pending" : tx.status === "error" ? "failed" : "confirmed",
      time: tx.timestamp ? new Date(tx.timestamp) : undefined,
      network,
      explorerUrl: network.explorer.tx(tx.hash),
    }]
  })
}

/* ------------------------------------------------------------ Routescan (Etherscan-compatible) */

type EsTx = {
  hash: string
  timeStamp: string
  from: string
  to: string
  value: string
  gasUsed: string
  gasPrice: string
  isError: string
  input: string
  functionName?: string
  contractAddress?: string
}

async function routescanActivity(network: Network, api: string, address: string, signal?: AbortSignal): Promise<Activity[]> {
  const url = `${api}?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=25`
  const raw = await getJson<{ status: string; message: string; result: EsTx[] | string | null }>(url, { source: "Routescan", signal })
  // "No transactions found" comes back as status 0 with an empty result
  if (!Array.isArray(raw.result)) {
    if (/no transactions/i.test(raw.message ?? "")) return []
    throw new ApiError(`Routescan: ${raw.message || "неожиданный ответ"}`, "Routescan")
  }
  return raw.result.flatMap((tx): Activity[] => {
    const destination = tx.to || tx.contractAddress
    const out = same(tx.from, address)
    const inn = same(destination, address)
    if (!out && !inn) return []
    const direction = out && inn ? "self" : out ? "out" : "in"
    const method = tx.functionName ? tx.functionName.split("(")[0] : ""
    const isPlain = !tx.input || tx.input === "0x"
    return [{
      id: tx.hash,
      hash: tx.hash,
      direction,
      title: !tx.to && tx.contractAddress ? "Создание контракта" : isPlain || !method ? (isPlain ? plainTitle(direction) : "Вызов контракта") : methodTitle(network, method, tx.to),
      counterparty: (direction === "out" ? destination : tx.from) || undefined,
      amount: BigInt(tx.value || "0"),
      fee: tx.gasUsed && tx.gasPrice ? BigInt(tx.gasUsed) * BigInt(tx.gasPrice) : undefined,
      status: tx.isError === "1" ? "failed" : "confirmed",
      time: new Date(Number(tx.timeStamp) * 1000),
      network,
      explorerUrl: network.explorer.tx(tx.hash),
    }]
  })
}

function activity(network: Network, history: HistorySource | null, address: string, signal?: AbortSignal) {
  if (!history || history.kind === "node") return Promise.reject(new NoHistoryError(network))
  return history.kind === "blockscout" ? blockscoutActivity(network, history.api, address, signal) : routescanActivity(network, history.api, address, signal)
}

/* ------------------------------------------------------------ adapter */

/** balanceOf(owner) calldata, without pulling an ABI encoder into the data layer */
const balanceOfData = (owner: string) => "0x70a08231" + owner.slice(2).toLowerCase().padStart(64, "0")

export function evmData(network: Network): ChainData {
  return {
    async getBalance(address, signal) {
      const hex = await evmRpc<string>(network, "eth_getBalance", [address, "latest"], signal)
      return { network, address, native: BigInt(hex), at: Date.now() }
    },

    getActivity(address, signal) {
      return activity(network, network.history, address, signal)
    },

    async getTokenBalance(address: string, token: Token, signal?: AbortSignal) {
      if (!isAddress(address) || !isAddress(token.address)) throw new ApiError("Неверный адрес токена", network.testnetName)
      const hex = await evmRpc<string>(network, "eth_call", [{ to: token.address, data: balanceOfData(address) }, "latest"], signal)
      // a contract that is not there answers "0x": treat as no balance rather than as a number
      if (!hex || hex === "0x") throw new ApiError(`${token.symbol} не найден в сети ${network.testnetName}`, network.testnetName)
      return BigInt(hex)
    },

    validateAddress(address) {
      if (!address.trim()) return "Введите адрес"
      if (!isAddress(address.trim())) return "Адрес в сети Ethereum начинается с 0x и содержит 40 символов после него"
      return null
    },
  }
}
