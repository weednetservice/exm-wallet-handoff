import { InfoIcon, PushPin } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { formatCoin, formatPercent, formatUsd } from "@/lib/format"
import { canBroadcastFromNetwork, networkLabel, type Network } from "@/lib/chains"
import { CoinIcon } from "../marks"
import { IconChevronDown, IconChevronRight, IconReceive, IconSend } from "../glyph"
import { ActionButton, ErrorNote, Screen, ScreenHeader, Group, IconButton, Row, Sheet, Skeleton } from "../ui"
import type { Holding, TokenHolding } from "./portfolio"
import { assetName } from "../assetNames"
import { useNav } from "../nav"
import "../screens/wallet-detail.css"

export type CoinPart = {
  id: string
  network: Network
  amount?: bigint
  value?: number
  symbol: string
  decimals: number
  holding: Holding | TokenHolding
}
export type CoinGroup = { symbol: string; environment: Network["environment"]; parts: CoinPart[]; amount?: bigint; value?: number; price?: number; change24h?: number; decimals: number }
export type CoinAction = "send" | "receive"
const networkCount = (count: number) => {
  const form = new Intl.PluralRules("ru-RU").select(count)
  return `${count} ${form === "one" ? "сеть" : form === "few" ? "сети" : "сетей"}`
}

export function coinGroups(holdings: Holding[], tokens: TokenHolding[]): CoinGroup[] {
  const parts: CoinPart[] = [
    ...holdings.map((h) => ({ id: h.network.id, network: h.network, amount: h.amount, value: h.value, symbol: h.network.native.symbol, decimals: h.network.native.decimals, holding: h })),
    ...tokens.map((h) => ({ id: `token:${h.network.id}:${h.token.address}`, network: h.network, amount: h.amount, value: h.value, symbol: h.token.symbol, decimals: h.token.decimals, holding: h })),
  ]
  const byAsset = new Map<string, CoinPart[]>()
  for (const part of parts) {
    const key = `${part.network.environment}:${part.symbol}`
    byAsset.set(key, [...(byAsset.get(key) ?? []), part])
  }
  return [...byAsset].map(([, items]) => {
    const symbol = items[0].symbol
    const environment = items[0].network.environment
    const decimals = Math.max(...items.map((i) => i.decimals))
    return {
      symbol,
      environment,
      parts: items,
      decimals,
      price: items.find((i) => i.holding.price !== undefined)?.holding.price,
      change24h: items.find((i) => i.holding.change24h !== undefined)?.holding.change24h,
      // Custom test networks can use the same ticker with a different precision.
      amount: items.every((i) => i.amount !== undefined) ? items.reduce((sum, i) => sum + i.amount! * 10n ** BigInt(decimals - i.decimals), 0n) : undefined,
      value: items.every((i) => i.value !== undefined || i.amount === 0n) ? items.reduce((sum, i) => sum + (i.value ?? 0), 0) : undefined,
    }
  }) // keep network catalogue order stable while asynchronous balances arrive
}

export function CoinGroupRow({ group, onClick, hideBalances = false, pinned = false }: { group: CoinGroup; onClick: () => void; hideBalances?: boolean; pinned?: boolean }) {
  const single = group.parts.length === 1
  const networkDetail = single ? networkLabel(group.parts[0].network) : `${networkCount(group.parts.length)} · ${group.environment === "mainnet" ? "основные" : "тестовые"}`
  const coinAmount = group.amount !== undefined ? formatCoin(group.amount, group.decimals, group.symbol, 4).trim() : undefined
  const balanceFailed = group.parts.some((part) => part.amount === undefined && part.holding.error)
  const mainnet = group.environment === "mainnet"
  const fiat = mainnet && group.value !== undefined ? formatUsd(group.value) : undefined
  const balanceStatus = balanceFailed ? "Не загружен" : undefined
  const valueText = hideBalances ? "••••"
    : fiat ?? (coinAmount === undefined ? balanceStatus : mainnet ? "Курс недоступен" : coinAmount)
  const fiatParts = !hideBalances ? fiat?.match(/^(.*?)(\d+(?:,\d+)?\s*\$)$/) : undefined
  const change = !hideBalances && fiat !== undefined ? group.change24h : undefined
  return (
    <button type="button" onClick={onClick} className="wallet-asset-row exm-home-asset-row grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 text-left">
      <span className="wallet-asset-row-icon"><CoinIcon symbol={group.symbol} size={36} /></span>
      <span className="wallet-asset-row-name min-w-0">
        <span className="wallet-asset-row-symbol"><span>{assetName(group.symbol)}</span>{pinned ? <><PushPin size={14} weight="fill" aria-hidden="true" /><span className="sr-only">Закреплено</span></> : null}</span>
        <span className="wallet-asset-row-detail c-2 block">{mainnet && !hideBalances && coinAmount
          ? <>{coinAmount}<span className="sr-only"> · {networkDetail}</span></>
          : <span className="exm-home-asset-mobile-network">{networkDetail}</span>}</span>
      </span>
      <span className="exm-home-asset-network" aria-hidden="true">{networkDetail}</span>
      <span className="wallet-asset-row-values flex min-w-0 flex-col items-end text-right">
        <span className="exm-home-asset-value" data-muted={!hideBalances && fiat === undefined}>
          {fiatParts ? <>{fiatParts[1]}<span className="exm-home-fiat-tail">{fiatParts[2]}</span></> : valueText ?? <><Skeleton className="w-14" /><span className="sr-only">Проверяем остаток</span></>}
        </span>
        {change !== undefined ? <span className={`exm-home-price-line ${change >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{formatPercent(change)}</span> : null}
      </span>
    </button>
  )
}

export function CoinGroupScreen({ group, onBack, onPart, onAction, onNeedWallet }: { group: CoinGroup; onBack: () => void; onPart: (part: CoinPart) => void; onAction: (kind: CoinAction, part: CoinPart) => void; onNeedWallet: () => void }) {
  // The sum is derived from live per-network balances. No cached amount from another network is reused.
  const parts = useMemo(() => [...group.parts].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)), [group.parts])
  const [choosing, setChoosing] = useState<CoinAction | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { go } = useNav()
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null)
  const expanded = expandedSymbol === group.symbol
  const zeroParts = parts.filter((part) => part.amount === 0n)
  const failedParts = parts.filter((part) => part.amount === undefined && part.holding.error)
  const shownParts = expanded || zeroParts.length === parts.length ? parts : parts.filter((part) => part.amount !== 0n)
  const eligible = choosing === "send" ? parts.filter((part) => part.holding.source === "wallet") : parts
  const begin = (kind: CoinAction) => {
    const available = kind === "send" ? parts.filter((part) => part.holding.source === "wallet") : parts
    if (!available.length) return onNeedWallet()
    if (available.length === 1) return onAction(kind, available[0])
    setChoosing(kind)
  }
  const choose = (part: CoinPart) => {
    const kind = choosing
    setChoosing(null)
    if (kind) onAction(kind, part)
  }
  return (
    <Screen className="wallet-coin-group-screen exm-coin-detail">
      <ScreenHeader onBack={onBack} backLabel="Назад на главную" right={<IconButton label="Сведения о монете" onClick={() => setDetailsOpen(true)} className="exm-coin-detail-info"><InfoIcon size={21} weight="light" /></IconButton>}><div className="flex min-w-0 flex-col items-center text-center"><h1>{assetName(group.symbol)}</h1><p className="t-body3 c-2">{networkCount(group.parts.length)} · {group.environment === "mainnet" ? "основные" : "тестовые"}</p></div></ScreenHeader>
      <div className="exm-coin-detail-layout">
        <div className="exm-coin-detail-holding">
          <section className="wallet-transfer-detail-hero" aria-label="Баланс монеты">
            <div className="wallet-transfer-detail-copy"><p>Баланс {group.symbol}</p>
            <p className="exm-coin-detail-balance">{group.amount !== undefined ? formatCoin(group.amount, group.decimals, group.symbol, 4) : failedParts.length ? <span className="exm-coin-detail-unavailable">Баланс недоступен</span> : <Skeleton className="h-10 w-40" />}</p>
            <p className="exm-coin-detail-equivalent">{group.environment === "testnet" ? "Без рыночной оценки · тестовые сети" : group.value !== undefined ? `≈ ${formatUsd(group.value)}` : group.amount === undefined ? failedParts.length ? "Не все остатки доступны" : "Проверяем остатки" : "Курс недоступен"}</p></div>
            <span className="wallet-transfer-detail-coin" aria-hidden="true"><CoinIcon symbol={group.symbol} size={44} ring="var(--bg)" /></span>
          </section>
          {failedParts.length ? <ErrorNote message={`Не удалось проверить остатки: ${failedParts.map((part) => networkLabel(part.network)).join(", ")}.`} onRetry={() => { for (const part of failedParts) void queryClient.invalidateQueries({ queryKey: "token" in part.holding ? ["token-balance", part.network.id, part.holding.token.address, part.holding.address] : ["balance", part.network.id, part.holding.address] }) }} /> : null}
          <div className="wallet-coin-actions exm-coin-detail-actions">
            <ActionButton label="Получить" icon={<IconReceive size={22} />} onClick={() => begin("receive")} />
            <ActionButton label="Отправить" icon={<IconSend size={22} className="exm-coin-detail-send-icon" />} onClick={() => begin("send")} />
          </div>
        </div>
        <div className="exm-coin-detail-records">
          <div className="exm-coin-detail-section-heading"><h2>По сетям</h2><button type="button" onClick={() => go("history", group.environment)} aria-label={`Открыть историю ${group.environment === "mainnet" ? "основных" : "тестовых"} сетей`}>История<IconChevronRight size={16} /></button></div>
          <Group className="exm-coin-detail-networks">
            {shownParts.map((part) => (
              <button key={part.id} type="button" onClick={() => onPart(part)} className="wallet-coin-network-row grid min-h-[68px] w-full grid-cols-[40px_minmax(0,1fr)_18px] items-center gap-x-3 px-3 py-3 text-left">
                <span className="wallet-coin-network-icon"><CoinIcon symbol={group.symbol} networkId={part.network.id} size={40} /></span>
                <span className="wallet-coin-network-name t-label1 min-w-0 break-words">{networkLabel(part.network)}</span>
                <span className="wallet-coin-network-amount t-label2 min-w-0 break-words">{part.amount !== undefined ? formatCoin(part.amount, part.decimals, group.symbol, 4) : part.holding.error ? "Не загружен" : <Skeleton className="w-20" />}</span>
                <IconChevronRight size={18} className="wallet-coin-network-chevron c-2" />
              </button>
            ))}
            {zeroParts.length > 0 && zeroParts.length < parts.length ? <button type="button" aria-expanded={expanded} onClick={() => setExpandedSymbol(expanded ? null : group.symbol)} className="t-body2 flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[var(--blue)]">
              <span>{expanded ? "Скрыть сети без остатка" : `Ещё ${networkCount(zeroParts.length)}`}</span>
              <IconChevronDown size={18} className="shrink-0 transition-transform duration-200 motion-reduce:transition-none" style={expanded ? { transform: "rotate(180deg)" } : undefined} />
            </button> : null}
          </Group>
        </div>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen} title={assetName(group.symbol)} subtitle={group.environment === "mainnet" ? "Основные сети" : "Тестовые сети"}>
        <Group><Row label="Монета">{group.symbol}</Row><Row label="Сети">{networkCount(group.parts.length)}</Row>{group.environment === "mainnet" && group.price !== undefined ? <Row label="Курс">{formatUsd(group.price)}</Row> : null}{group.environment === "mainnet" && group.change24h !== undefined ? <Row label="Курс за 24 ч"><span style={{ color: group.change24h >= 0 ? "var(--green)" : "var(--red)" }}>{formatPercent(group.change24h)}</span></Row> : null}</Group>
        <p className="t-body2 c-2 pt-4">{group.environment === "testnet" ? "Тестовые монеты не имеют рыночной стоимости. Адрес получения и остаток доступны отдельно в каждой сети." : "Общий остаток складывается из выбранных сетей. Адрес получения и доступные действия проверьте на экране сети."}</p>
      </Sheet>
      <Sheet open={!!choosing} onOpenChange={(open) => !open && setChoosing(null)} title={choosing === "send" ? `Отправить ${group.symbol}` : `Получить ${group.symbol}`} subtitle={group.environment === "mainnet" ? "Выберите основную сеть" : "Выберите тестовую сеть"}>
        <Group>
          {eligible.map((part) => {
            const receiveOnly = choosing === "send" && !canBroadcastFromNetwork(part.network)
            return <button key={part.id} type="button" onClick={() => choose(part)} className="wallet-coin-network-row grid min-h-[68px] w-full grid-cols-[40px_minmax(0,1fr)_18px] items-center gap-x-3 px-3 py-3 text-left">
              <span className="wallet-coin-network-icon"><CoinIcon symbol={group.symbol} networkId={part.network.id} size={40} /></span>
              <span className="wallet-coin-network-name t-label1 min-w-0 break-words">{networkLabel(part.network)}</span>
              <span className="wallet-coin-network-amount t-label2 min-w-0 break-words">{receiveOnly ? "Только получение" : part.amount !== undefined ? formatCoin(part.amount, part.decimals, group.symbol, 4) : part.holding.error ? "Не загружен" : <Skeleton className="w-20" />}</span>
              <IconChevronRight size={18} className="wallet-coin-network-chevron c-2" />
            </button>
          })}
        </Group>
      </Sheet>
    </Screen>
  )
}
