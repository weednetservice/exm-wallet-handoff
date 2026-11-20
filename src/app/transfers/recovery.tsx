import { useEffect, useRef, useState } from "react"
import { tokensOf, type Network } from "@/lib/chains"
import { evmRpc } from "@/lib/chains/evm"
import { getJson, rpc } from "@/lib/api/http"
import { formatCoin } from "@/lib/format"
import { validateEvmReceipt } from "../screens/receiptStatus"
import { SecondaryButton } from "../ui"
import type { SendResult } from "../vault/signers"
import { isInterruptedPreparation, isUnresolvedTransfer, migrateLegacyTransfer, readPendingTransfer, resetInterruptedPreparation, TRANSFER_PENDING_EVENT, updatePendingTransfer, withTransferSigningLock, type PendingTransfer } from "./pending"
import { TRANSFER_UNCERTAIN_MESSAGE } from "./guard"
import { terminalTransferOutcome, type TransferOutcomeBinding } from "./outcome"

export function useTransferRecovery(open: boolean, network: Network, owner: string) {
  const [record, setRecord] = useState<PendingTransfer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const context = JSON.stringify([open, network.id, owner])
  const activeContext = useRef(context)
  activeContext.current = context
  const refresh = () => {
    if (!open || network.environment !== "mainnet") { setRecord(null); setError(null); return }
    try { setRecord(readPendingTransfer(owner, network.id)); setError(null) }
    catch (cause) { setRecord(null); setError((cause as Error).message) }
  }
  useEffect(() => {
    setChecking(false); setMessage(null)
    refresh()
    window.addEventListener("storage", refresh)
    window.addEventListener(TRANSFER_PENDING_EVENT, refresh)
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener(TRANSFER_PENDING_EVENT, refresh) }
  }, [open, network.id, network.environment, owner])
  useEffect(() => {
    if (!open || network.environment !== "mainnet") return
    void withTransferSigningLock(owner, network.id, async () => {
      migrateLegacyTransfer(owner, network.id, { id: "native", symbol: network.native.symbol, decimals: network.native.decimals }, tokensOf(network).map((token) => ({ id: token.address, symbol: token.symbol, decimals: token.decimals })))
    }).then(() => { if (activeContext.current === context) refresh() }).catch((cause) => {
      if (activeContext.current === context) { refresh(); setMessage((cause as Error).message) }
    })
  }, [open, network.id, network.environment, owner])

  const verify = async (knownResult?: SendResult): Promise<boolean> => {
    if (!record || !(record.result ?? knownResult)?.hash || checking) return false
    setChecking(true); setMessage(null)
    try {
      return await withTransferSigningLock(owner, network.id, async () => {
        const current = readPendingTransfer(owner, network.id)
        if (!current || current.id !== record.id) throw new Error("Запись перевода изменилась. Откройте её заново.")
        const result = current.result ?? knownResult!
        const hash = result.hash
        let state: "confirmed" | "failed" | null = null
        if (network.family === "evm") {
          const chainId = await evmRpc<string>(network, "eth_chainId", [])
          if (BigInt(chainId) !== BigInt(network.chainId!)) throw new Error("RPC отвечает за другую сеть")
          const receipt = await evmRpc<unknown>(network, "eth_getTransactionReceipt", [hash])
          state = validateEvmReceipt(receipt, { hash, owner, destination: current.asset.id === "native" ? current.to : current.asset.id })
        } else if (network.family === "solana") {
          const response = await rpc<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>(network.rpcUrl, "getSignatureStatuses", [[hash], { searchTransactionHistory: true }], { source: network.name })
          const status = response.value[0]
          if (status && ["confirmed", "finalized"].includes(status.confirmationStatus ?? "")) state = status.err ? "failed" : "confirmed"
        } else if (network.family === "bitcoin") {
          const tx = await getJson<{ txid: string; status: { confirmed: boolean } }>(`${network.rpcUrl}/tx/${hash}`, { source: network.name })
          if (tx.txid === hash && tx.status.confirmed) state = "confirmed"
        }
        if (activeContext.current !== context) return false
        if (!state) { setMessage("Подтверждение пока не найдено. Это не доказывает отмену: новая отправка остаётся остановленной."); return false }
        updatePendingTransfer(current, { state, result })
        return true
      })
    } catch (cause) { if (activeContext.current === context) setMessage(`Не удалось подтвердить результат. ${(cause as Error).message}`); return false }
    finally { if (activeContext.current === context) { setChecking(false); refresh() } }
  }
  const restart = async (): Promise<boolean> => {
    if (!record || checking) return false
    setChecking(true); setMessage(null)
    try {
      await resetInterruptedPreparation(record)
      return activeContext.current === context
    } catch (cause) { if (activeContext.current === context) setMessage((cause as Error).message); return false }
    finally { if (activeContext.current === context) { setChecking(false); refresh() } }
  }
  const sameOwner = record && (network.family === "evm" ? record.owner.toLowerCase() === owner.toLowerCase() : record.owner === owner)
  const visibleRecord = record?.networkId === network.id && sameOwner ? record : null
  const terminalStatusFor = (binding: Omit<TransferOutcomeBinding, "owner" | "networkId">) => open && !error && network.environment === "mainnet"
    ? terminalTransferOutcome(visibleRecord, { ...binding, owner, networkId: network.id })
    : null
  return { record: visibleRecord, error, checking, message, refresh, verify, restart, terminalStatusFor, blocked: !!error || !!visibleRecord && isUnresolvedTransfer(visibleRecord) }
}

export function TransferRecoveryNotice({ recovery, knownResult, onResolved }: { recovery: ReturnType<typeof useTransferRecovery>; knownResult?: SendResult; onResolved: () => void }) {
  const item = recovery.record
  const result = item?.result ?? knownResult
  const preparationOnly = isInterruptedPreparation(item)
  return <div className="flex w-full flex-col gap-3 text-left">
    <p className="t-body2 c-2">{recovery.error ?? (preparationOnly ? "Подготовка была прервана до передачи узлу. Можно подготовить перевод заново; активная операция в другой вкладке продолжит блокировать повтор." : TRANSFER_UNCERTAIN_MESSAGE)}</p>
    {item ? <p className="t-body2 break-words">{formatCoin(BigInt(item.amount), item.asset.decimals, item.asset.symbol)} → {item.to}</p> : null}
    {result?.url ? <a className="t-body2 min-h-11 break-all text-[var(--blue)]" href={result.url} target="_blank" rel="noopener noreferrer">Хэш: {result.hash}</a> : null}
    {preparationOnly ? <SecondaryButton disabled={recovery.checking} onClick={() => { void recovery.restart().then((reset) => { if (reset) onResolved() }) }}>{recovery.checking ? "Проверяем подготовку…" : "Подготовить заново"}</SecondaryButton> : result?.hash ? <SecondaryButton disabled={recovery.checking} onClick={() => { void recovery.verify(knownResult).then((resolved) => { if (resolved) onResolved() }) }}>{recovery.checking ? "Проверяем статус…" : "Проверить статус перевода"}</SecondaryButton> : <p className="t-body3 c-2">Хэш не сохранился. Проверьте исходящий перевод по адресу в обозревателе. EXM не может доказать его отмену и не разрешает слепой повтор.</p>}
    {recovery.error ? <SecondaryButton onClick={recovery.refresh}>Повторить чтение записи</SecondaryButton> : null}
    {recovery.message ? <p role="status" className="t-body2 c-2">{recovery.message}</p> : null}
  </div>
}
