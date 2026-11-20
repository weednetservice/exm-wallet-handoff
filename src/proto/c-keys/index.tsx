/**
 * Прототип направления C «Четыре ключа» (research/08-design-directions.md §4C).
 * Открывается по /?proto=c-keys. Экран выбирается полосой прототипа или якорем:
 * #unlock, #home, #coin=ETH, #receive=evm, #send. Параметр &chrome=0 прячет полосу (для снимков 390×844).
 * Данные: снимок настоящих балансов демо-адресов (snapshot.ts), не живые запросы.
 */
import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import "@fontsource-variable/onest"
import "@/app/wallet.css"
import "./c-keys.css"
import { useToast } from "@/app/ui"
import { Coin } from "./Coin"
import { Home } from "./Home"
import { COINS, KEYS, NETS, type KeyId } from "./model"
import { Receive } from "./Receive"
import { Send, type SendStep } from "./Send"
import { Unlock } from "./Unlock"

export type Route = { screen: "unlock" } | { screen: "home" } | { screen: "coin"; coin: string } | { screen: "receive"; key: KeyId } | { screen: "send"; net?: string }
export type Go = (route: Route) => void

const TABS: { route: Route; name: string }[] = [
  { route: { screen: "unlock" }, name: "Вход" },
  { route: { screen: "home" }, name: "Главная" },
  { route: { screen: "coin", coin: "ETH" }, name: "Монета" },
  { route: { screen: "receive", key: "evm" }, name: "Получить" },
  { route: { screen: "send" }, name: "Отправить" },
]

function fromHash(): Route {
  const [name, arg] = window.location.hash.replace(/^#/, "").split("=")
  if (name === "unlock") return { screen: "unlock" }
  if (name === "coin") return { screen: "coin", coin: COINS.some((c) => c.symbol === arg) ? arg : "ETH" }
  if (name === "receive") return { screen: "receive", key: KEYS.some((k) => k.id === arg) ? (arg as KeyId) : "evm" }
  if (name === "send") return { screen: "send", net: NETS.some((n) => n.id === arg) ? arg : undefined }
  return { screen: "home" }
}
function toHash(r: Route) {
  return "#" + r.screen + (r.screen === "coin" ? "=" + r.coin : r.screen === "receive" ? "=" + r.key : r.screen === "send" && r.net ? "=" + r.net : "")
}

const NOTE: Partial<Record<Route["screen"], string>> = {
  unlock: "Окно Face ID рисует iOS, здесь его нет: подтверждение имитируется, пароль не проверяется.",
  send: "Демо-кошелёк только смотрит: перевод в сеть не уходит, ожидание имитируется.",
}

export default function ProtoCKeys() {
  const [route, setRoute] = useState<Route>(fromHash)
  const [toast, say] = useToast()
  const [, setSendStep] = useState<SendStep>("form")
  const chrome = new URLSearchParams(window.location.search).get("chrome") !== "0"

  const go = useCallback<Go>((r) => {
    setRoute(r)
    window.history.replaceState(null, "", window.location.pathname + window.location.search + toHash(r))
  }, [])
  useEffect(() => {
    const on = () => setRoute(fromHash())
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  useEffect(() => {
    document.title = "EXM: прототип C «Четыре ключа»"
  }, [])

  const id = toHash(route)
  return (
    <MotionConfig reducedMotion="user">
      <div className="wallet ck-shell">
        <div className="ck-col">
          {chrome ? (
            <nav className="ck-strip" aria-label="Навигация прототипа, в приложение не входит">
              <p className="ck-strip-tag">Навигация прототипа C, в приложение не входит</p>
              <div className="ck-strip-row">
                {TABS.map((t) => (
                  <button key={t.name} type="button" aria-current={t.route.screen === route.screen ? "page" : undefined} onClick={() => go(t.route)}>
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
              {NOTE[route.screen] ? <p className="ck-strip-note">{NOTE[route.screen]}</p> : null}
            </nav>
          ) : null}
          <AnimatePresence mode="wait" initial={false}>
            <motion.main key={id} className="ck-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14, ease: "easeOut" }}>
              {route.screen === "unlock" ? <Unlock go={go} /> : null}
              {route.screen === "home" ? <Home go={go} say={say} /> : null}
              {route.screen === "coin" ? <Coin symbol={route.coin} go={go} say={say} /> : null}
              {route.screen === "receive" ? <Receive initial={route.key} go={go} say={say} /> : null}
              {route.screen === "send" ? <Send initialNet={route.net ?? "sepolia"} go={go} say={say} onStep={setSendStep} /> : null}
            </motion.main>
          </AnimatePresence>
          {toast}
        </div>
      </div>
    </MotionConfig>
  )
}
