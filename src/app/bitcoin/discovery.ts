import { BITCOIN_MAINNET, bitcoinData, type BitcoinActivity, type EsploraTx } from "@/lib/chains/bitcoin"
import { bip84Address } from "./derive"
export { bip84AccountXpub, bip84Address } from "./derive"

export const BIP84_GAP_LIMIT = 20
export const BIP84_MAX_INDEX = 200
const BATCH = 4

export type DiscoveredAddress = { address: string; chain: 0 | 1; index: number }
export type AddressSummary = { balance: bigint; used: boolean }
export type BitcoinAccountDiscovery = {
  balance: bigint
  usedAddresses: DiscoveredAddress[]
  scanned: { external: number; change: number }
}

/** Rejects incomplete scans instead of reporting a partial balance as zero. */
export async function scanBip84Account(
  xpub: string,
  read: (address: string, signal?: AbortSignal) => Promise<AddressSummary>,
  signal?: AbortSignal,
  gapLimit = BIP84_GAP_LIMIT,
  maxIndex = BIP84_MAX_INDEX,
): Promise<BitcoinAccountDiscovery> {
  if (!Number.isSafeInteger(gapLimit) || gapLimit < 1 || !Number.isSafeInteger(maxIndex) || maxIndex < gapLimit) throw new Error("Неверные границы поиска Bitcoin")
  const usedAddresses: DiscoveredAddress[] = []
  const scanned = { external: 0, change: 0 }
  let balance = 0n
  for (const chain of [0, 1] as const) {
    let gap = 0
    let complete = false
    for (let start = 0; start < maxIndex; start += BATCH) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError")
      const count = Math.min(BATCH, maxIndex - start)
      const batch = Array.from({ length: count }, (_, offset) => ({ chain, index: start + offset, address: bip84Address(xpub, chain, start + offset) }))
      const summaries = await Promise.all(batch.map((item) => read(item.address, signal)))
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]
        const summary = summaries[j]
        if (summary.balance !== 0n && !summary.used) throw new Error("Bitcoin API вернул баланс без истории адреса")
        balance += summary.balance
        if (summary.used) { usedAddresses.push(item); gap = 0 }
        else gap++
        if (chain === 0) scanned.external++
        else scanned.change++
        if (gap >= gapLimit) { complete = true; break }
      }
      if (complete) break
    }
    if (!complete) throw new Error(`Поиск Bitcoin остановлен на ${maxIndex} адресах; полный баланс не подтверждён`)
  }
  return { balance, usedAddresses, scanned }
}

export function aggregateBip84Activity(txs: EsploraTx[], usedAddresses: DiscoveredAddress[]): BitcoinActivity[] {
  const owned = new Set(usedAddresses.map((item) => item.address))
  const unique = new Map(txs.map((tx) => [tx.txid, tx]))
  return [...unique.values()].map((tx): BitcoinActivity => {
    const spent = tx.vin.reduce((sum, input) => sum + (input.prevout?.scriptpubkey_address && owned.has(input.prevout.scriptpubkey_address) ? input.prevout.value : 0), 0)
    const received = tx.vout.reduce((sum, output) => sum + (output.scriptpubkey_address && owned.has(output.scriptpubkey_address) ? output.value : 0), 0)
    const outsideOutputs = tx.vout.filter((output) => !output.scriptpubkey_address || !owned.has(output.scriptpubkey_address))
    const direction: BitcoinActivity["direction"] = spent > 0 && outsideOutputs.length === 0 ? "self" : received > spent ? "in" : "out"
    const amount = direction === "in" ? received - spent : direction === "out" ? outsideOutputs.reduce((sum, output) => sum + output.value, 0) : 0
    const counterparty = direction === "in"
      ? tx.vin.find((input) => input.prevout?.scriptpubkey_address && !owned.has(input.prevout.scriptpubkey_address))?.prevout?.scriptpubkey_address
      : outsideOutputs.find((output) => output.scriptpubkey_address)?.scriptpubkey_address
    return {
      id: tx.txid,
      hash: tx.txid,
      direction,
      title: direction === "in" ? "Получение" : direction === "out" ? "Отправка" : "Перевод себе",
      counterparty,
      amount: BigInt(amount),
      fee: spent > 0 ? BigInt(tx.fee) : undefined,
      status: tx.status.confirmed ? "confirmed" as const : "pending" as const,
      time: tx.status.block_time ? new Date(Math.min(tx.status.block_time * 1000, Date.now())) : undefined,
      network: BITCOIN_MAINNET,
      explorerUrl: BITCOIN_MAINNET.explorer.tx(tx.txid),
    }
  }).sort((a, b) => (b.time?.getTime() ?? Date.now()) - (a.time?.getTime() ?? Date.now())).slice(0, 25)
}

/** Uses individual addresses only. A failure on any used address fails the history query. */
export async function loadBip84Activity(discovery: BitcoinAccountDiscovery, signal?: AbortSignal): Promise<BitcoinActivity[]> {
  const addresses = discovery.usedAddresses
  const data = bitcoinData(BITCOIN_MAINNET)
  const txs: EsploraTx[] = []
  for (let start = 0; start < addresses.length; start += BATCH) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError")
    const batch = await Promise.all(addresses.slice(start, start + BATCH).map((item) => data.getRawActivity(item.address, signal)))
    for (const part of batch) txs.push(...part)
  }
  return aggregateBip84Activity(txs, addresses)
}

export function loadBip84Discovery(xpub: string, signal?: AbortSignal) {
  const data = bitcoinData(BITCOIN_MAINNET)
  return scanBip84Account(xpub, (address, requestSignal) => data.getAddressSummary(address, requestSignal), signal)
}
