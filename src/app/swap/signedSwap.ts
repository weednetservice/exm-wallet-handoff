import { keccak256, parseTransaction, recoverTransactionAddress, type Address, type Hex, type TransactionSerialized } from "viem"

export type ReviewedSwapTransaction = {
  to: Address
  data: Hex
  value?: bigint
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

/** Validate the signed bytes before handing them to the RPC transport. */
export async function signedSwapHash(signed: Hex, owner: Address, reviewed: ReviewedSwapTransaction): Promise<Hex> {
  const transaction = parseTransaction(signed)
  if (transaction.type !== "eip1559" || transaction.chainId !== 1 || transaction.accessList?.length ||
      transaction.to?.toLowerCase() !== reviewed.to.toLowerCase() || transaction.data?.toLowerCase() !== reviewed.data.toLowerCase() ||
      (transaction.value ?? 0n) !== (reviewed.value ?? 0n) || transaction.gas !== reviewed.gas ||
      transaction.maxFeePerGas !== reviewed.maxFeePerGas || (transaction.maxPriorityFeePerGas ?? 0n) !== reviewed.maxPriorityFeePerGas) {
    throw new Error("Подписанные данные обмена не совпали с обзором.")
  }
  const sender = await recoverTransactionAddress({ serializedTransaction: signed as TransactionSerialized })
  if (sender.toLowerCase() !== owner.toLowerCase()) throw new Error("Подписанные данные обмена не совпали с обзором.")
  return keccak256(signed)
}
