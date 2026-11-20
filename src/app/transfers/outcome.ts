import type { ReceiptStatus } from "../screens/receiptStatus"
import type { PendingTransfer } from "./pending"

export type TransferOutcomeBinding = { owner: string; networkId: string; assetId: string; to: string; amount: string; hash: string }
const canonical = (value: string) => /^0x[0-9a-f]+$/i.test(value) ? value.toLowerCase() : value

/** A verified journal outcome belongs only to the transfer already displayed in this view. */
export function terminalTransferOutcome(record: PendingTransfer | null, binding: TransferOutcomeBinding): ReceiptStatus | null {
  if (!record || !record.result || !binding.hash || !binding.amount || !binding.to || !binding.owner) return null
  if (record.state !== "confirmed" && record.state !== "failed") return null
  if (/^0x[0-9a-f]{40}$/i.test(binding.owner) && !/^0x[0-9a-f]{64}$/i.test(binding.hash)) return null
  if (record.networkId !== binding.networkId || canonical(record.owner) !== canonical(binding.owner) ||
    canonical(record.asset.id) !== canonical(binding.assetId) || canonical(record.to) !== canonical(binding.to) ||
    record.amount !== binding.amount || canonical(record.result.hash) !== canonical(binding.hash)) return null
  return record.state
}
