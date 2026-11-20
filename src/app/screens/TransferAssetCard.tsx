import type { ReactNode } from "react"
import { IconChevronDown, IconChevronRight, IconCopy, IconExternal } from "../glyph"
import { SceneArt } from "../art/scenes"
import { assetName } from "../assetNames"
import { copyText, useToast } from "../ui"
import type { SendResult } from "../vault/signers"
import { shortAddress } from "@/lib/format"
import "./transfer.css"

export function TransferAssetCard({ icon, symbol, network, balance, onSelect, selectLabel }: { icon: ReactNode; symbol: string; network: string; balance?: string; onSelect?: () => void; selectLabel?: string }) {
  const name = assetName(symbol)
  const content = (
    <>
      <span className="shrink-0" aria-hidden="true">{icon}</span>
      <span className="wallet-transfer-asset-copy">
        <span className="wallet-transfer-asset-name">{name}</span>
        <span className="wallet-transfer-asset-network">{name === symbol ? network : `${symbol} · ${network}`}</span>
      </span>
      {balance ? <span className="wallet-transfer-asset-balance"><span>Доступно</span><span>{balance}</span></span> : null}
      {onSelect ? <IconChevronDown size={18} className="c-2 shrink-0" /> : null}
    </>
  )
  const className = "wallet-transfer-asset"
  return onSelect ? <button type="button" onClick={onSelect} aria-label={selectLabel ?? `Выбрать другой актив, сейчас ${symbol} в сети ${network}`} className={className}>{content}</button> : <div className={className}>{content}</div>
}

export function TransferHelpButton({ id, onClick }: { id: string; onClick: () => void }) {
  return <button id={id} type="button" aria-label="Помощь" className="wallet-transfer-help" onClick={onClick}><span>Помощь</span></button>
}

export function TransferHelp({ network, symbol, children }: { network: string; symbol: string; children?: ReactNode }) {
  return <div className="wallet-transfer-help-content">
    <p>Отправляйте {symbol} только на адрес в сети {network}. Получатель должен поддерживать эту сеть и этот актив.</p>
    <p>Комиссию получает сеть. Её максимум появится после ввода адреса и суммы; перед подписью EXM проверит условия ещё раз.</p>
    {children}
    <p>Отправленный перевод нельзя отменить. Перед подтверждением сверьте полный адрес, сеть и сумму.</p>
  </div>
}

export function TransferFeeCard({ value, children }: { value: string; children: ReactNode }) {
  return <details className="wallet-transfer-fee">
    <summary>
      <span className="wallet-transfer-fee-copy"><span>Комиссия сети</span><span>{value}</span></span>
      <IconChevronRight size={18} className="c-2" />
    </summary>
    <div className="wallet-transfer-fee-details">{children}</div>
  </details>
}

export function TransferReviewSummary({ icon, amount, network }: { icon: ReactNode; amount: string; network: string }) {
  return <div className="wallet-transfer-review-hero">
    <span aria-hidden="true">{icon}</span>
    <div><p>{amount}</p><span>{network}</span></div>
  </div>
}

export function TransferReviewAddress({ label, name, address, recipient = false }: { label: string; name: string; address: string; recipient?: boolean }) {
  const [toast, showToast] = useToast()
  const split = Math.ceil(address.length / 2)
  const copy = async () => {
    if (await copyText(address)) showToast("Адрес скопирован")
    else showToast("Не удалось скопировать. Выделите адрес вручную.")
  }
  const copyLabel = label === "Кому" ? "Скопировать адрес получателя" : label === "Откуда" ? "Скопировать адрес отправителя" : `Скопировать ${label.toLowerCase()}`
  return <div className="wallet-transfer-review-address" data-recipient={recipient || undefined}>
    <span className="wallet-transfer-review-label">{label}</span>
    <span className="wallet-transfer-review-identity">{name}</span>
    <button type="button" aria-label={copyLabel} onClick={() => void copy()}><IconCopy size={18} /></button>
    <div><span className="mono select-all" onCopy={(event) => { event.preventDefault(); event.clipboardData.setData("text/plain", address) }}>{address.slice(0, split)}<wbr />{address.slice(split)}</span></div>
    {toast}
  </div>
}

export function TransferReceipt({ result, confirmed: observedConfirmed = false, failed = false, unavailable = false, amount, network, from, to, icon }: { result: SendResult | null; confirmed?: boolean; failed?: boolean; unavailable?: boolean; amount: string; network: string; from: string; to: string; icon: ReactNode }) {
  const confirmed = !failed && (observedConfirmed || result?.status === "confirmed")
  const known = confirmed || failed || result?.status === "broadcast"
  return <div className="wallet-transfer-receipt" data-status={failed ? "failed" : confirmed ? "confirmed" : known ? "pending" : "unavailable"}>
    <div className="wallet-transfer-receipt-hero">
      {confirmed ? <SceneArt variant="sent" size={128} /> : icon}
      <h2 className={failed ? "text-[var(--red)]" : undefined}>{failed ? "Перевод не выполнен" : confirmed ? "Перевод подтверждён" : known ? "Передано в сеть" : "Статус недоступен"}</h2>
      <p className="wallet-transfer-receipt-amount">{amount}</p>
      <span>{network}{confirmed ? observedConfirmed ? " · включено в блок" : " · подтверждено" : ""}</span>
    </div>
    {known && !confirmed && !failed ? <ol className="wallet-transfer-receipt-stages" aria-label="Статус перевода">
      <li><span className="wallet-transfer-receipt-stage-done" aria-hidden="true">✓</span><span>Передано в сеть<span>Узел принял транзакцию</span></span></li>
      <li><span className="wallet-transfer-receipt-stage-wait" aria-hidden="true">2</span><span>Ожидает подтверждения<span>{unavailable ? "Пока не удалось проверить. Откройте обозреватель" : "Проверьте итоговый статус в обозревателе"}</span></span></li>
    </ol> : !known ? <p className="t-body2 c-2">Сохранённых данных недостаточно. Перед новым переводом проверьте историю адреса.</p> : null}
    {failed ? <p role="alert" className="t-body2 text-[var(--red)]">Перевод не выполнен. Комиссия сети могла быть списана. Перед новой попыткой проверьте операцию в обозревателе.</p> : null}
    <div className="wallet-transfer-receipt-party"><span>Получатель</span><span className="mono">{shortAddress(to, 7, 5)}</span></div>
    <details className="wallet-transfer-receipt-details">
      <summary>Детали перевода<IconChevronRight size={18} /></summary>
      <div className="wallet-transfer-receipt-detail-body">
        <TransferReviewAddress label="Откуда" name="Мой кошелёк" address={from} />
        <TransferReviewAddress label="Кому" name="Получатель" address={to} />
        {result?.hash ? <TransferReviewAddress label="Хэш транзакции" name={network} address={result.hash} /> : null}
      </div>
    </details>
    {result?.url ? <a href={result.url} target="_blank" rel="noopener noreferrer" className="wallet-transfer-receipt-explorer">{result.label}<IconExternal size={18} /><span className="sr-only">(в новой вкладке)</span></a> : null}
  </div>
}
