export type ReceiptStatus = "confirmed" | "failed"
export type ReceiptBinding = { hash: string; owner: string; destination: string }

const hashPattern = /^0x[0-9a-f]{64}$/i
const addressPattern = /^0x[0-9a-f]{40}$/i
const same = (value: unknown, expected: string) => typeof value === "string" && value.toLowerCase() === expected.toLowerCase()

/** A terminal status belongs to this transfer only when its mined receipt matches the whole binding. */
export function validateEvmReceipt(value: unknown, binding: ReceiptBinding): ReceiptStatus | null {
  if (!hashPattern.test(binding.hash) || !addressPattern.test(binding.owner) || !addressPattern.test(binding.destination)) return null
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const receipt = value as Record<string, unknown>
  if (!same(receipt.transactionHash, binding.hash) || !same(receipt.from, binding.owner) || !same(receipt.to, binding.destination)) return null
  if (typeof receipt.blockHash !== "string" || !hashPattern.test(receipt.blockHash)) return null
  if (typeof receipt.blockNumber !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(receipt.blockNumber)) return null
  return receipt.status === "0x1" ? "confirmed" : receipt.status === "0x0" ? "failed" : null
}
