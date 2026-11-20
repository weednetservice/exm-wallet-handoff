/**
 * Рынок: the coins the wallet works with, at main-network prices, and a coin's price chart.
 * (The order book and Polymarket predictions stay in market/ and predictions/, not shown.)
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useIsFetching, useQueryClient } from "@tanstack/react-query"
import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { useQuotes } from "../data"
import { Group, IconButton, Screen, ScreenHeader, SectionHeading, SecondaryButton, Skeleton, useToast } from "../ui"
import { IconChevronDown, IconStar } from "../glyph"
import { CoinIcon } from "../marks"
import { LoadError } from "../market/states"
import { COINS, MAINNET_COIN_IDS, formatMarketSavedTime, useCoinQuote, useSeries, type Coin } from "../market/data"
import { CoinChart } from "../market/CoinChart"
import { formatChange, formatPrice, type ChartRange } from "../market/format"
import { useNav } from "../nav"
import { MAINNET_SWAP_SIGNING_ENABLED } from "../swap/mainnet"
import "../market/market-list.css"

const FAVORITES_KEY = "exm.market.favorites.v1"
type QuoteState = { available: boolean; refreshFailed: boolean }
function readFavorites(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]")
    return Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === "string" && COINS.some((coin) => coin.id === id)))] : []
  } catch { return [] }
}

export function MarketScreen() {
  const quotes = useQuotes()
  const queryClient = useQueryClient()
  const [quoteStates, setQuoteStates] = useState<Record<string, QuoteState>>({})
  const [refreshing, setRefreshing] = useState(false)
  const quoteRequests = useIsFetching({ queryKey: ["quotes"] })
  const seriesRequests = useIsFetching({ queryKey: ["series"], predicate: (query) => query.isActive() })
  const updatingPrices = refreshing || quoteRequests > 0 || seriesRequests > 0
  const reportQuoteState = useCallback((id: string, state: QuoteState | null) => {
    setQuoteStates((previous) => {
      if (!state) {
        if (!(id in previous)) return previous
        const next = { ...previous }
        delete next[id]
        return next
      }
      if (previous[id]?.available === state.available && previous[id]?.refreshFailed === state.refreshFailed) return previous
      return { ...previous, [id]: state }
    })
  }, [])
  const refreshQuotes = async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["quotes"] }),
        queryClient.refetchQueries({ queryKey: ["series"], type: "active" }),
      ])
    } finally { setRefreshing(false) }
  }
  const [query, setQuery] = useState("")
  const [favorites, setFavorites] = useState<string[]>(readFavorites)
  const [list, setList] = useState<"all" | "favorites">("all")
  const [sort, setSort] = useState<"default" | "price" | "change">("default")
  const [toast, showToast] = useToast()
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === FAVORITES_KEY || event.key === null) setFavorites(readFavorites()) }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id]
    setFavorites(next)
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)) }
    catch { showToast("Избранное сохранено только в этой вкладке") }
  }
  const openAssetFromUrl = () => {
    const [tab, id] = window.location.hash.slice(1).split("/")
    return tab === "market" && COINS.some((c) => c.id === id) ? id : null
  }
  const [openId, setOpenId] = useState(openAssetFromUrl)
  useEffect(() => {
    const restore = () => setOpenId(openAssetFromUrl())
    window.addEventListener("popstate", restore)
    window.addEventListener("hashchange", restore)
    return () => {
      window.removeEventListener("popstate", restore)
      window.removeEventListener("hashchange", restore)
    }
  }, [])
  const [range, setRange] = useState<ChartRange>(() => {
    try {
      const saved = sessionStorage.getItem("exm.market.range")
      return saved === "1W" || saved === "1M" || saved === "1Y" ? saved : "1D"
    } catch { return "1D" }
  })
  const rows = useRef(new Map<string, HTMLButtonElement>())
  const returnTo = useRef<string | null>(null)
  const coin = COINS.find((c) => c.id === openId)
  const shownCoins = COINS.filter((item) => (list === "all" || favorites.includes(item.id)) && `${item.name} ${item.symbol}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const priceCount = shownCoins.filter((item) => quoteStates[item.id]?.available).length
  const failedPriceCount = shownCoins.filter((item) => quoteStates[item.id]?.refreshFailed).length
  const hasPrices = priceCount > 0
  const refreshFailed = failedPriceCount > 0
  if (sort !== "default") shownCoins.sort((a, b) => {
    const first = sort === "price" ? quotes.data?.[a.id]?.usd : quotes.data?.[a.id]?.change24h
    const second = sort === "price" ? quotes.data?.[b.id]?.usd : quotes.data?.[b.id]?.change24h
    return first === undefined ? second === undefined ? 0 : 1 : second === undefined ? -1 : second - first
  })

  useEffect(() => {
    try {
      sessionStorage.setItem("exm.market.range", range)
    } catch { /* private browsing can disable storage */ }
  }, [range])

  // back from a coin: focus returns to the row that opened it
  useEffect(() => {
    if (openId || !returnTo.current) return
    rows.current.get(returnTo.current)?.focus({ preventScroll: true })
    returnTo.current = null
  }, [openId])

  if (coin) return <><CoinScreen coin={coin} range={range} onRange={setRange} favorite={favorites.includes(coin.id)} onFavorite={() => toggleFavorite(coin.id)} onBack={() => {
    if (window.history.state?.exmMarket) window.history.back()
    else {
      window.history.replaceState(null, "", "#market")
      setOpenId(null)
    }
  }} />{toast}</>

  return (
    <Screen className="market-screen">
      <SectionHeading title="Рынок" />
      <div className="market-toolbar">
        <label className="wallet-search"><MagnifyingGlassIcon size={20} weight="light" aria-hidden="true" /><span className="sr-only">Поиск монеты</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или тикер" autoComplete="off" /></label>
        <div className="market-list-controls">
          <div role="group" aria-label="Список монет" className="market-list-segment">
            <button type="button" aria-pressed={list === "all"} onClick={() => setList("all")}>Все</button>
            <button type="button" aria-pressed={list === "favorites"} onClick={() => setList("favorites")}>Избранное</button>
          </div>
          <label className="market-sort">
            <span className="sr-only">Порядок монет</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="default">По списку</option>
              <option value="price">По цене</option>
              <option value="change">По росту</option>
            </select>
            <IconChevronDown size={16} aria-hidden="true" />
          </label>
        </div>
      </div>
      {refreshFailed ? <div className="market-refresh-note" role="status"><p>{failedPriceCount === priceCount ? "Цены не обновились." : "Не все цены обновились."} Сохранённые значения отмечены.</p><button type="button" disabled={updatingPrices} onClick={() => void refreshQuotes()}>{updatingPrices ? "Обновляем…" : "Повторить обновление"}</button></div> : quotes.isError && !quotes.data && !hasPrices ? <div className="pt-2"><LoadError message="Цены не загрузились. Проверьте связь и попробуйте ещё раз." onRetry={() => void refreshQuotes()} /></div> : null}
      {!shownCoins.length ? <section className="market-empty"><h2 className="t-label1">{query.trim() ? "Монета не найдена" : "Пока нет избранных монет"}</h2><p className="t-body2 c-2">{query.trim() ? "Попробуйте название или тикер из каталога EXM." : "Откройте монету и нажмите звезду рядом с её названием."}</p><SecondaryButton onClick={() => { setQuery(""); setList("all") }}>Показать все монеты</SecondaryButton></section> : null}
      {shownCoins.some((c) => MAINNET_COIN_IDS.has(c.id)) ? <Group header={shownCoins.some((c) => !MAINNET_COIN_IDS.has(c.id)) ? "Основные монеты" : undefined} className="market-list pt-2">
        <MarketColumns />
        {shownCoins.filter((c) => MAINNET_COIN_IDS.has(c.id)).map((c) => (
          <CoinRow
            key={c.id}
            coin={c}
            onQuoteState={reportQuoteState}
            pricesUnavailable={quotes.isError && !quotes.data}
            buttonRef={(el) => {
              if (el) rows.current.set(c.id, el)
              else rows.current.delete(c.id)
            }}
            onOpen={() => {
              returnTo.current = c.id
              window.history.pushState({ exmMarket: true }, "", `#market/${c.id}`)
              setOpenId(c.id)
              window.scrollTo({ top: 0 })
            }}
          />
        ))}
      </Group> : null}
      {shownCoins.some((c) => !MAINNET_COIN_IDS.has(c.id)) ? <Group header="Другие монеты" className="market-list pt-6">
        <MarketColumns />
        {shownCoins.filter((c) => !MAINNET_COIN_IDS.has(c.id)).map((c) => (
          <CoinRow
            key={c.id}
            coin={c}
            onQuoteState={reportQuoteState}
            pricesUnavailable={quotes.isError && !quotes.data}
            buttonRef={(el) => {
              if (el) rows.current.set(c.id, el)
              else rows.current.delete(c.id)
            }}
            onOpen={() => {
              returnTo.current = c.id
              window.history.pushState({ exmMarket: true }, "", `#market/${c.id}`)
              setOpenId(c.id)
              window.scrollTo({ top: 0 })
            }}
          />
        ))}
      </Group> : null}
      {toast}
    </Screen>
  )
}

function MarketColumns() {
  return <div className="market-column-head" aria-hidden="true"><span>Монета</span><span>Цена</span><span>24 ч</span></div>
}

function CoinRow({ coin, buttonRef, onOpen, pricesUnavailable, onQuoteState }: { coin: Coin; buttonRef: (el: HTMLButtonElement | null) => void; onOpen: () => void; pricesUnavailable: boolean; onQuoteState: (id: string, state: QuoteState | null) => void }) {
  const { quote, pending, updatedAt, refreshError } = useCoinQuote(coin)
  const change = quote?.change24h
  const available = !!quote
  const refreshFailed = !!refreshError
  useEffect(() => {
    onQuoteState(coin.id, { available, refreshFailed })
    return () => onQuoteState(coin.id, null)
  }, [coin.id, available, refreshFailed, onQuoteState])
  return (
    <button ref={buttonRef} type="button" onClick={onOpen} className="market-coin-row flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left">
      <span className="market-coin-identity flex min-w-0 flex-1 items-center gap-3">
        <span className="market-coin-icon shrink-0"><CoinIcon symbol={coin.symbol} size={36} /></span>
        <span className="market-coin-name min-w-0 flex-1">
          <span className="t-label1 block break-words">{coin.name}</span>
          <span className="t-body2 c-2 block">{coin.symbol}</span>
        </span>
      </span>
      <span className="market-coin-quote flex min-w-0 shrink-0 flex-col items-end text-right">
        {quote ? (
          <>
            <span className="market-quote-price t-label1 tabular-nums">{formatPrice(quote.usd)}</span>
            {change !== undefined ? <span className="market-quote-change t-body2 tabular-nums" style={{ color: change === 0 ? "var(--label-2)" : change > 0 ? "var(--green)" : "var(--red)" }}>
              {formatChange(change)}<span className="sr-only"> за 24 часа</span>
            </span> : null}
            {refreshError ? <span className="market-quote-saved">{updatedAt ? <>Сохранено <time dateTime={new Date(updatedAt).toISOString()}>{formatMarketSavedTime(updatedAt)}</time></> : "Не обновилась"}</span> : null}
          </>
        ) : pending ? (
          <>
            <Skeleton className="market-quote-price h-4 w-20" />
            <Skeleton className="market-quote-change h-3.5 w-12" />
            <span className="sr-only">цена загружается</span>
          </>
        ) : (
          <span className="t-body2 c-2">{pricesUnavailable ? "Не загрузилась" : "Нет цены"}</span>
        )}
      </span>
    </button>
  )
}

function CoinScreen({ coin, range, onRange, onBack, favorite, onFavorite }: { coin: Coin; range: ChartRange; onRange: (r: ChartRange) => void; onBack: () => void; favorite: boolean; onFavorite: () => void }) {
  const backRef = useRef<HTMLDivElement>(null)
  const { go } = useNav()
  const { quote, refreshError: quoteRefreshError, updatedAt: quoteUpdatedAt, refetch: refreshQuote } = useCoinQuote(coin)
  const day = useSeries(coin, "1D")
  const dayValues = day.data?.points.map((point) => point.value)
  const dayLow = dayValues?.length ? Math.min(...dayValues) : undefined
  const dayHigh = dayValues?.length ? Math.max(...dayValues) : undefined
  const dayRangeLabel = day.data?.complete ? "Диапазон за 24 часа" : "Диапазон за доступный период"
  const hasQuoteRoute = coin.symbol === "ETH" || coin.symbol === "USDC" || coin.symbol === "DAI"
  // the row that opened this screen is gone: start keyboard focus on the way back
  useEffect(() => {
    backRef.current?.querySelector("button")?.focus({ preventScroll: true })
  }, [])
  return (
    <Screen className="market-detail-screen">
      <div ref={backRef}>
        <ScreenHeader onBack={onBack} backLabel="Назад к рынку" right={<IconButton label={favorite ? "Убрать из избранного" : "Добавить в избранное"} aria-pressed={favorite} onClick={onFavorite} className={favorite ? "text-[var(--blue)]" : undefined}><IconStar size={22} filled={favorite} /></IconButton>} />
      </div>
      <div className="market-detail-asset"><CoinIcon symbol={coin.symbol} size={44} /><div><h1>{coin.name}</h1><p>{coin.symbol}</p></div></div>
      <div className="market-detail-chart">
        <CoinChart coin={coin} range={range} onRange={onRange} big quote={quote} quoteRefreshFailed={!!quoteRefreshError} quoteUpdatedAt={quoteUpdatedAt} onRetryQuote={refreshQuote} />
      </div>
      {hasQuoteRoute ? MAINNET_SWAP_SIGNING_ENABLED ? <><div className="market-trade-actions">
        <button type="button" onClick={() => go("swap", `buy:${coin.symbol}`)}>Купить</button>
        <button type="button" onClick={() => go("swap", `sell:${coin.symbol}`)}>Продать</button>
      </div><p className="market-trade-note">Обмен внутри кошелька. Маршрут и доступность проверяются на следующем экране.</p></> : <><div className="market-trade-actions market-trade-quote"><button type="button" onClick={() => go("swap", `sell:${coin.symbol}`)}>Рассчитать обмен</button></div><p className="market-trade-note">Только расчёт. Подпись обмена временно закрыта.</p></> : <p className="market-trade-unavailable">Обмен {coin.symbol} в EXM пока недоступен.</p>}
      {dayLow !== undefined && dayHigh !== undefined ? (
        <section aria-label={dayRangeLabel} className="market-price-range">
          <h2>{dayRangeLabel}{day.isError ? " · сохранённые данные" : ""}</h2>
          <dl><div><dt>Минимум</dt><dd>{formatPrice(dayLow)}</dd></div><div><dt>Максимум</dt><dd>{formatPrice(dayHigh)}</dd></div></dl>
        </section>
      ) : null}
    </Screen>
  )
}
