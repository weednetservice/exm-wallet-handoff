import { tokensOf, type Network } from "@/lib/chains"
import { assertNoPendingRevoke } from "../allowances/pending"
import { assertNoPendingSwap } from "../swap/pending"
import { BroadcastUncertainError, isDefiniteBroadcastRejection, SigningSessionExpiredError, type SendResult } from "../vault/signers"
import { claimPendingTransfer, clearRejectedTransfer, isTransferPreparationError, migrateLegacyTransfer, readPendingTransfer, updatePendingTransfer, withTransferSigningLock, type PendingTransfer, type TransferAsset } from "./pending"

export const TRANSFER_UNCERTAIN_MESSAGE = "Перевод мог попасть в сеть, но его результат не подтверждён. Новая отправка в этой сети остановлена. Проверьте статус сохранённой операции; закрытие окна или перезагрузка не отменяют её."

export class TransferPreflightCancelledError extends Error {
  constructor() { super("Проверка перевода отменена до подписи"); this.name = "TransferPreflightCancelledError" }
}

export async function guardedTransfer({ network, owner, asset, to, amount, fee, current, send }: {
  network: Network; owner: string; asset: TransferAsset; to: string; amount: bigint; fee: bigint
  current: () => boolean; send: () => Promise<SendResult>
}): Promise<SendResult> {
  if (document.documentElement.hasAttribute("data-frontend-mock")) {
    throw new Error("Подпись остановлена. В макете транзакции не подписываются.")
  }
  if (network.environment !== "mainnet") throw new Error("Подпись остановлена: EXM поддерживает только основные сети.")
  return withTransferSigningLock(owner, network.id, async () => {
    if (!current()) throw new TransferPreflightCancelledError()
    if (network.family === "evm") { assertNoPendingSwap(owner); assertNoPendingRevoke(owner) }
    migrateLegacyTransfer(owner, network.id, { id: "native", symbol: network.native.symbol, decimals: network.native.decimals }, tokensOf(network).map((token) => ({ id: token.address, symbol: token.symbol, decimals: token.decimals })))
    const intent: PendingTransfer = { id: crypto.randomUUID(), owner, networkId: network.id, asset, to, amount: amount.toString(), fee: fee.toString(), createdAt: Date.now(), state: "intent", ...(network.family === "evm" ? { hashBeforeBroadcast: true as const } : {}) }
    claimPendingTransfer(intent)
    if (!current()) { clearRejectedTransfer(intent); throw new TransferPreflightCancelledError() }
    let result: SendResult
    try {
      result = await send()
      const prepared = readPendingTransfer(owner, network.id)
      if (prepared?.id !== intent.id || prepared.result && (network.family === "evm" ? prepared.result.hash.toLowerCase() !== result.hash.toLowerCase() : prepared.result.hash !== result.hash)) throw new BroadcastUncertainError(network)
    }
    catch (error) {
      if (isTransferPreparationError(error) || error instanceof SigningSessionExpiredError || isDefiniteBroadcastRejection(error) || /^(Комиссия выросла до подписи|Лимит комиссии не подтверждён)/.test((error as Error)?.message ?? "")) {
        clearRejectedTransfer(intent)
        throw error
      }
      // The original intent remains durable even if this update is refused by storage.
      try { updatePendingTransfer(intent, { state: "uncertain" }) } catch { /* The pre-broadcast intent still blocks another send. */ }
      const uncertain = new BroadcastUncertainError(network)
      uncertain.message = TRANSFER_UNCERTAIN_MESSAGE
      throw uncertain
    }
    try { updatePendingTransfer(intent, { state: result.status === "confirmed" ? "confirmed" : "broadcast", result }) }
    catch { /* Keep the known hash in the caller while the durable intent remains unresolved. */ }
    return result
  })
}
