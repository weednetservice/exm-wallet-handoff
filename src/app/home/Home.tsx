/**
 * Главная: wallet identity, balance, actions, saved recipients and assets.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { AddressBook, GearSix, GlobeSimple, Key, LockKey, PaintBrush, PencilSimple, ShieldCheck, Trash, UserPlus } from "@phosphor-icons/react"
import { flushSync } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"
import { formatCoin, formatPercent, formatUsd, shortAddress } from "@/lib/format"
import { canBroadcastFromNetwork, isBroadcastDisabled, networkLabel, type ChainFamily, type Network } from "@/lib/chains"
import { useAccounts, type AccountMap } from "../accounts"
import { useNav } from "../nav"
import { useVault } from "../vault"
import { ActionButton, copyText, ErrorNote, Group, IconButton, PrimaryButton, Screen, SecondaryButton, Sheet, SheetReturnFocus, Skeleton, useToast } from "../ui"
import { IconBell, IconChevronDown, IconChevronRight, IconCopy, IconEye, IconEyeOff, IconPlus, IconReceive, IconScan, IconSend, IconSwap } from "../glyph"
import { CoinIcon, NetworkCoin } from "../marks"
import { NeedWalletSheet, PasswordField, useStartFlow, Welcome, WordsGrid } from "../onboarding/Onboarding"
import { BackupView, backupTitle, deleteNote, restoreLabel, SecurityGroup, useWords } from "../onboarding/Biometry"
import { ActivityDetailSheet, ActivityRow, TokenScreen } from "../screens/Wallet"
import { WatchSheet } from "../screens/sheets"
import { ReceiveAddressSheet } from "../screens/ReceiveAddressSheet"
import { SendSheet, SendUnavailableSheet } from "../screens/send"
import { useAllActivity, useHoldings, type Holding, type TokenHolding } from "./portfolio"
import { NetworksSheet } from "./Networks"
import { TokenRow, TokenScreen as UsdcScreen, TokenSendSheet } from "../tokens/TokenScreen"
import { CoinGroupRow, CoinGroupScreen, coinGroups, type CoinGroup } from "./CoinGroups"
import { AssetPinsSheet, useAssetPins } from "./AssetPins"
import { PortfolioSheet } from "../portfolio/PortfolioSheet"
import { AddressBookSheet } from "../addressBook"
import { useAddressBook, type SavedAddress } from "../addressBook/store"
import { quickContactCaption } from "../addressBook/caption"
import { QrSendSheet } from "./QrSendSheet"
import "./home-screen.css"
import { readAppearance, saveAppearance, type Appearance } from "../appearance"
import { AllowanceSheet } from "../allowances/AllowanceSheet"
import { PersonAvatar } from "../avatars"
import { SceneArt } from "../art/scenes"
import { AppearancePicker } from "./AppearancePicker"
import { assetName } from "../assetNames"
import { useWalletName } from "../preferences"
import { MAINNET_SWAP_SIGNING_ENABLED } from "../swap/mainnet"
import { useLiveActivitySelection } from "../history/liveSelection"


const FAMILY_NAME: Record<ChainFamily, string> = { evm: "Ethereum и Base", solana: "Solana", ton: "TON", bitcoin: "Bitcoin" }
/** the mark of each address row: the family's coin, ETH with the Base badge for the address both use */
const FAMILY_MARK: Record<ChainFamily, { symbol: string; networkId: string }> = {
  evm: { symbol: "ETH", networkId: "ethereum-mainnet" },
  solana: { symbol: "SOL", networkId: "solana-mainnet" },
  ton: { symbol: "TON", networkId: "" },
  bitcoin: { symbol: "BTC", networkId: "bitcoin-mainnet" },
}

type Pick = "send" | "receive"
type Asset = Holding | TokenHolding
type PendingAction = { kind: Pick; holding: Asset; recipient?: string }
const isToken = (asset: Asset): asset is TokenHolding => "token" in asset
function matchesActionHolding(snapshot: Asset, candidate: Asset) {
  const same = (a: string, b: string) => snapshot.network.family === "evm" ? a.toLowerCase() === b.toLowerCase() : a === b
  return candidate.network.id === snapshot.network.id &&
    candidate.network.family === snapshot.network.family && candidate.network.chainId === snapshot.network.chainId && candidate.network.environment === snapshot.network.environment &&
    candidate.source === snapshot.source && same(candidate.address, snapshot.address) &&
    (isToken(snapshot) ? isToken(candidate) && same(candidate.token.address, snapshot.token.address) : !isToken(candidate))
}
export function resolveActionHolding(snapshot: Asset, candidates: readonly Asset[]): Asset {
  return candidates.find((candidate) => matchesActionHolding(snapshot, candidate)) ?? snapshot
}
const networkCountLabel = (count: number) => {
  const form = new Intl.PluralRules("ru-RU").select(count)
  return `${count} ${form === "one" ? "сеть" : form === "few" ? "сети" : "сетей"}`
}
const missingAssetLabel = (count: number) => {
  const form = new Intl.PluralRules("ru-RU").select(count)
  return `${count} ${form === "one" ? "актив" : form === "few" ? "актива" : "активов"}`
}

function walletName(accounts: AccountMap) {
  const list = Object.values(accounts).filter(Boolean) as { address: string; source: string }[]
  if (list.some((a) => a.source === "wallet")) return "Мой кошелёк"
  if (list.length === 1) return "Только просмотр"
  return "Только просмотр"
}

function HomeBalanceFigure({ number, unit }: { number: string; unit?: string }) {
  const frame = useRef<HTMLSpanElement>(null)
  const measure = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const figure = frame.current
    const natural = measure.current
    const container = figure?.parentElement
    if (!figure || !natural || !container) return
    let pendingFrame: number | undefined
    let previousWidth = -1
    let previousNaturalWidth = -1
    let previousSize = -1
    const fit = () => {
      pendingFrame = undefined
      const available = container.clientWidth
      const width = natural.getBoundingClientRect().width
      const size = parseFloat(getComputedStyle(natural).fontSize)
      if (available === previousWidth && Math.abs(width - previousNaturalWidth) < .01 && size === previousSize) return
      previousWidth = available
      previousNaturalWidth = width
      previousSize = size
      const nextSize = `${Math.round(size * Math.min(1, Math.max(available - 1, 0) / Math.max(width, 1)) * 1000) / 1000}px`
      if (figure.style.fontSize !== nextSize) figure.style.fontSize = nextSize
    }
    fit()
    const observer = new ResizeObserver(() => {
      if (pendingFrame === undefined) pendingFrame = requestAnimationFrame(fit)
    })
    observer.observe(container)
    observer.observe(natural)
    return () => {
      observer.disconnect()
      if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame)
    }
  }, [number, unit])
  return <>
    <span className="exm-home-balance-measure" aria-hidden="true">
      <span ref={measure} className="exm-home-balance-natural">
        <span className="exm-home-balance-number">{number}</span>
        {unit ? <span className="exm-home-balance-unit">{unit}</span> : null}
      </span>
    </span>
    <span ref={frame} className="exm-home-balance-figure"><span className="exm-home-balance-number">{number}</span>{unit ? <span className="exm-home-balance-unit">{unit}</span> : null}</span>
  </>
}

export function HomeScreen() {
  const { status } = useVault()
  const { holdings, tokens, unverifiedTokens, hiddenUnverifiedByEnvironment, discoveryLoadingByEnvironment, discoveryErrors, mainnetTotal, partialBalanceByEnvironment, missingBalanceByEnvironment, loading, error, refetch } = useHoldings()
  const { accounts } = useAccounts()
  const accountAddress = Object.values(accounts).find(Boolean)?.address
  const { name: displayWalletName } = useWalletName(accountAddress)
  const { contacts } = useAddressBook()
  const { go } = useNav()
  const startWalletFlow = useStartFlow()
  const walletTrigger = useRef<HTMLButtonElement>(null)
  const addWalletTrigger = useRef<HTMLButtonElement>(null)
  const watchChoice = useRef<HTMLButtonElement>(null)
  const portfolioTrigger = useRef<HTMLButtonElement>(null)
  const [walletInitialView, setWalletInitialView] = useState<WalletRootView>("main")
  const assetFromUrl = () => {
    const [tab, id] = window.location.hash.slice(1).split("/")
    if (tab !== "home" || !id) return null
    try { return decodeURIComponent(id) } catch { return null }
  }
  const [assetId, setAssetId] = useState<string | null>(assetFromUrl)
  useLayoutEffect(() => { if (assetId) window.scrollTo(0, 0) }, [assetId])
  useEffect(() => {
    const restore = () => setAssetId(assetFromUrl())
    window.addEventListener("popstate", restore)
    window.addEventListener("hashchange", restore)
    return () => {
      window.removeEventListener("popstate", restore)
      window.removeEventListener("hashchange", restore)
    }
  }, [])
  const [sheet, setSheet] = useState<null | "wallet" | "need" | "watch" | "add-wallet" | "book" | "qr" | "add" | "updates" | "pins" | "portfolio">(null)
  const [bookView, setBookView] = useState<"list" | "add">("list")
  const [toast, showToast] = useToast()
  const [balancesHidden, setBalancesHidden] = useState(() => {
    try { return localStorage.getItem("exm.home.hide-balances") === "true" } catch { return false }
  })
  const [pick, setPick] = useState<Pick | null>(null)
  const [recipientForPick, setRecipientForPick] = useState<SavedAddress | null>(null)
  const [assetChange, setAssetChange] = useState<{ holding: Asset; recipient?: string } | null>(null)
  const [action, setAction] = useState<PendingAction | null>(null)
  const { pins, setPinned } = useAssetPins()
  const [showEmpty, setShowEmpty] = useState(false)
  const [showUnverified, setShowUnverified] = useState(false)
  const environment = "mainnet" as const
  const visibleHoldings = holdings.filter((holding) => holding.network.environment === environment)
  const visibleTokens = tokens.filter((holding) => holding.network.environment === environment)
  const sendableAssets = [...visibleHoldings, ...visibleTokens].filter((holding) => holding.source === "wallet" && canBroadcastFromNetwork(holding.network))
  const quickContacts = contacts.filter((contact) => sendableAssets.some((holding) => holding.network.family === contact.family)).slice(0, 3)
  const discoveredAssets = unverifiedTokens.filter((holding) => holding.network.environment === environment)
  const catalogAssets = discoveredAssets.filter((holding) => holding.catalogQuote)
  const visibleUnverified = discoveredAssets.filter((holding) => !holding.catalogQuote)
  const openDiscoveredAsset = (holding: TokenHolding) => {
    const id = `token:${holding.network.id}:${holding.token.address}`
    window.history.pushState({ exmAsset: true }, "", `#home/${encodeURIComponent(id)}`)
    setAssetId(id)
  }
  const visibleTotal = mainnetTotal
  const partialTotal = visibleTotal === undefined ? partialBalanceByEnvironment.mainnet : undefined
  const missingBalances = missingBalanceByEnvironment.mainnet
  const groups = coinGroups(visibleHoldings, visibleTokens)
  const pinnedGroups = groups.filter((group) => pins.includes(group.symbol))
  const otherGroups = groups.filter((group) => !pins.includes(group.symbol))
  const emptyGroups = otherGroups.filter((group) => group.amount === 0n)
  const shownGroups = [...pinnedGroups, ...otherGroups.filter((group) => showEmpty || group.amount !== 0n)]
  const asset = holdings.find((h) => h.network.id === assetId)
  const tokenAsset = [...tokens, ...unverifiedTokens].find((t) => assetId === `token:${t.network.id}:${t.token.address}`)
  const coinAsset = assetId?.startsWith("coin:") ? coinGroups(holdings, tokens).find((g) => `coin:${g.environment}:${g.symbol}` === assetId) : undefined
  const hasAccounts = Object.values(accounts).some(Boolean)
  const verifiedAssets = [...visibleHoldings, ...visibleTokens]
  const knownZero = visibleHoldings.length > 0 && verifiedAssets.every((asset) => asset.amount === 0n)
  const allBalancesUnknown = verifiedAssets.length > 0 && verifiedAssets.every((asset) => asset.amount === undefined)
  const visibleBalanceError = verifiedAssets.find((asset) => asset.amount === undefined && asset.error)?.error
  const balanceLoadFailed = !!visibleBalanceError || (allBalancesUnknown && !!error)
  const pricedAssets = verifiedAssets.filter((holding) => (holding.value ?? 0) > 0)
  const previousTotal = visibleTotal !== undefined && pricedAssets.length > 0 && pricedAssets.every((holding) => holding.change24h !== undefined && holding.change24h > -100)
    ? pricedAssets.reduce((sum, holding) => sum + holding.value! / (1 + holding.change24h! / 100), 0)
    : undefined
  const totalChange = previousTotal !== undefined && previousTotal > 0 ? visibleTotal! - previousTotal : undefined
  const hasUnverified = visibleUnverified.length > 0 || hiddenUnverifiedByEnvironment[environment] > 0
  const discoveryFailed = discoveryErrors.some((item) => item.network.environment === environment)
  const verifiedEmpty = knownZero && !loading && !error && !hasUnverified && !catalogAssets.length && !discoveryLoadingByEnvironment[environment] && !discoveryFailed
  const priceFailed = !!error && !balanceLoadFailed && verifiedAssets.some((asset) => asset.amount !== undefined && asset.amount > 0n && asset.value === undefined)

  const changeSendAsset = (recipient?: string, from?: Asset) => {
    const holding = from ?? action?.holding
    if (!holding) return
    setAssetChange({ holding, recipient: recipient?.trim() || undefined })
  }

  const assetChangePicker = <PickSheet
    kind={assetChange ? "send" : null}
    assets={sendableAssets}
    onClose={() => setAssetChange(null)}
    onBackFromList={() => setAssetChange(null)}
    onPick={(holding) => {
      if (!assetChange) return
      setAssetChange(null)
      if (matchesActionHolding(assetChange.holding, holding)) return
      const recipient = assetChange.holding.network.family === holding.network.family ? assetChange.recipient : undefined
      setAction({ kind: "send", holding, recipient })
      if (assetId) {
        setAssetId(null)
        window.history.replaceState(null, "", "#home")
      }
    }}
  />
  const receiveParts = action?.kind === "receive" ? groups.find((group) => group.symbol === (isToken(action.holding) ? action.holding.token.symbol : action.holding.network.native.symbol))?.parts : undefined
  const liveAction = action ? { ...action, holding: resolveActionHolding(action.holding, [...holdings, ...tokens, ...unverifiedTokens]) } : null
  const actionSheets = <AssetActionSheets action={liveAction} choosingAsset={!!assetChange} onClose={() => setAction(null)} onReceive={(holding) => setAction({ kind: "receive", holding })} onChangeAsset={changeSendAsset} receiveNetworks={receiveParts?.map((part) => part.network)} onReceiveNetwork={(networkId) => {
    const part = receiveParts?.find((candidate) => candidate.network.id === networkId)
    if (part) setAction({ kind: "receive", holding: part.holding })
  }} />

  const backFromAsset = () => {
      if (window.history.state?.exmAsset) window.history.back()
      else {
        window.history.replaceState(null, "", "#home")
        setAssetId(null)
      }
  }
  if (tokenAsset) return <><UsdcScreen holding={tokenAsset} onBack={backFromAsset} onChangeAsset={(recipient) => changeSendAsset(recipient, tokenAsset)} choosingSendAsset={!!assetChange} />{assetChangePicker}</>
  if (asset) return <><TokenScreen holding={asset} onBack={backFromAsset} onChangeAsset={(recipient) => changeSendAsset(recipient, asset)} choosingSendAsset={!!assetChange} />{assetChangePicker}</>
  if (coinAsset) return <>
    <CoinGroupScreen group={coinAsset} onBack={backFromAsset} onPart={(part) => {
      window.history.pushState({ exmAsset: true }, "", `#home/${encodeURIComponent(part.id)}`)
      setAssetId(part.id)
    }} onAction={(kind, part) => setAction({ kind, holding: part.holding })} onNeedWallet={() => setSheet("need")} />
    <NeedWalletSheet open={sheet === "need"} onOpenChange={(open) => setSheet(open ? "need" : null)} action="send" />
    {actionSheets}
    {assetChangePicker}
  </>

  if (!hasAccounts) {
    return (
      <Screen className="pb-0">
        <Welcome onWatch={() => setSheet("watch")} />
        <WatchSheet open={sheet === "watch"} onOpenChange={(open) => setSheet(open ? "watch" : null)} />
      </Screen>
    )
  }

  const open = (kind: Pick) => {
    setRecipientForPick(null)
    const assets: Asset[] = [...visibleHoldings, ...visibleTokens]
    const usable = kind === "send" ? assets.filter((h) => h.source === "wallet") : assets
    // watching only: sending needs EXM's own wallet
    if (!usable.length) return setSheet("need")
    if (usable.length === 1) setAction({ kind, holding: usable[0] })
    else setPick(kind)
  }
  const sendToContact = (contact: SavedAddress) => {
    const assets = sendableAssets.filter((holding) => holding.network.family === contact.family)
    if (!assets.length) return setSheet("need")
    if (assets.length === 1) setAction({ kind: "send", holding: assets[0], recipient: contact.address })
    else if (assets.length) { setRecipientForPick(contact); setPick("send") }
  }
  const toggleBalances = () => {
    const next = !balancesHidden
    setBalancesHidden(next)
    try { localStorage.setItem("exm.home.hide-balances", String(next)) } catch { /* preference remains available for this session */ }
  }

  const accountName = Object.values(accounts).some((account) => account?.source === "wallet") ? displayWalletName : walletName(accounts)
  const staleBalance = visibleTotal !== undefined && !!error
  const showBalanceError = !!error
  const showPartialTotal = partialTotal !== undefined && partialTotal > 0
  const displayedTotal = visibleTotal ?? (showPartialTotal ? partialTotal : undefined)
  const reserveBalanceDetail = !balancesHidden && (displayedTotal === undefined || displayedTotal > 0)
  const watchOnly = status !== "unlocked"
  const hasSendBalance = !balancesHidden && !watchOnly && sendableAssets.some((item) => item.amount !== undefined && item.amount > 0n)
  const balanceUnavailable = showBalanceError && displayedTotal === undefined
  const balanceNote = balancesHidden ? "Остатки скрыты"
    : staleBalance ? "Последний проверенный баланс"
    : showPartialTotal ? `Частичный баланс · не учтено ${missingAssetLabel(missingBalances)}`
    : balanceUnavailable && priceFailed ? "Остатки доступны в монетах."
    : null
  const openGroup = (group: CoinGroup) => {
    const id = group.parts.length === 1 ? group.parts[0].id : `coin:${group.environment}:${group.symbol}`
    window.history.pushState({ exmAsset: true }, "", `#home/${encodeURIComponent(id)}`)
    setAssetId(id)
  }
  const openWallet = (view: WalletRootView, trigger: HTMLButtonElement) => {
    walletTrigger.current = trigger
    setWalletInitialView(view)
    setSheet("wallet")
  }

  return (
    <Screen className="wallet-home-screen exm-home">
      <div className="exm-home-dashboard">
          <header className="exm-home-header">
            <h1 className="exm-home-title">Портфель</h1>
            {status === "unlocked"
              ? <IconButton label="Сканировать QR" onClick={() => setSheet("qr")} className="exm-home-utility exm-home-scan"><IconScan size={22} /></IconButton>
              : <IconButton id="home-add-wallet" label="Добавить кошелёк или адрес" aria-haspopup="dialog" onClick={(event) => {
                addWalletTrigger.current = event.currentTarget
                event.currentTarget.focus({ preventScroll: true })
                setSheet("add-wallet")
              }} className="exm-home-utility exm-home-scan"><IconPlus size={22} /></IconButton>}
            <div className="exm-home-account-area">
              <button
                type="button"
                onClick={(event) => openWallet("main", event.currentTarget)}
                aria-label={`${accountName}: адреса кошелька`}
                className="exm-home-account"
                data-readonly={watchOnly || undefined}
              >
                <span className="exm-home-avatar"><PersonAvatar identity={accountAddress} kind="account" size={40} /></span>
                <span className="exm-home-account-copy">
                  <span className="exm-home-account-name"><span>{accountName}</span><IconChevronDown size={14} /></span>
                  <span className="exm-home-account-address">{accountAddress ? shortAddress(accountAddress, 4, 4) : "Адреса кошелька"}</span>
                </span>
              </button>
              {accountAddress ? <IconButton label="Скопировать адрес кошелька" className="exm-home-copy-address" onClick={async () => showToast(await copyText(accountAddress) ? "Адрес скопирован" : "Не удалось скопировать адрес")}><IconCopy size={15} /></IconButton> : null}
            </div>
            <div className="exm-home-utilities">
              <IconButton label="Последние операции" onClick={() => setSheet("updates")} className="exm-home-utility"><IconBell size={21} /></IconButton>
              <IconButton label="Открыть настройки" onClick={(event) => openWallet("settings", event.currentTarget)} className="exm-home-utility exm-home-settings"><GearSix size={21} weight="light" aria-hidden="true" /></IconButton>
            </div>
          </header>
          <section className="exm-home-overview" aria-label="Сводка портфеля">
            <div className="wallet-home-balance" aria-label="Баланс">
              <div className="exm-home-balance-heading">
                <span>Общий баланс</span>
                <IconButton label={balancesHidden ? "Показать остатки" : "Скрыть остатки"} aria-pressed={balancesHidden} onClick={toggleBalances} className="exm-home-privacy">{balancesHidden ? <IconEyeOff size={17} /> : <IconEye size={17} />}</IconButton>
              </div>
              <p className="wallet-home-total" aria-live="polite" data-unavailable={balanceUnavailable && !balancesHidden}>
                {balancesHidden ? "•••••"
                  : displayedTotal !== undefined ? <HomeBalanceFigure number={formatUsd(displayedTotal).replace(/\s*\$$/, "")} unit="$" />
                  : balanceUnavailable ? <span className="exm-home-balance-unavailable">{priceFailed ? "Курс недоступен" : "Баланс недоступен"}</span>
                  : <Skeleton className="h-10 w-44 max-w-full rounded-[10px]" />}
              </p>
              {reserveBalanceDetail || showBalanceError || balanceNote || totalChange !== undefined ? (
                <div className="exm-home-balance-detail" data-reserved={reserveBalanceDetail || undefined}>
                  {balanceNote ? <span>{balanceNote}</span> : !showBalanceError && totalChange !== undefined ? <span className="exm-home-change" title="Изменение стоимости текущих остатков по курсу за 24 ч"><span className="exm-home-change-badge" data-negative={totalChange < 0}><span aria-hidden="true">{totalChange < 0 ? "↓" : "↑"}</span>{formatPercent(totalChange / previousTotal! * 100)}</span><span>{totalChange >= 0 ? "+" : "−"}{formatUsd(Math.abs(totalChange))} (24 ч)</span></span> : null}
                  {showBalanceError ? <button type="button" onClick={refetch} className="exm-home-retry">Обновить баланс</button> : null}
                </div>
              ) : null}
            </div>

            <div className="wallet-home-actions" data-count={status !== "unlocked" ? 2 : MAINNET_SWAP_SIGNING_ENABLED ? 4 : 3}>
              {MAINNET_SWAP_SIGNING_ENABLED && status === "unlocked" ? <ActionButton label="Купить" icon={<IconPlus size={24} />} onClick={() => setSheet("add")} /> : null}
              <ActionButton label="Получить" icon={<IconReceive size={24} />} onClick={() => open("receive")} primary={!hasSendBalance} />
              {status === "unlocked" && !isBroadcastDisabled() ? <ActionButton label="Отправить" icon={<IconSend size={24} className="exm-home-send-icon" />} onClick={() => open("send")} primary={hasSendBalance} /> : null}
              <ActionButton label={MAINNET_SWAP_SIGNING_ENABLED ? "Обмен" : "Расчёт обмена"} icon={<IconSwap size={24} className="exm-home-swap-icon" />} onClick={() => go("swap", environment)} />
            </div>
          </section>

        <div className="exm-home-asset-column">
        <section className="exm-home-inventory" aria-labelledby="exm-home-assets-heading">
          <div className="exm-home-section-heading">
            <h2 id="exm-home-assets-heading">Активы</h2>
            <div className="exm-home-asset-tools">
              {accounts.evm || accounts.solana ? <button ref={portfolioTrigger} type="button" className="exm-home-see-all" aria-haspopup="dialog" onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); setSheet("portfolio") }}>Активы по сетям</button> : null}
              {emptyGroups.length > 0 && !allBalancesUnknown ? <button type="button" className="exm-home-see-all" aria-expanded={showEmpty} aria-controls="exm-home-assets" onClick={() => setShowEmpty((value) => !value)}>{showEmpty ? "Скрыть нулевые" : "Все активы"}</button> : null}
              {groups.length > 0 ? <button type="button" className="exm-home-see-all" aria-label="Закрепить активы" aria-haspopup="dialog" onClick={() => setSheet("pins")}>Закрепить</button> : null}
            </div>
          </div>

          {!visibleHoldings.length ? (
            <section className="flex flex-col items-center gap-3 px-4 pt-6 text-center">
              <h3 className="t-label1">Сети для этих адресов не выбраны</h3>
              <p className="t-body2 c-2">Включите нужную основную сеть для адреса, который есть в кошельке.</p>
              <SecondaryButton onClick={(event) => openWallet("networks", event.currentTarget)} className="mt-1 w-auto px-8">Управлять сетями</SecondaryButton>
            </section>
          ) : (
            <div id="exm-home-assets" className="wallet-asset-list exm-home-assets">
              {knownZero && !shownGroups.length && !balancesHidden ? <div className="exm-home-empty">
                {verifiedEmpty ? <SceneArt variant="empty" size={136} /> : null}
                <p>{verifiedEmpty
                  ? watchOnly ? "На адресах просмотра пока нет активов." : "Здесь появятся ваши активы после первого пополнения."
                  : loading || discoveryLoadingByEnvironment[environment] ? "Проверяем активы…" : "У проверенных активов пока нет остатка."}</p>
              </div> : null}
              {allBalancesUnknown && !balanceLoadFailed ? <p className="exm-home-asset-status" aria-live="polite">Проверяем остатки…</p> : null}
              {shownGroups.length ? <div className="exm-home-asset-columns" aria-hidden="true">
                <span>Актив</span><span>Сеть</span><span>Стоимость</span>
              </div> : null}
              {shownGroups.map((group) => (
                <CoinGroupRow key={group.symbol} group={group} pinned={pins.includes(group.symbol)} hideBalances={balancesHidden} onClick={() => openGroup(group)} />
              ))}
            </div>
          )}

          {catalogAssets.length ? <section className="exm-home-catalog" aria-labelledby="exm-home-catalog-heading">
            <h3 id="exm-home-catalog-heading" className="t-label2">Распознанные токены</h3>
            <p className="t-body3 c-2">Рыночная оценка отдельно от баланса.</p>
            <Group>{catalogAssets.map((holding) => <TokenRow key={holding.token.address} holding={holding} hideBalances={balancesHidden} onClick={() => openDiscoveredAsset(holding)} />)}</Group>
          </section> : null}

          {hasUnverified || discoveryFailed ? <section className="flex flex-col gap-2 pt-4">
            <button type="button" aria-expanded={showUnverified} onClick={() => setShowUnverified((current) => !current)} className="exm-home-unverified-toggle t-label2 flex min-h-12 items-center justify-between gap-3 text-left text-[var(--label-2)]">
              <span>{hasUnverified ? `Непроверенные токены · ${visibleUnverified.length + hiddenUnverifiedByEnvironment[environment]}` : "Проверка токенов недоступна"}</span>
              <IconChevronDown size={18} className={showUnverified ? "rotate-180" : ""} />
            </button>
            {visibleUnverified.length || hiddenUnverifiedByEnvironment[environment] ? <p className="t-body3 c-2 px-4">Не входят в сумму портфеля.</p> : null}
            {showUnverified ? <>
              <p className="t-body3 c-2 px-4">Название и символ взяты из контракта. Цена, отправка и обмен недоступны.</p>
              {discoveryErrors.filter((item) => item.network.environment === environment).map((item) => <div key={item.network.id} className="card"><ErrorNote message={`Токены в сети ${networkLabel(item.network)} не загрузились.`} onRetry={() => item.retry()} /></div>)}
              {discoveryLoadingByEnvironment[environment] && !visibleUnverified.length ? <p className="t-body2 c-2 px-4">Ищем токены на адресе…</p> : null}
              {visibleUnverified.length ? <Group>{visibleUnverified.map((holding) => <TokenRow key={`${holding.network.id}:${holding.token.address}`} holding={holding} hideBalances={balancesHidden} onClick={() => openDiscoveredAsset(holding)} />)}</Group> : null}
              {hiddenUnverifiedByEnvironment[environment] ? <p className="t-body3 c-2 px-4">Ещё {hiddenUnverifiedByEnvironment[environment]} токенов скрыто из списка. Полный список доступен в обозревателе адреса.</p> : null}
            </> : null}
          </section> : null}

        </section>

        {quickContacts.length ? <section className="exm-home-contacts" aria-labelledby="exm-home-contacts-heading">
          <div className="exm-home-contacts-heading"><h2 id="exm-home-contacts-heading">Быстрый перевод</h2><button type="button" onClick={() => { setBookView("list"); setSheet("book") }} className="exm-home-book-link" aria-label="Открыть контакты"><IconChevronRight size={17} /></button></div>
          <div className="exm-home-contact-list">
            {quickContacts.map((contact) => <button key={contact.id} type="button" onClick={() => sendToContact(contact)} className="exm-home-contact" aria-label={`Отправить ${contact.name}, ${shortAddress(contact.address, 6, 4)}`}>
              <PersonAvatar identity={contact.id} kind="contact" size={40} />
              <span className="exm-home-contact-name" title={contact.name}>{quickContactCaption(contact, contacts)}</span>
            </button>)}
            <button type="button" onClick={() => { setBookView("add"); setSheet("book") }} className="exm-home-contact" aria-label="Добавить контакт"><span className="exm-home-contact-avatar exm-home-contact-more"><IconPlus size={24} /></span><span className="exm-home-contact-name">Добавить</span></button>
          </div>
        </section> : null}
        </div>
        {!balancesHidden ? <aside className="exm-home-aside" aria-label="Операции и распределение">
          <section className="exm-home-recent" aria-labelledby="exm-home-recent-heading">
            <div className="exm-home-section-heading">
              <h2 id="exm-home-recent-heading">Операции</h2>
              <button type="button" className="exm-home-see-all" onClick={() => go("history")}>Вся история<IconChevronRight size={16} /></button>
            </div>
            <HomeActivityPanel environment={environment} />
          </section>
          {visibleTotal !== undefined && visibleTotal > 0 && !showBalanceError
            ? <PortfolioAllocation groups={groups} onSelect={openGroup} /> : null}
        </aside> : null}
      </div>

      <SheetReturnFocus.Provider value={walletTrigger}>
        <WalletSheet key={walletInitialView} initialView={walletInitialView} open={sheet === "wallet"} onOpenChange={(o) => setSheet(o ? "wallet" : null)} />
      </SheetReturnFocus.Provider>
      <SheetReturnFocus.Provider value={portfolioTrigger}>
        <PortfolioSheet open={sheet === "portfolio"} onOpenChange={(open) => setSheet(open ? "portfolio" : null)} accounts={accounts} balancesHidden={balancesHidden} />
      </SheetReturnFocus.Provider>
      <SheetReturnFocus.Provider value={addWalletTrigger}>
        <Sheet open={sheet === "add-wallet"} onOpenChange={(open) => setSheet(open ? "add-wallet" : null)} title="Добавить кошелёк или адрес">
          <div className="exm-add-wallet-options">
            {status === "empty" ? <>
              <button type="button" className="exm-add-wallet-option" aria-label="Создать кошелёк" onClick={() => { setSheet(null); startWalletFlow("create") }}>
                <IconPlus size={22} /><span><strong>Создать кошелёк</strong><small>Новая фраза восстановления</small></span><IconChevronRight size={18} />
              </button>
              <button type="button" className="exm-add-wallet-option" aria-label="Импортировать кошелёк" onClick={() => { setSheet(null); startWalletFlow("import") }}>
                <Key size={22} aria-hidden="true" /><span><strong>Импортировать кошелёк</strong><small>У меня есть фраза из 12 или 24 слов</small></span><IconChevronRight size={18} />
              </button>
            </> : null}
            <button ref={watchChoice} type="button" className="exm-add-wallet-option" aria-label="Добавить адрес для просмотра" onClick={() => setSheet("watch")}>
              <IconEye size={22} /><span><strong>Добавить адрес для просмотра</strong><small>Остатки и операции по публичному адресу</small></span><IconChevronRight size={18} />
            </button>
          </div>
        </Sheet>
        <WatchSheet open={sheet === "watch"} onOpenChange={(open) => setSheet(open ? "watch" : null)} onBack={() => {
          setSheet("add-wallet")
          requestAnimationFrame(() => watchChoice.current?.focus({ preventScroll: true }))
        }} onAdded={() => setSheet(null)} />
      </SheetReturnFocus.Provider>
      <AddressBookSheet key={bookView} initialView={bookView} open={sheet === "book"} onOpenChange={(open) => setSheet(open ? "book" : null)} />
      {MAINNET_SWAP_SIGNING_ENABLED ? <Sheet open={sheet === "add"} onOpenChange={(open) => setSheet(open ? "add" : null)} title="Купить монеты">
        <p className="t-body2 c-2 px-1 pb-4">Оплата другой монетой из кошелька. Выберите актив и проверьте условия обмена.</p>
        <Group>{["ETH", "USDC", "DAI"].map((symbol) => <button key={symbol} type="button" onClick={() => { setSheet(null); go("swap", `buy:${symbol}`) }} className="flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left"><CoinIcon symbol={symbol} size={36} /><span className="min-w-0 flex-1"><span className="t-label1 block">{assetName(symbol)}</span><span className="t-body3 c-2">{symbol}</span></span><IconChevronRight size={18} className="c-2" /></button>)}</Group>
      </Sheet> : null}
      <AssetPinsSheet open={sheet === "pins"} onOpenChange={(open) => setSheet(open ? "pins" : null)} groups={groups} pins={pins} setPinned={setPinned} />
      <Sheet open={sheet === "updates"} onOpenChange={(open) => setSheet(open ? "updates" : null)} title="Последние операции"><HomeActivityPanel environment={environment} onOpenAll={() => { setSheet(null); go("history", environment) }} /></Sheet>
      <QrSendSheet open={sheet === "qr"} assets={[...visibleHoldings, ...visibleTokens]} onClose={() => setSheet(null)} onPick={(holding, recipient) => { setSheet(null); setAction({ kind: "send", holding, recipient }) }} />
      <NeedWalletSheet open={sheet === "need"} onOpenChange={(o) => setSheet(o ? "need" : null)} action="send" />
      <PickSheet
        kind={pick}
        recipient={pick === "send" ? recipientForPick : null}
        assets={pick === "send"
          ? recipientForPick
            ? sendableAssets.filter((holding) => holding.network.family === recipientForPick.family)
            : [...visibleHoldings, ...visibleTokens].filter((h) => h.source === "wallet")
          : [...visibleHoldings, ...visibleTokens]}
        onClose={() => { setPick(null); setRecipientForPick(null) }}
        onPick={(h) => {
          const kind = pick!
          setPick(null)
          setAction({ kind, holding: h, recipient: kind === "send" ? recipientForPick?.address : undefined })
          setRecipientForPick(null)
        }}
      />
      {actionSheets}
      {assetChangePicker}
      {toast}
    </Screen>
  )
}

const allocationColors = ["#4168df", "#278e90", "#ba7522", "#8d68c5", "#4275a5", "#a05a71"]
const allocationPercent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 })

function PortfolioAllocation({ groups, onSelect }: { groups: CoinGroup[]; onSelect: (group: CoinGroup) => void }) {
  const assets = groups.flatMap((group) => group.value !== undefined && group.value > 0 ? [{ group, value: group.value }] : [])
    .sort((a, b) => b.value - a.value)
  if (!assets.length) return null
  const total = assets.reduce((sum, asset) => sum + asset.value, 0)
  const slices = assets.map(({ group, value }, index) => ({
    group,
    share: value / total,
    color: allocationColors[index % allocationColors.length],
  }))
  return <section className="exm-allocation" aria-labelledby="exm-allocation-heading">
    <h2 id="exm-allocation-heading">Распределение</h2>
    <div className="exm-allocation-bar" aria-hidden="true">
      {slices.map(({ group, share, color }) => <span key={group.symbol} style={{ flexGrow: share, backgroundColor: color }} />)}
    </div>
    <ul className="exm-allocation-list">
      {slices.map(({ group, share, color }) => {
        const displayedShare = share < .001 ? "< 0,1 %"
          : share > .999 && slices.length > 1 ? "> 99,9 %" : allocationPercent.format(share)
        return (
          <li key={group.symbol}>
            <button type="button" onClick={() => onSelect(group)} aria-label={`Доля ${group.symbol}: ${displayedShare}`}>
              <span className="exm-allocation-key" style={{ backgroundColor: color }} aria-hidden="true" />
              <span>{group.symbol}</span><span>{displayedShare}</span>
            </button>
          </li>
        )
      })}
    </ul>
  </section>
}

function HomeActivityPanel({ environment, onOpenAll }: { environment: "mainnet"; onOpenAll?: () => void }) {
  const { items, loading, errors, noHistory } = useAllActivity()
  const [selected, setSelected] = useLiveActivitySelection(items)
  const recent = items.filter((item) => item.network.environment === environment).slice(0, 4)
  const unavailable = noHistory.some((network) => network.environment === environment)
  return <section className="exm-home-activity" aria-label="Последние операции" aria-live="polite">
    {recent.length ? recent.map((item) => <ActivityRow key={`${item.network.id}:${item.id}`} a={item} showNetwork onOpen={() => setSelected(item)} />)
      : <div className="exm-home-activity-empty">
        <p className="t-label1">{loading ? "Загружаем операции" : errors.some((item) => item.network.environment === environment) ? "История недоступна" : "Операций пока нет"}</p>
        <p className="t-body2 c-2">{loading ? "Проверяем подключённые сети" : unavailable ? "Часть сетей не предоставляет историю" : "Новые переводы появятся здесь"}</p>
      </div>}
    {recent.length && onOpenAll ? <button type="button" className="exm-home-activity-more" onClick={onOpenAll}>Вся история<IconChevronRight size={17} /></button> : null}
    <ActivityDetailSheet activity={selected} onClose={() => setSelected(null)} />
  </section>
}

function AssetActionSheets({ action, choosingAsset, onClose, onReceive, onChangeAsset, receiveNetworks, onReceiveNetwork }: {
  action: PendingAction | null
  choosingAsset: boolean
  onClose: () => void
  onReceive: (holding: Asset) => void
  onChangeAsset?: (recipient?: string) => void
  receiveNetworks?: readonly Network[]
  onReceiveNetwork: (networkId: string) => void
}) {
  if (!action) return null
  const close = (open: boolean) => { if (!open) onClose() }
  const { holding } = action
  const { network, address } = holding
  if (action.kind === "receive") {
    const token = isToken(holding) ? holding.token : undefined
    return <ReceiveAddressSheet open onOpenChange={close} network={network} address={address} symbol={token?.symbol ?? network.native.symbol} icon={token ? <CoinIcon symbol={token.symbol} networkId={network.id} size={36} /> : <NetworkCoin network={network} size={36} />} watchOnly={holding.source === "watch"} networks={receiveNetworks} onSelectNetwork={onReceiveNetwork} />
  }
  if (!canBroadcastFromNetwork(network)) return <SendUnavailableSheet open onOpenChange={close} network={network} onReceive={() => onReceive(holding)} />
  if (isToken(holding)) return <TokenSendSheet key={`${network.id}:${holding.token.address}`} open choosingAsset={choosingAsset} onOpenChange={close} holding={holding} initialRecipient={action.recipient} onChangeAsset={onChangeAsset} />
  return <SendSheet key={network.id} open choosingAsset={choosingAsset} onOpenChange={close} network={network} address={address} balance={holding.amount} usdPrice={holding.price} initialRecipient={action.recipient} onChangeAsset={onChangeAsset} />
}

/* ----------------------------------------------------------------- wallet sheet */

type View = "main" | "settings" | "appearance" | "name" | "reveal" | "phrase" | "delete" | "forget" | "backup" | "networks" | "allowances" | "contacts" | "watch-address"
type WalletRootView = Extract<View, "main" | "settings" | "networks">

function WalletSettingsRow({ icon, label, value, onClick, disclosure = true, danger = false }: { icon: ReactNode; label: string; value?: string; onClick: () => void; disclosure?: boolean; danger?: boolean }) {
  return <button type="button" onClick={onClick} className="wallet-settings-row" data-danger={danger || undefined}>
    <span className="wallet-settings-row-icon" aria-hidden="true">{icon}</span>
    <span className="wallet-settings-row-copy"><span>{label}</span>{value ? <span className="wallet-settings-row-value">{value}</span> : null}</span>
    {disclosure ? <IconChevronRight size={18} className="wallet-settings-row-chevron" /> : null}
  </button>
}

/**
 * The pill's sheet, all of the wallet in one place: its addresses (copy), Face ID and the copy in
 * iCloud, the recovery phrase, locking, deleting it from this device and managing watch-only addresses.
 */
function WalletSheet({ open, onOpenChange, initialView }: { open: boolean; onOpenChange: (o: boolean) => void; initialView: WalletRootView }) {
  const { accounts, unwatch } = useAccounts()
  const vault = useVault()
  const walletNamePreference = useWalletName(Object.values(accounts).find((account) => account?.source === "wallet")?.address)
  const [draftName, setDraftName] = useState("")
  const [nameError, setNameError] = useState("")
  const start = useStartFlow()
  const w = useWords()
  const [toast, showToast] = useToast()
  const [view, setView] = useState<View>(initialView)
  const [appearance, setAppearance] = useState<Appearance>(readAppearance)
  const [password, setPassword] = useState("")
  const [wrong, setWrong] = useState(false)
  const [words, setWords] = useState<string[] | null>(null)
  const revealEpoch = useRef(0)
  const revealMounted = useRef(false)
  const revealOpen = useRef(open)
  revealOpen.current = open
  const revealOwner = useRef(vault.keys?.evm.address)
  revealOwner.current = vault.keys?.evm.address
  useEffect(() => {
    revealMounted.current = true
    return () => { revealMounted.current = false; revealEpoch.current += 1 }
  }, [])
  useEffect(() => {
    if (view !== "phrase" && view !== "reveal") return
    const conceal = () => {
      revealEpoch.current += 1
      flushSync(() => { setWords(null); setPassword(""); setWrong(false); setView("reveal") })
    }
    const visibility = () => { if (document.hidden) conceal() }
    window.addEventListener("blur", conceal)
    window.addEventListener("pagehide", conceal)
    document.addEventListener("visibilitychange", visibility)
    return () => {
      window.removeEventListener("blur", conceal)
      window.removeEventListener("pagehide", conceal)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [view])
  const rows = (["evm", "solana", "bitcoin"] as const).flatMap((f) => (accounts[f] ? [{ family: f, ...accounts[f]! }] : []))
  const watched = rows.filter((r) => r.source === "watch")
  const own = vault.status === "unlocked"
  const bioOn = own && vault.biometry.enabled

  const reset = () => {
    revealEpoch.current += 1
    setView(initialView)
    setPassword("")
    setWrong(false)
    setWords(null)
  }
  const backToSettings = () => {
    revealEpoch.current += 1
    setView("settings")
    setPassword("")
    setWrong(false)
    setWords(null)
  }
  const close = (o: boolean) => {
    if (!o) reset()
    onOpenChange(o)
  }

  if (view === "name") return <Sheet open={open} onOpenChange={close} fullscreen fitDesktop title="Название кошелька" onBack={backToSettings}>
    <form className="flex flex-col gap-4 pt-3" onSubmit={(event) => {
      event.preventDefault()
      const result = walletNamePreference.rename(draftName)
      if (!result.ok) return setNameError(result.error ?? "Не удалось сохранить название")
      setView("settings")
      showToast("Название сохранено")
    }}>
      <label htmlFor="wallet-display-name" className="t-body1">Название</label>
      <input id="wallet-display-name" value={draftName} maxLength={24} autoComplete="off" onChange={(event) => { setDraftName(event.target.value); setNameError("") }} aria-invalid={!!nameError} aria-describedby="wallet-name-hint" className="t-body1 min-h-14 rounded-[16px] border border-[var(--separator)] bg-[var(--grouped)] px-4" />
      <p id="wallet-name-hint" className="t-body2 c-2">Видно только на этом устройстве. Адреса и секретная фраза останутся прежними.</p>
      {nameError ? <p role="alert" className="t-body2 text-[var(--red)]">{nameError}</p> : null}
      <PrimaryButton type="submit" disabled={!draftName.trim()}>Сохранить</PrimaryButton>
    </form>
  </Sheet>

  if (view === "appearance") return <Sheet open={open} onOpenChange={close} fullscreen title="Оформление" onBack={backToSettings}>
    <div className="wallet-settings-content">
      <AppearancePicker value={appearance} onChange={(value) => { setAppearance(value); saveAppearance(value) }} />
      <p className="t-body2 c-2 px-1">Системное оформление меняется вместе с настройками устройства.</p>
    </div>
  </Sheet>

  if (view === "backup")
    return (
      <Sheet open={open} onOpenChange={close} fullscreen title={backupTitle(vault.backup)} onBack={backToSettings}>
        <BackupView />
      </Sheet>
    )

  if (view === "contacts") return <AddressBookSheet open={open} onOpenChange={close} onBackFromList={backToSettings} />
  if (view === "watch-address") return <WatchSheet open={open} onOpenChange={close} onBack={backToSettings} />

  if (view === "networks")
    return <NetworksSheet open={open} onOpenChange={close} onBack={backToSettings} />

  if (view === "allowances")
    return <AllowanceSheet open={open} onOpenChange={close} onBack={backToSettings} />

  // the phrase is shown by the wallet password only, Face ID or not: the device passcode must not be enough
  if (view === "reveal")
    return (
      <Sheet open={open} onOpenChange={close} fullscreen title="Секретная фраза" onBack={backToSettings}>
        <form
          className="flex flex-col gap-3 pb-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const epoch = revealEpoch.current
            const owner = revealOwner.current
            const stillActive = () => revealMounted.current && revealOpen.current && revealEpoch.current === epoch && revealOwner.current === owner && !document.hidden
            try {
              const revealed = await vault.reveal(password)
              if (!stillActive()) return
              setWords(revealed)
              setPassword("")
              setView("phrase")
            } catch {
              if (stillActive()) setWrong(true)
            }
          }}
        >
          <p className="t-body2 c-2 px-1">
            Введите пароль, чтобы увидеть фразу. Проверьте, что рядом никого нет.{bioOn ? ` ${w.name ?? "Вход без пароля"} здесь не подойдёт: фраза открывается только паролем кошелька.` : ""}
          </p>
          <PasswordField id="reveal-pw" label="Пароль" value={password} onChange={(v) => (setPassword(v), setWrong(false))} invalid={wrong} autoFocus autoComplete="current-password" describedBy="reveal-hint" />
          {wrong ? (
            <p id="reveal-hint" role="alert" className="t-body2 px-1 text-[var(--red)]">
              Неверный пароль
            </p>
          ) : null}
          <PrimaryButton type="submit" disabled={!password}>
            Показать фразу
          </PrimaryButton>
        </form>
      </Sheet>
    )

  if (view === "phrase" && words)
    return (
      <Sheet open={open} onOpenChange={close} fullscreen title="Секретная фраза" onBack={backToSettings}>
        <div className="flex flex-col gap-4 pb-2">
          <WordsGrid words={words} />
          <p className="t-body2 c-2 px-1">Кто знает эти слова, тот распоряжается монетами. Не делайте скриншот и никому их не показывайте.</p>
        </div>
      </Sheet>
    )

  if (view === "delete")
    return (
      <Sheet open={open} onOpenChange={close} title="Удалить кошелёк?" onBack={backToSettings}>
        <div className="flex flex-col gap-3 pb-2">
          <p className="t-body1 c-2 px-1">
            {(() => {
              const b = vault.backup
              const note = deleteNote(b, w, vault.biometry.keyed)
              const kept = b.state === "saved" || b.state === "verified" || b.state === "file"
              return kept ? `Кошелёк сотрётся с этого устройства. ${note}` : `Кошелёк сотрётся с этого устройства. Вернуть его можно будет только по секретной фразе: проверьте, что она записана.${note ? ` ${note}` : ""}`
            })()}
          </p>
          <button
            type="button"
            onClick={() => {
              vault.remove()
              close(false)
            }}
            className="t-label1 min-h-14 rounded-[var(--radius-group)] bg-[var(--grouped)] text-[var(--red)] transition-colors hover:bg-[var(--tint)]"
          >
            Удалить кошелёк
          </button>
          <SecondaryButton onClick={backToSettings}>Отмена</SecondaryButton>
        </div>
      </Sheet>
    )

  if (view === "forget")
    return (
      <Sheet open={open} onOpenChange={close} title="Удалить адреса?" onBack={backToSettings}>
        <div className="flex flex-col gap-3 pb-2">
          <p className="t-body1 c-2 px-1">Адреса для просмотра пропадут из EXM в этом браузере. Их можно добавить снова.</p>
          <button
            type="button"
            onClick={() => {
              watched.forEach((r) => unwatch(r.family))
              close(false)
            }}
            className="t-label1 min-h-14 rounded-[var(--radius-group)] bg-[var(--grouped)] text-[var(--red)] transition-colors hover:bg-[var(--tint)]"
          >
            Удалить адреса
          </button>
          <SecondaryButton onClick={backToSettings}>Отмена</SecondaryButton>
        </div>
      </Sheet>
    )

  if (view === "main") return (
    <Sheet open={open} onOpenChange={close} title={own ? "Кошелёк" : "Адреса"}>
      <div className="wallet-account-content">
        <header className="wallet-account-identity">
          <PersonAvatar identity={Object.values(accounts).find(Boolean)?.address} kind="account" size={48} />
          <div><h2>{own ? walletNamePreference.name : "Адреса для просмотра"}</h2><p>{own ? "Ключи на этом устройстве" : "Отправка недоступна"}</p></div>
        </header>
        <section className="wallet-account-addresses" aria-labelledby="wallet-account-addresses-heading">
          <h2 id="wallet-account-addresses-heading">{own ? "Адреса кошелька" : "Сети"}</h2>
          {rows.map((r) => (
            <div key={r.family} className="wallet-account-address-row">
              <CoinIcon symbol={FAMILY_MARK[r.family].symbol} networkId={FAMILY_MARK[r.family].networkId} size={36} />
              <span className="wallet-account-address-copy">
                <span>{FAMILY_NAME[r.family]}</span>
                <span className="mono">{shortAddress(r.address)}</span>
              </span>
              <IconButton label={`Скопировать адрес ${FAMILY_NAME[r.family]}`} onClick={async () => showToast((await copyText(r.address)) ? "Адрес скопирован" : "Браузер не дал скопировать")}>
                <IconCopy size={22} />
              </IconButton>
            </div>
          ))}
        </section>

        <div className="wallet-account-settings"><WalletSettingsRow icon={<GearSix size={20} />} label="Настройки кошелька" onClick={() => setView("settings")} /></div>

        {!own && vault.status === "empty" ? <div className="flex flex-col gap-2"><PrimaryButton onClick={() => (close(false), start("create"))}>Создать кошелёк</PrimaryButton><SecondaryButton onClick={() => (close(false), start("import"))}>У меня есть кошелёк</SecondaryButton></div> : null}
      </div>
      {toast}
    </Sheet>
  )

  return (
    <Sheet open={open} onOpenChange={close} fullscreen title="Настройки" onBack={initialView === "settings" ? () => close(false) : () => setView("main")}>
      <div className="wallet-settings-content">
        <section className="wallet-settings-section" aria-labelledby="wallet-settings-wallet-heading">
          <h2 id="wallet-settings-wallet-heading">Кошелёк</h2>
          <div className="wallet-settings-rows">
            {own ? <WalletSettingsRow icon={<PencilSimple size={20} />} label="Название" value={walletNamePreference.name} onClick={() => { setDraftName(walletNamePreference.name); setNameError(""); setView("name") }} /> : null}
            <WalletSettingsRow icon={<GlobeSimple size={20} />} label="Сети" onClick={() => setView("networks")} />
            {!own ? <WalletSettingsRow icon={<UserPlus size={20} />} label="Добавить адрес для просмотра" onClick={() => setView("watch-address")} /> : null}
            <WalletSettingsRow icon={<AddressBook size={20} />} label="Контакты" onClick={() => setView("contacts")} />
            {own ? <WalletSettingsRow icon={<ShieldCheck size={20} />} label="Разрешения контрактам" onClick={() => setView("allowances")} /> : null}
          </div>
        </section>

        <section className="wallet-settings-section" aria-labelledby="wallet-settings-app-heading">
          <h2 id="wallet-settings-app-heading">Приложение</h2>
          <WalletSettingsRow icon={<PaintBrush size={20} />} label="Оформление" value={{ system: "Системное", light: "Светлое", dark: "Тёмное" }[appearance]} onClick={() => setView("appearance")} />
        </section>

        {own ? (
          <section className="wallet-settings-section wallet-settings-security" aria-labelledby="wallet-settings-security-heading">
            <h2 id="wallet-settings-security-heading">Безопасность</h2>
            <SecurityGroup onBackup={() => setView("backup")} />
            <div className="wallet-settings-rows">
            <WalletSettingsRow icon={<Key size={20} />} label="Показать секретную фразу" onClick={() => setView("reveal")} />
            <WalletSettingsRow icon={<LockKey size={20} />} label="Заблокировать" disclosure={false}
              onClick={() => {
                close(false)
                vault.lock()
              }}
            />
            </div>
          </section>
        ) : vault.status === "empty" && vault.biometry.available ? (
          <button type="button" onClick={() => (close(false), start("restore"))} className="t-label1 min-h-12 rounded-[var(--radius-group)] text-[var(--blue)] transition-colors hover:bg-[var(--fill)]">
            {restoreLabel(vault.backup)}
          </button>
        ) : null}

        {own ? (
          <div className="wallet-settings-device"><WalletSettingsRow icon={<Trash size={20} />} label="Удалить кошелёк с этого устройства" onClick={() => setView("delete")} danger /></div>
        ) : watched.length ? (
          <div className="wallet-settings-device"><WalletSettingsRow icon={<Trash size={20} />} label="Удалить адреса для просмотра" onClick={() => setView("forget")} danger /></div>
        ) : null}
      </div>
      {toast}
    </Sheet>
  )
}

/* ------------------------------------------------------------- pick */

const PICK_TITLE: Record<Pick, string> = { send: "Что отправить", receive: "Что получить" }

function PickSheet({ kind, assets, recipient, onClose, onPick, onBackFromList }: { kind: Pick | null; assets: Asset[]; recipient?: SavedAddress | null; onClose: () => void; onPick: (h: Asset) => void; onBackFromList?: () => void }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => { if (!kind) setSelected(null) }, [kind])
  const native = assets.filter((h): h is Holding => !isToken(h))
  const tokens = assets.filter(isToken)
  const groups = coinGroups(native, tokens)
  const sending = kind === "send"
  const supportsSend = (holding: Asset) => canBroadcastFromNetwork(holding.network)
  const sendGroups = sending ? coinGroups(native.filter(supportsSend), tokens.filter(supportsSend)) : []
  const sendGroupBySymbol = new Map(sendGroups.map((item) => [item.symbol, item]))
  const group = groups.find((g) => g.symbol === selected)
  const failedAssets = (group ? group.parts.map((part) => part.holding) : assets).filter((holding) => supportsSend(holding) && holding.amount === undefined && holding.error)
  const retryBalances = () => {
    for (const holding of failedAssets) {
      const key = isToken(holding) ? ["token-balance", holding.network.id, holding.token.address, holding.address] : holding.network.id === "bitcoin-mainnet" ? ["bitcoin-mainnet-discovery", holding.address] : ["balance", holding.network.id, holding.address]
      void queryClient.invalidateQueries({ queryKey: key })
    }
  }
  return (
    <Sheet open={!!kind} onOpenChange={(o) => !o && onClose()} title={group?.symbol ?? (kind ? PICK_TITLE[kind] : "")} subtitle={recipient ? `${recipient.name} · ${shortAddress(recipient.address, 6, 4)}` : group ? `Выберите сеть для ${kind === "send" ? "отправки" : "получения"}` : undefined} onBack={group ? () => setSelected(null) : onBackFromList}>
      <div className="wallet-asset-picker">
        {kind === "send" && failedAssets.length ? <ErrorNote message="Часть остатков не загрузилась. Для отправки нужен актуальный остаток." onRetry={retryBalances} /> : null}
        {kind === "receive" && group ? <p className="t-body2 c-2">Выберите сеть, из которой вам отправят {group.symbol}.</p> : null}
        {!groups.length ? <p role="status" className="t-body2 c-2">Нет активов для выбора. Включите нужную сеть в настройках кошелька.</p> : null}
        <Group>
          {group ? group.parts.map((part) => {
            const receiveOnly = sending && !supportsSend(part.holding)
            return <button key={part.id} type="button" onClick={() => onPick(part.holding)} className="wallet-picker-row">
              <CoinIcon symbol={group.symbol} networkId={part.network.id} size={40} />
              <span className="wallet-picker-copy"><span>{networkLabel(part.network)}</span>{receiveOnly ? <small>Только получение</small> : null}</span>
              {!sending || receiveOnly ? <IconChevronRight size={16} className="c-2" aria-hidden="true" />
                : <span className="wallet-picker-balance">{part.amount !== undefined ? formatCoin(part.amount, part.decimals, group.symbol, 4) : part.holding.error ? "Не загружен" : "Проверяем…"}</span>}
            </button>
          }) : groups.map((g) => {
            const sendGroup = sendGroupBySymbol.get(g.symbol)
            const receiveOnly = sending && !sendGroup
            const relevantNetworks = sendGroup?.parts ?? g.parts
            const network = relevantNetworks.length === 1 ? networkLabel(relevantNetworks[0].network) : networkCountLabel(relevantNetworks.length)
            const balance = sendGroup?.amount !== undefined ? formatCoin(sendGroup.amount, sendGroup.decimals, g.symbol, 4)
              : sendGroup?.parts.some((part) => part.holding.error) ? "Не загружен" : "Проверяем…"
            const access = receiveOnly ? "Только получение" : sending ? balance : "получить"
            return <button key={g.symbol} type="button" aria-label={`${assetName(g.symbol)} ${g.symbol}, ${network}, ${access}`} onClick={() => g.parts.length === 1 ? onPick(g.parts[0].holding) : setSelected(g.symbol)} className="wallet-picker-row">
              <CoinIcon symbol={g.symbol} size={40} />
              <span className="wallet-picker-copy"><span>{assetName(g.symbol)}</span><small>{g.symbol} · {network}</small>{receiveOnly ? <small>Только получение</small> : null}</span>
              {!sending || receiveOnly ? <IconChevronRight size={16} className="c-2" aria-hidden="true" />
                : <span className="wallet-picker-balance">{balance}</span>}
            </button>
          })}
        </Group>
      </div>
    </Sheet>
  )
}
