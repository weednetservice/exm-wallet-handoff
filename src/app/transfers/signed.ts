import { decodeFunctionData, erc20Abi, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerialized } from "viem"
import { tokensOf, type Network } from "@/lib/chains"
import type { PendingTransfer } from "./pending"

/** Bind the actual signed bytes to the durable review, not just to a displayed ticker. */
export async function assertPreparedTransfer(serialized: Hex, network: Network, intent: PendingTransfer) {
  const tx = parseTransaction(serialized)
  if (tx.type !== "legacy" && tx.type !== "eip1559") throw new Error("Тип подписанной операции не соответствует обычному переводу")
  if ("accessList" in tx && tx.accessList?.length) throw new Error("Дополнительные параметры не подтверждены в обзоре")
  const sender = await recoverTransactionAddress({ serializedTransaction: serialized as TransactionSerialized })
  if (network.environment !== "mainnet" || tx.chainId !== network.chainId || intent.networkId !== network.id || intent.owner.toLowerCase() !== sender.toLowerCase()) throw new Error("Подписанные данные не соответствуют сети и отправителю")
  const gasPrice = tx.maxFeePerGas ?? tx.gasPrice
  if (!tx.gas || !gasPrice || tx.gas * gasPrice > BigInt(intent.fee)) throw new Error("Подписанная комиссия превышает подтверждённый лимит")
  if (intent.asset.id === "native") {
    if (tx.to?.toLowerCase() !== intent.to.toLowerCase() || tx.value !== BigInt(intent.amount) || tx.data && tx.data !== "0x") throw new Error("Подписанная сумма или получатель изменились")
  } else {
    const token = tokensOf(network).find(token => token.address.toLowerCase() === intent.asset.id.toLowerCase() && token.decimals === intent.asset.decimals && token.symbol === intent.asset.symbol)
    if (!token || tx.to?.toLowerCase() !== token.address.toLowerCase() || (tx.value ?? 0n) !== 0n || !tx.data) throw new Error("Подписанный токен не соответствует обзору")
    const call = decodeFunctionData({ abi: erc20Abi, data: tx.data })
    if (call.functionName !== "transfer" || call.args[0].toLowerCase() !== intent.to.toLowerCase() || call.args[1] !== BigInt(intent.amount)) throw new Error("Подписанные параметры токена изменились")
  }
}
