/** История: every operation of every network, newest first, grouped by day, with a network filter. */
import { useMemo, useRef, useState } from "react"
import { CheckIcon, FunnelSimpleIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"
import { networkLabel, useEnabledNetworks, type Activity } from "@/lib/chains"
import { useAccounts } from "../accounts"
import { useNav } from "../nav"
import { ActivityDetailSheet, ActivityRow, ActivitySkeleton } from "../screens/Wallet"
import { useAllActivity } from "../home/portfolio"
import { ErrorNote, PrimaryButton, Screen, SectionHeading, Sheet, SheetReturnFocus } from "../ui"
import { opTitle, partyName, reason } from "../words"
import "./history.css"
import { SceneArt } from "../art/scenes"
import { useLiveActivitySelection } from "./liveSelection"
import { BaseTransactionSheet } from "./BaseTransactionSheet"

const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" })
const dayYearFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
const FILTER_KEY = "exm.history.filter"

const addressForRow = (value: string, compact: boolean) => compact ? partyName(value) : value

function historyActivity(a: Activity, compact = false): Activity {
  if (a.title === "Вызов контракта" || a.title === "Вызов программы") {
    const program = a.title === "Вызов программы"
    return {
      ...a,
      title: "Действие не распознано",
      counterparty: a.counterparty
        ? `${program ? "Программа" : "Контракт"}: ${addressForRow(a.counterparty, compact)}`
        : compact ? "Адрес не определён" : "Адрес не получен. Проверьте операцию в обозревателе",
    }
  }
  if (a.title === "Разрешение на токен") {
    return {
      ...a,
      title: a.token ? `Разрешение ${a.token.symbol}` : opTitle(a),
      counterparty: a.counterparty
        ? `Контракт токена: ${addressForRow(a.counterparty, compact)}. Параметры в деталях`
        : "Параметры разрешения в деталях",
    }
  }
  return a
}

function dayLabel(d?: Date) {
  if (!d) return "В обработке"
  const today = new Date()
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(today) - start(d)) / 86_400_000)
  if (diff === 0) return "Сегодня"
  if (diff === 1) return "Вчера"
  return d.getFullYear() === today.getFullYear() ? dayFmt.format(d) : dayYearFmt.format(d)
}

export function HistoryScreen({ initialFilter }: { initialFilter?: string }) {
  const { accountForNetwork } = useAccounts()
  const { go } = useNav()
  const { items, unverifiedItems, unverifiedLoading, unverifiedErrors, loading, errors, noHistory, empty } = useAllActivity()
  const enabledNetworks = useEnabledNetworks()
  const networks = enabledNetworks.filter((n) => n.environment === "mainnet" && accountForNetwork(n))
  const [filter, setFilter] = useState<string>(() => {
    const [tab, fromUrl] = window.location.hash.slice(1).split("/")
    let wanted = initialFilter
    if (!wanted && tab === "history" && fromUrl) {
      try { wanted = decodeURIComponent(fromUrl) } catch { /* invalid URL: show all networks */ }
    }
    if (!wanted) {
      try { wanted = window.sessionStorage.getItem(FILTER_KEY) ?? undefined } catch { /* storage unavailable */ }
    }
    if (wanted && networks.some((n) => n.id === wanted)) return wanted
    return "mainnet"
  })
  const [showUnverified, setShowUnverified] = useState(false)
  const [showNetworkErrors, setShowNetworkErrors] = useState(false)
  const [selectedActivity, setSelectedActivity] = useLiveActivitySelection([...items, ...unverifiedItems].map((activity) => activity.title === "Разрешение на токен" ? activity : historyActivity(activity)))
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<"all" | "in" | "out" | "pending">("all")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [baseLookupOpen, setBaseLookupOpen] = useState(false)
  const controls = useRef<HTMLDivElement>(null)
  const activeFilterCount = Number(kind !== "all") + Number(filter !== "mainnet")
  const selectNetwork = (id: string) => {
    setFilter(id)
    try { window.sessionStorage.setItem(FILTER_KEY, id) } catch { /* storage unavailable */ }
    window.history.replaceState(window.history.state, "", `#history/${encodeURIComponent(id)}`)
  }

  const selectedEnvironment = "mainnet" as const
  const environmentNetworks = networks
  const inNetwork = useMemo(() => items.filter((a) => a.network.environment === selectedEnvironment && (filter === selectedEnvironment || a.network.id === filter)), [items, filter, selectedEnvironment])
  const visibleErrors = errors.filter((e) => e.network.environment === selectedEnvironment && (filter === selectedEnvironment || e.network.id === filter))
  const search = query.trim().toLocaleLowerCase()
  const matchesFilters = (activity: Activity) => {
    const matchesKind = kind === "all" || (kind === "pending" ? activity.status === "pending" : activity.direction === kind)
    return matchesKind && (!search || [activity.title, historyActivity(activity).title, activity.counterparty, activity.hash, activity.id, activity.token?.symbol, activity.token?.name, activity.network.native.symbol, networkLabel(activity.network)].filter(Boolean).join(" ").toLocaleLowerCase().includes(search))
  }
  const unverifiedInNetwork = unverifiedItems.filter((a) => a.network.environment === selectedEnvironment && (filter === selectedEnvironment || a.network.id === filter))
  const visibleUnverified = unverifiedInNetwork.filter(matchesFilters)
  const visibleUnverifiedErrors = unverifiedErrors.filter((e) => e.network.environment === selectedEnvironment && (filter === selectedEnvironment || e.network.id === filter))
  const unavailable = noHistory.filter((n) => n.environment === selectedEnvironment && (filter === selectedEnvironment || n.id === filter))
  const groups = (() => {
    const list = inNetwork.filter(matchesFilters)
    const out: { label: string; rows: typeof items }[] = []
    for (const a of list) {
      const label = dayLabel(a.time)
      const last = out[out.length - 1]
      if (last?.label === label) last.rows.push(a)
      else out.push({ label, rows: [a] })
    }
    return out
  })()

  const filterOptions = (
    <div className="history-filter-options">
      <fieldset>
        <legend className="t-label1">Тип операции</legend>
        <div className="history-kind-options">
          {([{ value: "all", label: "Все" }, { value: "in", label: "Получено" }, { value: "out", label: "Отправлено" }, { value: "pending", label: "В обработке" }] as const).map((option) => <button key={option.value} type="button" aria-pressed={kind === option.value} onClick={() => setKind(option.value)}><span>{option.label}</span>{kind === option.value ? <CheckIcon size={16} aria-hidden="true" /> : null}</button>)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="t-label1">Сеть</legend>
        <div className="history-network-options">
          {[{ id: selectedEnvironment, label: "Все сети" }, ...environmentNetworks.map((network) => ({ id: network.id, label: networkLabel(network) }))].map((option) => <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => selectNetwork(option.id)}><span>{option.label}</span>{filter === option.id ? <CheckIcon size={16} aria-hidden="true" /> : null}</button>)}
        </div>
      </fieldset>
      {activeFilterCount ? <button type="button" className="history-filter-reset" onClick={() => { setKind("all"); selectNetwork(selectedEnvironment) }}>Сбросить фильтры</button> : null}
    </div>
  )

  return (
    <Screen className="history-screen">
      <SectionHeading title="История" />

      {empty ? (
        <Empty title="Здесь будут операции" text="Создайте кошелёк или добавьте свой адрес для просмотра на главной.">
          <PrimaryButton onClick={() => go("home")} className="mt-2 w-auto px-8">
            На главную
          </PrimaryButton>
        </Empty>
      ) : (
        <div className="history-layout">
          <div className="history-feed">
            <div ref={controls} tabIndex={-1} role="group" aria-label="Поиск и фильтры истории" className="history-controls">
              <label className="wallet-search"><MagnifyingGlassIcon size={20} weight="light" aria-hidden="true" /><span className="sr-only">Поиск операции</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Монета, адрес или хэш" autoComplete="off" /></label>
              <button type="button" aria-label="Фильтры истории" aria-haspopup="dialog" aria-expanded={filtersOpen} aria-describedby={activeFilterCount ? "history-filter-count" : undefined} className="history-filter-trigger history-mobile-filters" data-active={activeFilterCount > 0} onClick={() => setFiltersOpen(true)}>
                <FunnelSimpleIcon size={22} weight="light" aria-hidden="true" />
                {activeFilterCount ? <><span aria-hidden="true">{activeFilterCount}</span><span id="history-filter-count" className="sr-only">Активных фильтров: {activeFilterCount}</span></> : null}
              </button>
            </div>
            {unavailable.length ? (
              <div className="history-unavailable"><p className="t-body2 c-2">История недоступна: {unavailable.map((network) => network.name).join(", ")}.</p>{unavailable.some((network) => network.id === "base-mainnet") ? <button type="button" aria-haspopup="dialog" onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); setBaseLookupOpen(true) }}>Проверить по хэшу</button> : null}</div>
            ) : null}

            {filter === selectedEnvironment && visibleErrors.length > 1 ? <div className="card">
              <ErrorNote message="История загрузилась не полностью." onRetry={() => { for (const item of visibleErrors) void item.retry() }} />
              <button type="button" aria-expanded={showNetworkErrors} onClick={() => setShowNetworkErrors((value) => !value)} className="t-label2 min-h-11 px-4 text-[var(--blue)]">{showNetworkErrors ? "Скрыть сети" : "Показать сети"}</button>
              {showNetworkErrors ? <ul className="t-body2 c-2 list-disc px-8 pb-4">{visibleErrors.map((item, index) => <li key={`${item.network.id}:${index}`}>{networkLabel(item.network)}: {reason(item.error)}</li>)}</ul> : null}
            </div> : visibleErrors.map((item, index) => <div key={`${item.network.id}:${index}`} className="card"><ErrorNote message={`${networkLabel(item.network)}: история не загрузилась, ${reason(item.error)}.`} onRetry={() => item.retry()} /></div>)}

            {loading && groups.length ? <p className="t-body2 c-2" role="status">Загружаем остальные операции…</p> : null}
            {groups.length ? (
              groups.map((g) => (
                <section key={g.label} className="history-day">
                  <h2>{g.label}</h2>
                  <div className="card list overflow-hidden [&_.truncate]:!overflow-visible [&_.truncate]:!text-clip [&_.truncate]:!whitespace-normal [&_.truncate]:break-words">
                    {g.rows.map((a) => (
                      <ActivityRow key={a.network.id + a.id} a={historyActivity(a, true)} showNetwork={filter === selectedEnvironment} clockTime={!!a.time} onOpen={() => setSelectedActivity(a.title === "Разрешение на токен" ? a : historyActivity(a))} />
                    ))}
                  </div>
                </section>
              ))
            ) : loading || unverifiedLoading ? (
              <div className="card list overflow-hidden">
                <ActivitySkeleton rows={5} />
              </div>
            ) : (query.trim() || kind !== "all") && !visibleUnverified.length && (inNetwork.length > 0 || unverifiedInNetwork.length > 0) ? <Empty title="Операции не найдены" text="В загруженных данных нет совпадений."><PrimaryButton onClick={() => { setQuery(""); setKind("all") }} className="mt-2 w-auto">Сбросить поиск</PrimaryButton></Empty> : visibleErrors.length || unavailable.length || visibleUnverifiedErrors.length ? null : (
              visibleUnverified.length ? null : <Empty title="Операций пока нет" text="После отправки или получения операция появится здесь, когда сеть или обозреватель передаст её статус." />
            )}


            {visibleUnverified.length || visibleUnverifiedErrors.length || unverifiedLoading ? <section className="flex flex-col gap-3">
              {unverifiedLoading ? <p className="t-body2 c-2" role="status">Загружаем непроверенные переводы…</p> : visibleUnverifiedErrors.length && !showUnverified ? <p className="t-body2 c-2">Непроверенные переводы загрузились не полностью.</p> : null}
              <button type="button" aria-expanded={showUnverified} onClick={() => setShowUnverified((current) => !current)} className="t-label2 flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-btn)] px-4 text-left text-[var(--label-2)] transition-colors hover:bg-[var(--fill)] active:bg-[var(--fill-press)]">
                <span>Переводы непроверенных токенов{visibleUnverified.length ? ` · ${visibleUnverified.length}` : ""}</span>
                <span aria-hidden="true">{showUnverified ? "−" : "+"}</span>
              </button>
              {showUnverified ? <>
                <p className="t-body3 c-2 px-4">Название и символ токена задаёт контракт. Перед любым действием сверяйте адрес контракта; эти операции не подтверждают ценность токена.</p>
                {visibleUnverifiedErrors.map((item) => <div key={item.network.id} className="card"><ErrorNote message={`${networkLabel(item.network)}: непроверенные переводы не загрузились.`} onRetry={() => item.retry()} /></div>)}
                {unverifiedLoading && !visibleUnverified.length ? <div className="card list overflow-hidden"><ActivitySkeleton rows={2} /></div> : null}
                {visibleUnverified.length ? <div className="card list overflow-hidden [&_.truncate]:!overflow-visible [&_.truncate]:!text-clip [&_.truncate]:!whitespace-normal [&_.truncate]:break-words">
                  {visibleUnverified.map((activity) => <ActivityRow key={activity.network.id + activity.id} a={historyActivity(activity, true)} showNetwork={filter === selectedEnvironment} clockTime={!!activity.time} onOpen={() => setSelectedActivity(activity.title === "Разрешение на токен" ? activity : historyActivity(activity))} />)}
                </div> : null}
              </> : null}
            </section> : null}
          </div>
          <aside className="history-desktop-filters" aria-labelledby="history-desktop-filter-title">
            <h2 id="history-desktop-filter-title">Фильтры</h2>
            {filterOptions}
          </aside>
        </div>
      )}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Фильтры" returnFocusLabel="Фильтры истории" footer={<PrimaryButton onClick={() => setFiltersOpen(false)}>Готово</PrimaryButton>}>
        {filterOptions}
      </Sheet>
      <SheetReturnFocus.Provider value={controls}>
        <ActivityDetailSheet activity={selectedActivity} onClose={() => setSelectedActivity(null)} />
      </SheetReturnFocus.Provider>
      <BaseTransactionSheet open={baseLookupOpen} onOpenChange={setBaseLookupOpen} />
    </Screen>
  )
}

function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="history-empty">
      <SceneArt variant="empty" size={128} />
      <h2 className="t-h3">{title}</h2>
      <p className="t-body2 c-2 max-w-[300px]">{text}</p>
      {children}
    </div>
  )
}
