import { NETWORKS } from "@/lib/chains/networks"
import { getJson } from "@/lib/api/http"

export const BASE_LOOKUP_NETWORK = NETWORKS.find((network) => network.id === "base-mainnet")!
export const isTransactionHash = (value: string) => /^0x[\da-fA-F]{64}$/.test(value.trim())

type Transaction = {
  from: string
  to: string | null
  value: bigint
  input: string
  blockHash: string | null
  blockNumber: bigint | null
}

export type BaseTransactionLookup = {
  hash: string
  state: "not-found" | "pending" | "included-success" | "included-failed"
  transaction?: Transaction
}

export class BaseLookupError extends Error {}

const invalidData = () => new BaseLookupError("RPC вернул неполные или несогласованные данные. Повторите проверку.")
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidData()
  return value as Record<string, unknown>
}
const hash = (value: unknown): string => {
  if (typeof value !== "string" || !/^0x[\da-fA-F]{64}$/.test(value)) throw invalidData()
  return value
}
const address = (value: unknown): string => {
  if (typeof value !== "string" || !/^0x[\da-fA-F]{40}$/.test(value)) throw invalidData()
  return value
}
const quantity = (value: unknown): bigint => {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][\da-fA-F]{0,63})$/.test(value)) throw invalidData()
  return BigInt(value)
}
const same = (a: string | null, b: string | null) => a?.toLowerCase() === b?.toLowerCase()

export function parseBaseTransaction(hashInput: string, rawTransaction: unknown, rawReceipt: unknown): BaseTransactionLookup {
  const requestedHash = hash(hashInput)
  if (rawTransaction === null && rawReceipt === null) return { hash: requestedHash, state: "not-found" }
  const tx = object(rawTransaction)
  if (!same(hash(tx.hash), requestedHash)) throw invalidData()
  // The independent RPC identity also covers deposit and legacy responses without this field.
  if (tx.chainId !== undefined && quantity(tx.chainId) !== 8453n) throw invalidData()
  if (typeof tx.input !== "string" || tx.input.length > 262146 || !/^0x(?:[\da-fA-F]{2})*$/.test(tx.input)) throw invalidData()
  const transaction: Transaction = {
    from: address(tx.from),
    to: tx.to === null ? null : address(tx.to),
    value: quantity(tx.value),
    input: tx.input,
    blockHash: tx.blockHash === null ? null : hash(tx.blockHash),
    blockNumber: tx.blockNumber === null ? null : quantity(tx.blockNumber),
  }
  if ((transaction.blockHash === null) !== (transaction.blockNumber === null)) throw invalidData()
  if (rawReceipt === null) {
    if (transaction.blockNumber !== null) throw invalidData()
    return { hash: requestedHash, state: "pending", transaction }
  }
  const receipt = object(rawReceipt)
  if (!same(hash(receipt.transactionHash), requestedHash) ||
    !same(address(receipt.from), transaction.from) ||
    !same(receipt.to === null ? null : address(receipt.to), transaction.to) ||
    !same(hash(receipt.blockHash), transaction.blockHash) ||
    quantity(receipt.blockNumber) !== transaction.blockNumber ||
    !Array.isArray(receipt.logs) || (receipt.status !== "0x1" && receipt.status !== "0x0")) throw invalidData()
  return { hash: requestedHash, state: receipt.status === "0x1" ? "included-success" : "included-failed", transaction }
}

type ReadRpc = (method: string, params: unknown[], signal: AbortSignal) => Promise<unknown>

async function readBaseBatch(requestedHash: string, signal: AbortSignal) {
  const lookup = [
    { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
    { jsonrpc: "2.0", id: 2, method: "eth_getTransactionByHash", params: [requestedHash] },
    { jsonrpc: "2.0", id: 3, method: "eth_getTransactionReceipt", params: [requestedHash] },
  ]
  const rows = await getJson<unknown>(BASE_LOOKUP_NETWORK.rpcUrl, {
    source: "Base", signal, init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lookup) },
  })
  if (!Array.isArray(rows) || rows.length !== lookup.length) throw invalidData()
  const getResult = (id: number) => {
    const row = rows.find((candidate) => candidate?.id === id)
    if (row?.jsonrpc !== "2.0" || row.error || !Object.hasOwn(row, "result")) throw invalidData()
    return row.result
  }
  if (quantity(getResult(1)) !== 8453n) throw new BaseLookupError("RPC отвечает за другую сеть. Проверка Base недоступна.")
  return parseBaseTransaction(requestedHash, getResult(2), getResult(3))
}

export async function readBaseTransaction(value: string, signal: AbortSignal, read?: ReadRpc): Promise<BaseTransactionLookup> {
  const requestedHash = value.trim()
  if (!isTransactionHash(requestedHash)) throw new BaseLookupError("Введите 0x и 64 шестнадцатеричных символа хэша.")
  signal.throwIfAborted()
  if (!read) return readBaseBatch(requestedHash, signal)
  if (quantity(await read("eth_chainId", [], signal)) !== 8453n) throw new BaseLookupError("RPC отвечает за другую сеть. Проверка Base недоступна.")
  signal.throwIfAborted()
  const [transaction, receipt] = await Promise.all([
    read("eth_getTransactionByHash", [requestedHash], signal),
    read("eth_getTransactionReceipt", [requestedHash], signal),
  ])
  signal.throwIfAborted()
  return parseBaseTransaction(requestedHash, transaction, receipt)
}
