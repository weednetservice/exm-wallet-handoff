import type { Network } from "./networks"
import type { Token } from "./tokens"

/** one line in "Последние операции", the same shape for every network */
export type Activity = {
  id: string
  hash: string
  direction: "in" | "out" | "self"
  /** what happened, in words: "Отправка", "Получение", "Вызов контракта: deposit" */
  title: string
  /** the other side of the transfer */
  counterparty?: string
  /** native coin amount in base units, positive */
  amount: bigint
  /** present when this row represents a token transfer instead of the native coin */
  token?: Token
  /** token metadata came from an indexer and has not been admitted to EXM's trusted registry */
  unverified?: boolean
  fee?: bigint
  status: "pending" | "confirmed" | "failed"
  time?: Date
  network: Network
  explorerUrl: string
}

export type Balance = {
  network: Network
  address: string
  /** native coin, base units */
  native: bigint
  /** fetched at */
  at: number
}

/** what every network adapter answers; the wallet UI talks only to this */
export type ChainData = {
  getBalance(address: string, signal?: AbortSignal): Promise<Balance>
  /** rejects with NoHistoryError (evm.ts) on a network without a keyless history API */
  getActivity(address: string, signal?: AbortSignal): Promise<Activity[]>
  /** token balance in base units; present where the network has tokens (EVM ERC-20, Solana SPL) */
  getTokenBalance?(address: string, token: Token, signal?: AbortSignal): Promise<bigint>
  /** validates a recipient address for this network, returns an error text or null */
  validateAddress(address: string): string | null
}
