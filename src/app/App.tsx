/** The wallet app: providers, the four sections and Keeper's bottom tab bar. */
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import "@fontsource-variable/onest"
import { AccountsProvider, useAccounts } from "./accounts"
import { useVault, VaultProvider } from "./vault"
import { CreateFlow, FlowContext, ImportFlow, RestoreFlow, UnlockScreen, Welcome, type Flow } from "./onboarding/Onboarding"
import { BiometryOffer } from "./onboarding/Biometry"
import { IconHistory, IconMarket, IconSwap, IconWallet, type GlyphProps } from "./glyph"
import { NavContext, type TabId } from "./nav"
import { Screen, ScreenBoundary, SectionHeading, SheetReturnFocus } from "./ui"
import { WatchSheet } from "./screens/sheets"
import { ExmKeyMark } from "./art/ExmKeyMark"
import "./wallet.css"

const HomeScreen = lazy(() => import("./home/Home").then((m) => ({ default: m.HomeScreen })))
const HistoryScreen = lazy(() => import("./history/History").then((m) => ({ default: m.HistoryScreen })))
const MarketScreen = lazy(() => import("./screens/Market").then((m) => ({ default: m.MarketScreen })))
const SwapScreen = lazy(() => import("./swap/SwapScreen").then((m) => ({ default: m.SwapScreen })))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

type Tab = { id: TabId; label: string; icon: ComponentType<GlyphProps>; render: (param?: string) => ReactNode }

/** sections in tab-bar order */
const TABS: Tab[] = [
  { id: "home", label: "Главная", icon: IconWallet, render: () => <HomeScreen /> },
  { id: "swap", label: "Обмен", icon: IconSwap, render: (request) => <SwapScreen request={request} /> },
  { id: "market", label: "Рынок", icon: IconMarket, render: () => <MarketScreen /> },
  { id: "history", label: "История", icon: IconHistory, render: (network) => <HistoryScreen initialFilter={network} /> },
]

type TabGesture = {
  pointer: number
  x: number
  y: number
  list: DOMRect
  items: DOMRect[]
  selected: number | null
  engaged: boolean
}

function TabBar({ active, onChange }: { active: number; onChange: (i: number) => void }) {
  const [keyboardInset, setKeyboardInset] = useState(false)
  const [preview, setPreview] = useState<number | null>(null)
  const tracking = useRef<TabGesture | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const swallowClick = useRef(0)
  const rail = useRef<HTMLUListElement>(null)
  const stopHold = () => { if (hold.current !== null) clearTimeout(hold.current); hold.current = null }
  useEffect(() => () => { if (hold.current !== null) clearTimeout(hold.current) }, [])

  function updateGesture(x: number, y: number) {
    const gesture = tracking.current, element = rail.current
    if (!gesture || !element) return
    const { list, items } = gesture
    const [first] = items
    const pad = 20
    gesture.engaged = true
    element.dataset.scrubbing = ""
    if (x < list.left - pad || x > list.right + pad || y < list.top - pad || y > list.bottom + pad) {
      gesture.selected = null
      setPreview(null)
      return
    }
    const offsetX = Math.max(0, Math.min(list.width - first.width, x - list.left - first.width / 2))
    const offsetY = Math.max(0, Math.min(list.height - first.height, y - list.top - first.height / 2))
    element.style.setProperty("--wallet-drag-x", `${offsetX}px`)
    element.style.setProperty("--wallet-drag-y", `${offsetY}px`)
    const distance = (item: DOMRect) => Math.hypot(x - item.left - item.width / 2, y - item.top - item.height / 2)
    const selected = items.reduce((nearest, item, i) => distance(item) < distance(items[nearest]) ? i : nearest, 0)
    if (selected !== gesture.selected) { gesture.selected = selected; setPreview(selected) }
  }

  function startGesture(event: PointerEvent<HTMLUListElement>) {
    if (!event.isPrimary || event.pointerType === "mouse" || getComputedStyle(event.currentTarget.parentElement!).position !== "fixed") return
    if (!(event.target instanceof Element) || !event.target.closest("button.wallet-tab")) return
    const { clientX: x, clientY: y, pointerId: pointer } = event
    const list = event.currentTarget.getBoundingClientRect()
    const items = Array.from(event.currentTarget.querySelectorAll("li"), (item) => item.getBoundingClientRect())
    if (!list.width || items.length !== TABS.length) return
    stopHold()
    swallowClick.current = 0
    tracking.current = { pointer, x, y, list, items, selected: null, engaged: false }
    hold.current = setTimeout(() => updateGesture(x, y), 150)
  }

  function moveGesture(event: PointerEvent<HTMLUListElement>) {
    const gesture = tracking.current
    if (!gesture || gesture.pointer !== event.pointerId) return
    if (!gesture.engaged && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 7) return
    stopHold()
    updateGesture(event.clientX, event.clientY)
  }

  function finishGesture(event: PointerEvent<HTMLUListElement>, commit: boolean) {
    const gesture = tracking.current
    if (!gesture || gesture.pointer !== event.pointerId) return
    stopHold()
    if (gesture.engaged && commit) updateGesture(event.clientX, event.clientY)
    tracking.current = null
    delete event.currentTarget.dataset.scrubbing
    setPreview(null)
    if (!gesture.engaged) return
    swallowClick.current = performance.now() + 500
    if (commit && gesture.selected !== null) onChange(gesture.selected)
  }

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => setKeyboardInset(viewport.scale === 1 && window.innerHeight - viewport.height > 96)
    update()
    viewport.addEventListener("resize", update)
    window.addEventListener("resize", update)
    return () => {
      viewport.removeEventListener("resize", update)
      window.removeEventListener("resize", update)
    }
  }, [])
  return (
    <nav aria-label="Разделы" data-keyboard-inset={keyboardInset || undefined} className="wallet-navigation">
      <div className="wallet-navigation-mark" aria-hidden="true">
        <ExmKeyMark size={36} />
        <span>EXM <small>Wallet</small></span>
      </div>
      <ul ref={rail} className="wallet-navigation-list" onPointerDown={startGesture} onPointerMove={moveGesture}
        onPointerUp={(event) => finishGesture(event, true)} onPointerCancel={(event) => finishGesture(event, false)}
        onLostPointerCapture={(event) => finishGesture(event, false)}
        onContextMenu={(event) => { if (tracking.current) event.preventDefault() }} style={{
        "--wallet-nav-index": active,
        "--wallet-nav-compact-column": active % 2,
        "--wallet-nav-compact-row": Math.floor(active / 2),
      } as CSSProperties}>
        {TABS.map((t, i) => {
          const on = i === active
          const Icon = t.icon
          return (
            <li key={t.id} className="min-w-0">
              <button
                type="button"
                onClick={(event) => { if (!event.detail || performance.now() > swallowClick.current) onChange(i) }}
                aria-label={t.label}
                aria-current={on ? "page" : undefined}
                data-preview={preview === i || undefined}
                className="wallet-tab flex min-h-[54px] min-w-0 w-full flex-col items-center justify-center gap-[3px] px-1 py-1.5 transition-colors focus-visible:outline-offset-[-3px]"
              >
                <span className="wallet-tab-icon"><Icon size={24} /></span>
                <span className="t-label3 block max-w-full text-center leading-tight">{t.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function WelcomeEntry() {
  const [watchOpen, setWatchOpen] = useState(false)
  const watchTrigger = useRef<HTMLButtonElement>(null)
  const openWatch = (trigger: HTMLButtonElement) => {
    watchTrigger.current = trigger
    trigger.focus({ preventScroll: true })
    setWatchOpen(true)
  }
  return <>
    <Welcome onWatch={openWatch} />
    <SheetReturnFocus.Provider value={watchTrigger}>
      {watchOpen ? <WatchSheet open onOpenChange={setWatchOpen} /> : null}
    </SheetReturnFocus.Provider>
  </>
}

function SectionLoading({ tab }: { tab: Tab }) {
  const home = tab.id === "home"
  const screenClass = home ? "wallet-home-screen exm-home" : `${tab.id}-screen`
  return <Screen className={`wallet-section-loading ${screenClass}`}>
    {home ? <header className="wallet-loading-home-header"><h1 className="exm-home-title">Портфель</h1></header> : (
      <SectionHeading title={tab.label} detail={tab.id === "swap" ? <span aria-hidden="true">&nbsp;</span> : undefined} />
    )}
    <p role="status" className="sr-only">Открываем раздел…</p>
    <div className="wallet-section-placeholder" data-section={tab.id} aria-hidden="true">
      {home ? <div className="wallet-placeholder-overview" /> : null}
      <div className="wallet-placeholder-main" />
      <div className="wallet-placeholder-aside" />
    </div>
  </Screen>
}

type SectionSelection = { index: number; direction?: "forward" | "backward" }

function selectSection(previous: SectionSelection, index: number): SectionSelection {
  if (index === previous.index) return { index }
  return { index, direction: index > previous.index ? "forward" : "backward" }
}

function Shell() {
  const tabFromUrl = () => {
    const id = window.location.hash.slice(1).split("/")[0]
    const index = TABS.findIndex((t) => t.id === id)
    return index < 0 ? 0 : index
  }
  const [{ index: tab, direction }, setSection] = useState<SectionSelection>(() => ({ index: tabFromUrl() }))
  const [param, setParam] = useState<string | undefined>()
  // a new visit to a tab remounts it (its own state and error boundary start fresh)
  const [visit, setVisit] = useState(0)
  useEffect(() => {
    const restore = () => {
      const index = tabFromUrl()
      setSection((previous) => previous.index === index ? previous : selectSection(previous, index))
      setParam(undefined)
    }
    window.addEventListener("popstate", restore)
    window.addEventListener("hashchange", restore)
    return () => {
      window.removeEventListener("popstate", restore)
      window.removeEventListener("hashchange", restore)
    }
  }, [])
  const nav = useMemo(
    () => ({
      go: (id: TabId, p?: string) => {
        const i = TABS.findIndex((t) => t.id === id)
        if (i >= 0) {
          if (window.location.hash === `#${id}` && p === undefined) return
          window.history.pushState({ exm: true }, "", `#${id}`)
          setSection((previous) => selectSection(previous, i))
          setParam(p)
          setVisit((v) => v + 1)
          window.scrollTo(0, 0)
        }
      },
      has: (id: TabId) => TABS.some((t) => t.id === id),
    }),
    [],
  )
  // Opening a watch-only address does not create a wallet or private keys.
  const { accounts } = useAccounts()
  const welcome = !Object.values(accounts).some(Boolean)
  const wasWelcome = useRef(welcome)
  const workspace = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (wasWelcome.current && !welcome) {
      window.scrollTo({ top: 0, behavior: "instant" })
      workspace.current?.focus({ preventScroll: true })
    }
    wasWelcome.current = welcome
  }, [welcome])
  const currentTab = TABS[tab]
  return (
    <NavContext.Provider value={nav}>
      <div className={welcome ? "wallet" : "wallet wallet-shell"}>
        {!welcome ? <>
          <a href="#wallet-content" className="wallet-skip" onClick={(event) => {
            event.preventDefault()
            document.getElementById("wallet-content")?.focus()
          }}>К содержимому</a>
          <TabBar active={tab} onChange={(i) => nav.go(TABS[i].id)} />
        </> : null}
        <main id="wallet-content" ref={workspace} tabIndex={-1} className={welcome ? undefined : "wallet-workspace"}>
          <div key={welcome ? "welcome" : `${tab}:${visit}`} className={welcome ? undefined : "wallet-page-enter"} data-direction={welcome ? undefined : direction}>
            <ScreenBoundary>
              {welcome ? <WelcomeEntry /> : <Suspense fallback={<SectionLoading tab={currentTab} />}>{currentTab.render(param)}</Suspense>}
            </ScreenBoundary>
          </div>
        </main>
      </div>
    </NavContext.Provider>
  )
}

/**
 * A locked wallet asks for Face ID or the password first; creating, importing or restoring one takes
 * the whole screen, and right after it (or a password unlock) comes the one Face ID question.
 */
function Gate() {
  const vault = useVault()
  const [flow, setFlow] = useState<Flow | null>(null)
  const cancelled = useRef<Flow | null>(null)
  const done = () => {
    setFlow(null)
    window.scrollTo(0, 0)
  }
  const cancel = () => {
    cancelled.current = flow
    done()
  }
  useLayoutEffect(() => {
    if (flow || !cancelled.current) return
    const trigger = document.getElementById(`wallet-entry-${cancelled.current}`)
    const target = trigger ?? document.querySelector<HTMLElement>(".wallet-entry h1, #home-add-wallet")
    target?.focus()
    cancelled.current = null
  }, [flow])
  const content =
    flow === "create" ? (
      <CreateFlow onDone={done} onCancel={cancel} />
    ) : flow === "import" ? (
      <ImportFlow onDone={done} onCancel={cancel} />
    ) : flow === "restore" ? (
      <RestoreFlow onDone={done} onCancel={cancel} onPhrase={() => setFlow("import")} />
    ) : vault.status === "locked" ? (
      <UnlockScreen onRestore={() => setFlow("import")} />
    ) : vault.biometry.offer ? (
      <BiometryOffer />
    ) : null
  return (
    <FlowContext.Provider value={setFlow}>
      {content ? (
        <div className="wallet">
          <ScreenBoundary>{content}</ScreenBoundary>
        </div>
      ) : (
        <Shell />
      )}
    </FlowContext.Provider>
  )
}

export default function WalletApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <VaultProvider>
        <AccountsProvider>
          <Gate />
        </AccountsProvider>
      </VaultProvider>
    </QueryClientProvider>
  )
}
