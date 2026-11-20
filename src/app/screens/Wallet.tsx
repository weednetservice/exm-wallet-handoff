/**
 * A coin in the wallet, as Keeper's token screen: logo, amount and value, the actions, the coin's
 * latest operations. Price charts live in Рынок. Plus the operation row shared with История.
 */
import { InfoIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { canBroadcastFromNetwork, networkLabel, type Activity } from "@/lib/chains"
import { formatCoin, formatPercent, formatUsd, shortAddress } from "@/lib/format"
import { useAccounts } from "../accounts"
import { isDemo } from "../demo"
import { useNav } from "../nav"
import { useActivity } from "../data"
import { ActionButton, copyText, ErrorNote, Group, IconButton, Row, Screen, ScreenHeader, Sheet, Skeleton, useToast } from "../ui"
import { IconCheck, IconChevronRight, IconContract, IconCopy, IconExternal, IconFailed, IconPending, IconReceive, IconSelf, IconSend, IconSwap } from "../glyph"
import { CoinIcon, NetworkCoin, NetworkMark } from "../marks"
import { NeedWalletSheet } from "../onboarding/Onboarding"
import { isService, opKind, opParty, opTitle, reason, shortWhen, type OpKind } from "../words"
import { readApproval } from "../history/approval"
import type { Holding } from "../home/portfolio"
import { ReceiveSheet } from "./sheets"
import { useLiveActivitySelection } from "../history/liveSelection"
import { SendSheet, SendUnavailableSheet } from "./send"
import { UnverifiedTokenMark } from "../tokens/TokenScreen"
import { assetName } from "../assetNames"
import "./wallet-detail.css"

export function TokenScreen({ holding, onBack, onChangeAsset, choosingSendAsset }: { holding: Holding; onBack: () => void; onChangeAsset?: (recipient?: string) => void; choosingSendAsset?: boolean }) {
  const queryClient = useQueryClient()
  const { network, address, source, amount, value, price } = holding
  const { go } = useNav()
  const { accounts } = useAccounts()
  const activity = useActivity(network, network.history ? address : undefined)
  const [sheet, setSheet] = useState<null | "send" | "receive" | "need" | "details">(null)
  const [selectedActivity, setSelectedActivity] = useLiveActivitySelection(activity.data ?? [])
  const [toast, showToast] = useToast()
  const symbol = network.native.symbol
  const canSwap = network.id === "sepolia" || network.id === "ethereum-mainnet"
  const demo = isDemo(accounts)
  const latest = activity.data?.filter((a) => !isService(a, demo)).slice(0, 5)

  return (
    <Screen className="wallet-token-screen wallet-transfer-detail exm-coin-detail">
      <ScreenHeader
        onBack={onBack}
        backLabel="Назад на главную"
        right={<IconButton label="Сведения о монете" onClick={() => setSheet("details")} className="exm-coin-detail-info"><InfoIcon size={21} weight="light" /></IconButton>}
      >
        <div className="flex min-w-0 max-w-full flex-col items-center text-center">
          <h1 className="t-label1">{assetName(symbol)}</h1>
        </div>
      </ScreenHeader>

      <div className="exm-coin-detail-layout">
        <div className="exm-coin-detail-holding">
          <section className="wallet-transfer-detail-hero" aria-label="Баланс">
            <div className="wallet-transfer-detail-copy">
              <p className="exm-coin-detail-context">{networkLabel(network)}</p>
              <p className="exm-coin-detail-balance">
                {amount !== undefined ? formatCoin(amount, network.native.decimals, symbol, 4) : holding.error ? <span className="t-h3 c-2">Баланс недоступен</span> : <Skeleton className="h-7 w-40 rounded-[8px]" />}
              </p>
              <p className="exm-coin-detail-equivalent">{network.environment === "testnet" ? "Без рыночной оценки · тестовая сеть" : value !== undefined ? `≈ ${formatUsd(value)}` : amount !== undefined ? "Курс недоступен" : holding.error ? "Повторите запрос" : "Проверяем остаток"}</p>
            </div>
            <span className="wallet-transfer-detail-coin" aria-hidden="true"><NetworkCoin network={network} size={44} ring="var(--bg)" /></span>
          </section>
          {holding.error && amount === undefined ? <div className="card mt-4 w-full text-left"><ErrorNote message={`Баланс не загрузился: ${reason(holding.error)}.`} onRetry={() => void queryClient.invalidateQueries({ queryKey: ["balance", network.id, address] })} /></div> : null}

          <div className="wallet-token-actions wallet-transfer-detail-actions exm-coin-detail-actions">
            <ActionButton label="Получить" icon={<IconReceive size={22} />} onClick={() => setSheet("receive")} />
            <ActionButton label="Отправить" icon={<IconSend size={22} className="exm-coin-detail-send-icon" />} onClick={() => setSheet(source === "wallet" ? "send" : "need")} />
            {canSwap ? <ActionButton label="Обмен" icon={<IconSwap size={22} className="exm-coin-detail-swap-icon" />} onClick={() => go("swap", network.environment)} /> : null}
          </div>

          {network.environment === "mainnet" && !canBroadcastFromNetwork(network) ? <p role="note" className="exm-coin-detail-readonly t-body2">Отправка в EXM пока недоступна. Перед пополнением проверьте способ восстановления в совместимом кошельке.</p> : null}
        </div>
        <div className="exm-coin-detail-records">
          <section className="exm-coin-detail-history">
            <div className="exm-coin-detail-section-heading"><h2>Последние операции</h2>{network.history && !!latest?.length ? <button type="button" onClick={() => {
            go("history", network.id)
            window.history.replaceState(window.history.state, "", `#history/${encodeURIComponent(network.id)}`)
          }}>Все<IconChevronRight size={16} /></button> : null}</div>
            <div className="exm-coin-detail-activity">
            {!network.history ? (
              <p className="t-body2 c-2 px-4 py-4">История этой сети недоступна в EXM. Баланс и получение монет доступны.</p>
            ) : latest ? (
              latest.length ? (
                latest.map((a) => <ActivityRow key={a.id} a={a} onOpen={() => setSelectedActivity(a)} />)
              ) : (
                <p className="t-body2 c-2 px-4 py-4">
                  {amount === 0n && network.environment === "testnet" ? `Здесь пока пусто. Тестовые ${symbol} бесплатно раздают краны: ссылки на экране «Получить».` : `Переводов ${symbol} пока нет.`}
                </p>
              )
            ) : activity.isError ? (
              <ErrorNote message={`История не загрузилась: ${reason(activity.error)}.`} onRetry={() => activity.refetch()} />
            ) : (
              <ActivitySkeleton rows={3} />
            )}
            </div>
          </section>
        </div>
      </div>

      <Sheet open={sheet === "details"} onOpenChange={(open) => setSheet(open ? "details" : null)} title={assetName(symbol)} subtitle={networkLabel(network)}>
      <Group className="exm-coin-detail-facts">
        <Row label="Сеть">{networkLabel(network)}</Row>
        <button type="button" onClick={async () => showToast((await copyText(address)) ? "Адрес скопирован" : "Браузер не дал скопировать адрес")} aria-label={`Скопировать адрес ${shortAddress(address)}`} className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span className="t-body2 c-2 shrink-0">Адрес</span>
          <span className="t-label2 mono flex min-w-0 items-center gap-2"><span className="truncate">{shortAddress(address, 8, 6)}</span><IconCopy size={18} className="shrink-0 text-[var(--blue)]" /></span>
        </button>
        {price !== undefined && network.environment === "mainnet" ? <Row label="Курс">{formatUsd(price)}</Row> : null}
        {holding.change24h !== undefined && network.environment === "mainnet" ? <Row label="Курс за 24 ч"><span style={{ color: holding.change24h >= 0 ? "var(--green)" : "var(--red)" }}>{formatPercent(holding.change24h)}</span></Row> : null}
      </Group>
      {network.explorer.url ? <a href={network.explorer.address(address)} target="_blank" rel="noopener noreferrer" className="exm-coin-detail-explorer">Адрес в {network.explorer.name}<IconExternal size={18} /></a> : null}
      </Sheet>

      <NeedWalletSheet open={sheet === "need"} onOpenChange={(o) => setSheet(o ? "need" : null)} action="send" />
      <ReceiveSheet open={sheet === "receive"} onOpenChange={(o) => setSheet(o ? "receive" : null)} network={network} address={address} watchOnly={holding.source === "watch"} />
      {source === "wallet" ? canBroadcastFromNetwork(network) ? (
        <SendSheet open={sheet === "send"} choosingAsset={choosingSendAsset} onOpenChange={(o) => setSheet(o ? "send" : null)} network={network} address={address} balance={amount} usdPrice={price} onChangeAsset={onChangeAsset} />
      ) : <SendUnavailableSheet open={sheet === "send"} onOpenChange={(o) => setSheet(o ? "send" : null)} network={network} onReceive={() => setSheet("receive")} /> : null}
      <ActivityDetailSheet activity={selectedActivity} onClose={() => setSelectedActivity(null)} />
      {toast}
    </Screen>
  )
}

export function ActivitySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-[72px] items-center gap-3 px-4 py-3">
          <Skeleton className="size-11 rounded-full" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-40" />
          </span>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
      <span className="sr-only">Операции загружаются</span>
    </div>
  )
}

const KIND_ICON: Record<OpKind, typeof IconSend> = { in: IconReceive, out: IconSend, self: IconSelf, swap: IconSwap, call: IconContract }

/**
 * Keeper's operation row: a round icon of the kind (with the network badge when the list mixes
 * networks), what happened and with whom, the signed amount (green when it came in) and the time.
 */
export function ActivityRow({ a, showNetwork = false, clockTime, onOpen }: { a: Activity; showNetwork?: boolean; clockTime?: boolean; onOpen?: () => void }) {
  const failed = a.status === "failed"
  const kind = opKind(a)
  const Icon = failed ? IconFailed : KIND_ICON[kind]
  const transfer = !failed && (kind === "in" || kind === "out" || kind === "self")
  const sign = !transfer ? "" : kind === "in" ? "+" : kind === "out" ? "−" : ""
  const when = a.time ? (clockTime ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(a.time) : shortWhen(a.time)) : a.status === "pending" ? "сейчас" : ""
  const party = opParty(a)
  return (
    <button type="button" onClick={onOpen} className="wallet-activity-row">
      <span className="wallet-activity-grid">
        <span aria-hidden="true" className="wallet-activity-icon" data-failed={failed || undefined}>
          <Icon size={19} />
          {showNetwork ? (
            <span className="wallet-activity-network">
              <NetworkMark networkId={a.network.id} size={14} />
            </span>
          ) : null}
        </span>
        <span className="wallet-activity-copy">
          <span className="t-label1">{opTitle(a)}</span>
          <span className="wallet-activity-meta">
            {a.status === "pending" ? <span style={{ color: "var(--orange)" }}>В обработке · </span> : failed ? <span style={{ color: "var(--red)" }}>Не выполнена · </span> : null}
            {a.unverified ? <span>Контракт не проверен · </span> : null}
            {party || (showNetwork ? networkLabel(a.network) : "")}
          </span>
        </span>
        <span className="wallet-activity-values">
          {a.amount > 0n && !transfer ? <span className="wallet-activity-meta">Сумма в транзакции</span> : null}
          {a.amount > 0n ? (
            <span className="wallet-activity-amount" data-incoming={kind === "in" && a.status === "confirmed" || undefined}>
              {sign}{formatCoin(a.amount, a.token?.decimals ?? a.network.native.decimals, a.token?.symbol ?? a.network.native.symbol, 4)}
            </span>
          ) : null}
          <span className="wallet-activity-meta">{when}</span>
        </span>
      </span>
    </button>
  )
}

export function ActivityDetailSheet({ activity: a, onClose }: { activity: Activity | null; onClose: () => void }) {
  const [toast, showToast] = useToast()
  const kind = a ? opKind(a) : null
  const transfer = a?.status !== "failed" && (kind === "in" || kind === "out" || kind === "self")
  const copyField = (label: string, value: string) => <div className="exm-activity-field"><div className="exm-activity-field-heading"><p>{label}</p><IconButton label={label === "Хэш" ? "Скопировать хэш" : `Скопировать: ${label.toLocaleLowerCase("ru-RU")}`} onClick={async () => showToast(await copyText(value) ? "Скопировано" : "Браузер не дал скопировать")}><IconCopy size={16} /></IconButton></div><p className="mono select-all">{value}</p></div>
  const isApproval = a?.title === "Разрешение на токен" && a.network.family === "evm"
  const approval = useQuery({
    queryKey: ["approval-details", a?.network.id, a?.hash],
    queryFn: ({ signal }) => readApproval(a!.network, a!.hash, signal),
    enabled: !!isApproval,
    staleTime: 60_000,
  })
  return (
    <Sheet open={!!a} onOpenChange={(open) => !open && onClose()} title="Операция">
      {a ? <div className="exm-activity-receipt">
        <div className="exm-activity-receipt-heading">
          <span className="exm-activity-status-icon" data-status={a.status} aria-hidden="true">{a.status === "confirmed" ? <IconCheck size={22} /> : a.status === "failed" ? <IconFailed size={22} /> : <IconPending size={22} />}</span>
          <div><p className="exm-activity-title">{opTitle(a)}</p><p className="exm-activity-status-label" role="status">{a.status === "confirmed" ? "Подтверждена в сети" : a.status === "failed" ? "Не выполнена" : "В обработке"}</p></div>
          <span className="exm-activity-coin" aria-hidden="true">{a.unverified ? <UnverifiedTokenMark size={36} /> : a.token ? <CoinIcon symbol={a.token.symbol} networkId={a.network.id} size={36} ring="var(--bg)" /> : <NetworkCoin network={a.network} size={36} ring="var(--bg)" />}</span>
        </div>
        {a.amount > 0n ? <>{!transfer ? <p className="t-body3 c-2">Сумма в транзакции</p> : null}<p className="exm-activity-amount">{!transfer ? "" : kind === "in" ? "+" : kind === "out" ? "−" : ""}{formatCoin(a.amount, a.token?.decimals ?? a.network.native.decimals, a.token?.symbol ?? a.network.native.symbol)}</p></> : null}
        <Group>
          <Row label="Сеть">{networkLabel(a.network)}</Row>
          {a.counterparty ? copyField(isApproval ? "Контракт токена" : a.direction === "in" ? "Отправитель" : a.direction === "out" && opKind(a) === "out" ? "Получатель" : opKind(a) === "self" ? "Свой адрес" : "Контракт или адрес", a.counterparty) : null}
          {a.token ? copyField(`Адрес токена${a.unverified ? " · не проверен" : ""}`, a.token.address) : null}
          {isApproval ? approval.data ? <>
            {copyField(`Токен · ${approval.data.tokenName}`, approval.data.tokenContract)}
            {copyField("Кому разрешено списывать", approval.data.spender)}
            <Row label="Лимит разрешения">{approval.data.limit}</Row>
          </> : <div className="t-body2 c-2 px-4 py-3">{approval.isPending ? "Читаем адрес и лимит разрешения…" : approval.isError ? "Не удалось проверить адрес и лимит разрешения. Откройте транзакцию в обозревателе." : "Параметры этого разрешения не распознаны. Проверьте транзакцию в обозревателе."}</div> : null}
          {a.fee !== undefined ? <Row label="Комиссия">{formatCoin(a.fee, a.network.native.decimals, a.network.native.symbol)}</Row> : null}
          {a.time ? <Row label="Время">{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(a.time)}</Row> : null}
          {copyField("Хэш", a.hash)}
        </Group>
        {isApproval && approval.data ? <p className="t-body3 c-2 px-1">Это лимит на момент операции. Текущие права могли измениться после неё.</p> : null}
        {a.unverified ? <p className="t-body2 c-2 px-1">Контракт не проверен EXM. Название и символ предоставлены обозревателем сети.</p> : null}
        {a.explorerUrl.startsWith("https://") ? <a href={a.explorerUrl} target="_blank" rel="noopener noreferrer" className="exm-coin-detail-explorer">Открыть в {a.network.explorer.name || "обозревателе"}<IconExternal size={18} /></a> : null}
        {toast}
      </div> : null}
    </Sheet>
  )
}
