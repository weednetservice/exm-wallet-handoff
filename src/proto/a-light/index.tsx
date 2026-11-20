/**
 * Prototype of design direction A, "Свет сети" (research/08-design-directions.md §4A).
 * Open at /?proto=a-light. Screens: #home, #coin, #send, #unlock; &chrome=0 hides the prototype strip.
 * Data is a labelled snapshot of the demo addresses (data.ts); nothing is sent or signed.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { AnimatePresence, motion, MotionConfig, useMotionValue, useReducedMotion } from "motion/react"
import "@fontsource-variable/onest"
import "@/app/wallet.css"
import "./a-light.css"
import { CoinScreen } from "./Coin"
import { BOTTOM_ALPHA, coinBySymbol, LIGHT_ALPHA, netById, NEUTRAL, SNAPSHOT_AT } from "./data"
import { Home } from "./Home"
import { ProtoContext, type GoOptions, type Proto, type Route } from "./parts"
import { SendScreen } from "./Send"
import { Unlock } from "./Unlock"

const START: Record<string, Route> = {
  home: { screen: "home", filter: null },
  coin: { screen: "coin", coin: "ETH", net: null },
  send: { screen: "send", coin: "ETH", net: "sepolia" },
  unlock: { screen: "unlock" },
}
const TABS: { id: keyof typeof START; label: string }[] = [
  { id: "home", label: "Главная" },
  { id: "coin", label: "Монета" },
  { id: "send", label: "Отправка" },
  { id: "unlock", label: "Вход" },
]
const snapshotDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(SNAPSHOT_AT))

/** what the prototype fakes on a screen, said in the strip so nobody takes it for the product */
const NOTE: Record<Route["screen"], string> = {
  home: `Балансы и курсы: снимок демо-адресов от ${snapshotDate}`,
  coin: `Балансы и курсы: снимок демо-адресов от ${snapshotDate}`,
  send: "Перевод не отправляется, ожидание 1,6 с условное",
  unlock: "Системное окно Face ID не показано, успех через 0,9 с условный",
}

/** the light a screen asks for: neutral where many networks are in view, a network's own inside it, none when locked */
function lightOf(route: Route) {
  if (route.screen === "unlock") return { color: NEUTRAL.color, alpha: 0 }
  if (route.screen === "home") return route.filter ? { color: netById(route.filter).light, alpha: LIGHT_ALPHA } : NEUTRAL
  if (route.screen === "send") return { color: netById(route.net).light, alpha: LIGHT_ALPHA }
  return { color: netById(route.net ?? coinBySymbol(route.coin).home).light, alpha: LIGHT_ALPHA }
}

/** the travelling light eases in and out: it goes from one place on screen to another */
const TRAVEL = [0.45, 0, 0.2, 1] as const

type Burst = { key: number; color: string; alpha: number; fromY: number; dur: number }

export default function ProtoALight() {
  const chrome = useMemo(() => new URLSearchParams(window.location.search).get("chrome") !== "0", [])
  const [route, setRoute] = useState<Route>(() => START[window.location.hash.slice(1)] ?? START.home)
  const [dur, setDur] = useState(240)
  const [burstState, setBurst] = useState<Burst | null>(null)
  const bottom = useMotionValue(0)
  const reduced = useReducedMotion()
  const homeFilter = useRef<string | null>(null)
  /** the screen the send screen was opened from: its back button returns there */
  const beforeSend = useRef<Route>(START.home)
  const light = lightOf(route)
  const note = chrome ? NOTE[route.screen] : undefined
  const top = chrome ? 72 : 0

  const burst = useCallback(
    (color: string, alpha: number, fromY: number, d: number) =>
      setBurst((b) => ({
        key: (b?.key ?? 0) + 1,
        color,
        alpha,
        fromY,
        dur: d,
      })),
    [],
  )
  const go = useCallback(
    (next: Route, options: GoOptions = {}) => {
      setDur(options.dur ?? 240)
      if (options.fromY !== undefined) {
        // on its way the light has a network's full strength, even when it lands as the weaker neutral one
        burst(lightOf(next).color, LIGHT_ALPHA, options.fromY, options.dur ?? 360)
      }
      if (next.screen === "home") homeFilter.current = next.filter
      setRoute((prev) => {
        if (next.screen === "send" && prev.screen !== "send") beforeSend.current = prev
        // the light lives at the top of the page: a new screen starts there, a light on its way is met there
        if (prev.screen !== next.screen) window.scrollTo(0, 0)
        else if (options.fromY !== undefined) window.scrollTo({ top: 0, behavior: "smooth" })
        return next
      })
      window.history.replaceState(null, "", window.location.pathname + window.location.search + "#" + next.screen)
    },
    [burst],
  )
  const api = useMemo<Proto>(() => ({ go, burst, bottom }), [go, burst, bottom])

  useEffect(() => {
    const before = document.title
    document.title = "EXM · прототип A «Свет сети»"
    return () => {
      document.title = before
    }
  }, [])

  const backHome = () => go({ screen: "home", filter: homeFilter.current })
  const lightStyle = {
    "--al-c": light.color,
    "--al-a": light.alpha,
    "--al-dur": `${dur}ms`,
  } as CSSProperties
  // the send screen's lower light has the colour of its network
  const bottomStyle = {
    "--al-c": route.screen === "send" ? netById(route.net).light : NEUTRAL.color,
    "--al-a": BOTTOM_ALPHA,
    opacity: bottom,
  } as unknown as CSSProperties

  return (
    <MotionConfig reducedMotion="user">
      <ProtoContext.Provider value={api}>
        <div className="wallet al-root" style={{ "--al-top": `${top}px` } as CSSProperties}>
          {chrome ? (
            <nav aria-label="Навигация прототипа" className="al-strip fixed inset-x-0 top-0 z-40">
              <div className="mx-auto flex h-12 w-full max-w-[480px] items-center gap-2 px-2">
                <span className="t-label3 c-2 shrink-0 pl-1">Прототип A</span>
                <div className="flex min-w-0 flex-1 justify-end">
                  {TABS.map((t) => (
                    <button key={t.id} type="button" aria-pressed={route.screen === t.id} onClick={() => go(START[t.id])} className="t-label3 c-2 grid min-h-11 min-w-11 place-items-center px-0.5">
                      <span className="al-seg grid h-8 place-items-center rounded-full px-2.5 transition-colors">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {note ? <p className="t-body3 c-2 mx-auto h-6 w-full max-w-[480px] truncate px-3">{note}</p> : null}
            </nav>
          ) : null}

          <div aria-hidden="true" className="al-light" style={lightStyle} />
          <motion.div aria-hidden="true" className="al-bottom" style={bottomStyle} />
          {burstState && !reduced ? (
            // born small where it was tapped, it rises and opens into the ellipse it lands on.
            // It moves across the screen from one place to another, so it eases in and out;
            // the strong ease-out of the rest of the app would spend the whole way in the first 100 ms.
            <motion.div
              key={burstState.key}
              aria-hidden="true"
              className="al-burst"
              style={
                {
                  "--al-c": burstState.color,
                  "--al-a": burstState.alpha,
                } as CSSProperties
              }
              initial={{
                y: burstState.fromY - top + 60,
                scale: 0.42,
                opacity: 0,
              }}
              animate={{ y: 0, scale: 1, opacity: [0, 1, 1, 0] }}
              transition={{
                y: { duration: burstState.dur / 1000, ease: TRAVEL },
                scale: { duration: burstState.dur / 1000, ease: TRAVEL },
                opacity: {
                  duration: (burstState.dur + 160) / 1000,
                  times: [0, 0.12, 0.72, 1],
                  ease: "linear",
                },
              }}
              onAnimationComplete={() => setBurst(null)}
            />
          ) : null}

          <main className="al-screen mx-auto w-full max-w-[480px] px-4" style={{ paddingTop: top }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={route.screen}
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { duration: reduced ? 0.1 : 0.22, ease: "easeOut" },
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: reduced ? 0.05 : 0.12, ease: "easeIn" },
                }}
              >
                {route.screen === "home" ? <Home filter={route.filter} /> : null}
                {route.screen === "coin" ? <CoinScreen symbol={route.coin} netId={route.net} onBack={backHome} /> : null}
                {route.screen === "send" ? (
                  <SendScreen
                    key={route.coin}
                    symbol={route.coin}
                    netId={route.net}
                    onBack={() => go(beforeSend.current)}
                    onDone={() => go({ screen: "home", filter: null }, { dur: 600 })}
                  />
                ) : null}
                {route.screen === "unlock" ? <Unlock /> : null}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </ProtoContext.Provider>
    </MotionConfig>
  )
}
