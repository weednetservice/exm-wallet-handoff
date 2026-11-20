import { InfoIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { canBroadcastFromNetwork, networkLabel } from "@/lib/chains"
import { formatCoin, formatUsd, shortAddress, formatWhen } from "@/lib/format"
import type { TokenHolding } from "../home/portfolio"
import { IconExternal, IconReceive, IconSend } from "../glyph"
import { assetName } from "../assetNames"
import { CoinIcon, NetworkMark } from "../marks"
import { NeedWalletSheet } from "../onboarding/Onboarding"
import { ActionButton, copyText, ErrorNote, Group, IconButton, Row, Screen, ScreenHeader, Sheet, Skeleton, useToast } from "../ui"
import { useTokenActivity, type TokenTransfer } from "./activity"
import { TokenSendSheet } from "./TokenSendSheet"
import { SendUnavailableSheet } from "../screens/send"
import { ReceiveAddressSheet } from "../screens/ReceiveAddressSheet"
import { TransferAssetCard, TransferReviewAddress } from "../screens/TransferAssetCard"
import "../screens/wallet-detail.css"
export { TokenSendSheet }

export function UnverifiedTokenMark({ size = 44 }: { size?: number }) {
  return <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full bg-[var(--tint)] text-[var(--label-2)]" style={{ width: size, height: size }}>?</span>
}

export function TokenRow({ holding, hideBalances, onClick }: { holding: TokenHolding; hideBalances: boolean; onClick: () => void }) {
  const { token, network, amount, value, error, catalogQuote } = holding
  const named = holding.verified || !!catalogQuote
  return (
    <button type="button" onClick={onClick} className="wallet-discovered-token">
      {named ? <CoinIcon symbol={token.symbol} networkId={network.id} size={40} /> : <UnverifiedTokenMark size={40} />}
      <span className="min-w-0">
        <span className="t-label1 block [overflow-wrap:anywhere]">{catalogQuote ? token.name : token.symbol}</span>
        <span className="t-body2 c-2 block [overflow-wrap:anywhere]">{catalogQuote ? network.name : networkLabel(network)}{named ? "" : " · не проверен"}</span>
      </span>
      <span className="wallet-discovered-value">
        {hideBalances ? <span className="t-label1" aria-label="Остаток скрыт">••••</span> : <>
          {value !== undefined ? <span className="t-label1">{formatUsd(value)}</span> : null}
          <span className={value === undefined ? "t-label1" : "t-body2 c-2"}>{amount !== undefined ? formatCoin(amount, token.decimals, named ? token.symbol : "", 4).trim() : error ? "Нет связи" : <Skeleton className="w-14" />}</span>
        </>}
      </span>
    </button>
  )
}

export function TokenReceiveSheet({ open, onOpenChange, holding }: { open: boolean; onOpenChange: (open: boolean) => void; holding: TokenHolding }) {
  const { network, token, address } = holding
  return <ReceiveAddressSheet open={open} onOpenChange={onOpenChange} network={network} address={address} symbol={token.symbol} icon={<CoinIcon symbol={token.symbol} networkId={network.id} size={36} />} watchOnly={holding.source === "watch"} />
}

export function TokenScreen({ holding, onBack, onChangeAsset, choosingSendAsset }: { holding: TokenHolding; onBack: () => void; onChangeAsset?: (recipient?: string) => void; choosingSendAsset?: boolean }) {
  const { token, network, address, source, amount, value, price, catalogQuote } = holding
  const name = holding.verified ? assetName(token.symbol) : catalogQuote ? token.name : token.symbol
  const named = holding.verified || !!catalogQuote
  const [sheet, setSheet] = useState<null | "send" | "receive" | "need" | "details">(null)
  const [selectedTransfer, setSelectedTransfer] = useState<TokenTransfer | null>(null)
  const [toast, showToast] = useToast()
  const activity = useTokenActivity(network, token, address)
  const historyAvailable = network.history?.kind === "blockscout"
  const transfers = activity.data ?? []
  return (
    <Screen className="wallet-token-screen wallet-transfer-detail exm-coin-detail">
      <ScreenHeader onBack={onBack} backLabel="Назад на главную" right={<IconButton label="Сведения о токене" onClick={() => setSheet("details")} className="exm-coin-detail-info"><InfoIcon size={21} weight="light" /></IconButton>}><div className="flex min-w-0 max-w-full flex-col items-center text-center"><h1 className="t-label1">{name}</h1></div></ScreenHeader>
      <div className="exm-coin-detail-layout">
        <div className="exm-coin-detail-holding">
          <section className="wallet-transfer-detail-hero" aria-label="Баланс"><div className="wallet-transfer-detail-copy"><p className="exm-coin-detail-context"><NetworkMark networkId={network.id} size={18} />{networkLabel(network)}</p><p className="exm-coin-detail-balance">{amount !== undefined ? formatCoin(amount, token.decimals, token.symbol, 4) : holding.error ? <span className="t-h3 c-2">Баланс недоступен</span> : <Skeleton className="h-7 w-40 rounded-[8px]" />}</p><p className="exm-coin-detail-equivalent">{network.environment === "testnet" ? "Без рыночной оценки · тестовая сеть" : value !== undefined ? `≈ ${formatUsd(value)}` : catalogQuote?.loading ? "Загружаем цену…" : amount !== undefined ? "Курс недоступен" : "Проверяем остаток"}</p></div><span className="wallet-transfer-detail-coin" aria-hidden="true">{named ? <CoinIcon symbol={token.symbol} networkId={network.id} size={44} ring="var(--bg)" /> : <UnverifiedTokenMark size={44} />}</span></section>
          {holding.verified ? <div className="wallet-token-actions wallet-transfer-detail-actions exm-coin-detail-actions"><ActionButton label="Получить" icon={<IconReceive size={22} />} onClick={() => setSheet("receive")} /><ActionButton label="Отправить" icon={<IconSend size={22} className="exm-coin-detail-send-icon" />} onClick={() => setSheet(source !== "wallet" ? "need" : "send")} /></div> : <div className="my-5 flex flex-col gap-3">
            {price !== undefined ? <Group><Row label={`Цена 1 ${token.symbol}`}>{formatUsd(price)}</Row></Group>
              : catalogQuote && !catalogQuote.loading ? <ErrorNote message="Цена токена недоступна." onRetry={catalogQuote.retry} /> : null}
            <p className="t-body2 c-2">{catalogQuote ? "EXM распознал токен по адресу контракта. Отправка и обмен этого токена недоступны." : "Название и символ взяты из контракта. Цена, отправка и обмен недоступны."}</p>
            <p className="t-body3 c-2 mono break-all">{token.address}</p>
          </div>}
        </div>
        <div className="exm-coin-detail-records">
          <section className="exm-coin-detail-history"><div className="exm-coin-detail-section-heading"><h2>Переводы {token.symbol}</h2></div><div className="exm-coin-detail-activity">
            {historyAvailable ? activity.isError ? <ErrorNote message="Переводы токена не загрузились." onRetry={() => activity.refetch()} /> : activity.isPending ? <div className="px-4 py-4"><Skeleton className="h-12 w-full" /></div> : transfers.length ? transfers.slice(0, 5).map((transfer) => {
              const incoming = transfer.to.toLowerCase() === address.toLowerCase()
              return <button key={transfer.id} type="button" onClick={() => setSelectedTransfer(transfer)} className="flex min-h-[68px] w-full items-center justify-between gap-3 px-4 py-2 text-left"><span className="min-w-0"><span className="t-label1 block">{incoming ? "Получение" : "Отправка"}</span><span className="t-body2 c-2 block truncate mono">{shortAddress(incoming ? transfer.from : transfer.to)} · {formatWhen(transfer.time)}</span></span><span className="t-label2 shrink-0" style={incoming ? { color: "var(--green)" } : undefined}>{incoming ? "+" : "−"}{formatCoin(transfer.value, token.decimals, token.symbol, 4)}</span></button>
            }) : <p className="t-body2 c-2 px-4 py-4">Переводов {token.symbol} пока нет.</p> : <p className="t-body2 c-2 px-4 py-4">История переводов {token.symbol} для этой сети пока недоступна.</p>}
          </div></section>
          {historyAvailable && network.explorer.url ? <a href={`${network.explorer.address(address)}?tab=token_transfers`} target="_blank" rel="noopener noreferrer" className="t-label2 mt-3 inline-flex min-h-11 items-center gap-1 self-start text-[var(--blue)]">Все переводы в {network.explorer.name}<IconExternal size={16} /></a> : null}
        </div>
      </div>

      <NeedWalletSheet open={sheet === "need"} onOpenChange={(o) => setSheet(o ? "need" : null)} action="send" />
      <Sheet open={sheet === "details"} onOpenChange={(o) => setSheet(o ? "details" : null)} title="Сведения о токене">
        <div className="flex flex-col gap-4 pb-2">{named ? <TransferAssetCard icon={<CoinIcon symbol={token.symbol} networkId={network.id} size={36} />} symbol={token.symbol} network={networkLabel(network)} /> : <p className="t-body2 c-2">Контракт {name} не проверен.</p>}<TransferReviewAddress label={network.family === "solana" ? "Адрес mint" : "Контракт токена"} name={name} address={token.address} /><TransferReviewAddress label="Адрес кошелька" name={networkLabel(network)} address={address} />{network.explorer.url ? <a href={network.explorer.address(address)} target="_blank" rel="noopener noreferrer" className="wallet-transfer-receipt-explorer">Адрес в {network.explorer.name}<IconExternal size={18} /><span className="sr-only">(в новой вкладке)</span></a> : null}</div>
      </Sheet>
      <TokenReceiveSheet open={sheet === "receive"} onOpenChange={(o) => setSheet(o ? "receive" : null)} holding={holding} />
      {source === "wallet" ? canBroadcastFromNetwork(network) ? <TokenSendSheet open={sheet === "send"} choosingAsset={choosingSendAsset} onOpenChange={(o) => setSheet(o ? "send" : null)} holding={holding} onChangeAsset={onChangeAsset} /> : <SendUnavailableSheet open={sheet === "send"} onOpenChange={(o) => setSheet(o ? "send" : null)} network={network} onReceive={() => setSheet("receive")} /> : null}
      <Sheet open={!!selectedTransfer} onOpenChange={(o) => !o && setSelectedTransfer(null)} title={`Перевод ${token.symbol}`} subtitle={networkLabel(network)}>
        {selectedTransfer ? <div className="flex flex-col gap-5 pb-2">
          <div className="flex flex-col items-center gap-2 pt-2 text-center">{named ? <CoinIcon symbol={token.symbol} networkId={network.id} size={56} /> : <UnverifiedTokenMark size={56} />}<p className="t-h2">{selectedTransfer.to.toLowerCase() === address.toLowerCase() ? "+" : "−"}{formatCoin(selectedTransfer.value, token.decimals, token.symbol)}</p><p className="t-body2 c-2">{formatWhen(selectedTransfer.time)}</p></div>
          <Group>
            <div className="flex flex-col gap-1 px-4 py-3"><span className="t-body2 c-2">От кого</span><span className="t-body2 mono break-all">{selectedTransfer.from}</span></div>
            <div className="flex flex-col gap-1 px-4 py-3"><span className="t-body2 c-2">Кому</span><span className="t-body2 mono break-all">{selectedTransfer.to}</span></div>
            <Row label="Сеть">{networkLabel(network)}</Row>
            <div className="flex flex-col gap-1 px-4 py-3"><span className="t-body2 c-2">Хэш операции</span><button type="button" onClick={async () => showToast(await copyText(selectedTransfer.hash) ? "Хэш скопирован" : "Браузер не дал скопировать хэш")} className="t-body2 mono min-h-11 break-all text-left text-[var(--blue)]">{selectedTransfer.hash}</button></div>
          </Group>
          <a href={selectedTransfer.url} target="_blank" rel="noopener noreferrer" className="t-label1 inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-group)] bg-[var(--fill)] text-[var(--blue)]">Открыть в {network.explorer.name}<IconExternal size={18} /><span className="sr-only">(в новой вкладке)</span></a>
        </div> : null}
      </Sheet>
      {toast}
    </Screen>
  )
}
