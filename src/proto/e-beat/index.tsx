/**
 * Design prototype of direction E «Такт сети» (research/08-design-directions.md §4 E).
 * Open: /?proto=e-beat · screens by hash: #home, #coin, #send, #unlock · &bar=0 hides the prototype bar.
 * Everything lives in this folder; the app's files are imported read-only.
 */
import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import "@fontsource-variable/onest"
import "@/app/wallet.css"
import "./e-beat.css"
import { useClock } from "./clock"
import { useWallet } from "./data"
import { netById, netsOf } from "./networks"
import { CoinScreen } from "./screens/Coin"
import { HomeScreen } from "./screens/Home"
import { SendScreen } from "./screens/Send"
import { UnlockScreen } from "./screens/Unlock"

/** the prototype's one simulated transfer; it lives above the screens so the home screen can show it waiting */
export type Op = {
  netId: string
  units: bigint
  sentAt: number
  /** the fee shown on the confirmation; null: known only at signing; undefined: it did not load */
  fee?: bigint | null
  /** the newest block when the swipe finished */
  sentHeight: number
  /** the real block counted as the one that took the transfer */
  hit?: { height: number; at: number }
}

const SCREENS = [
  { id: "home", label: "Главная" },
  { id: "coin", label: "Монета" },
  { id: "send", label: "Отправка" },
  { id: "unlock", label: "Вход" },
] as const
type ScreenId = (typeof SCREENS)[number]["id"]

const fromHash = (): ScreenId => SCREENS.find((s) => "#" + s.id === window.location.hash)?.id ?? "home"
const BAR = new URLSearchParams(window.location.search).get("bar") !== "0"

/** a transfer needs about this long to reach a block producer: a block that arrives sooner could not carry it */
const REACH_MS = 600

export default function EBeat() {
  const [screen, setScreen] = useState<ScreenId>(fromHash)
  const [coin, setCoin] = useState("ETH")
  const [netId, setNetId] = useState("sepolia")
  /** the coin screen listens to this network; null after the person stopped it */
  const [tuned, setTuned] = useState<string | null>("sepolia")
  const [op, setOp] = useState<Op | null>(null)
  const wallet = useWallet()

  useEffect(() => {
    const on = () => setScreen(fromHash())
    window.addEventListener("hashchange", on)
    document.documentElement.lang = "ru"
    const title = document.title
    document.title = "EXM · прототип E «Такт сети»"
    return () => {
      window.removeEventListener("hashchange", on)
      document.title = title
    }
  }, [])
  const go = useCallback((id: ScreenId) => {
    window.location.hash = id
    window.scrollTo(0, 0)
  }, [])

  // the operation is taken by the first real block that arrives REACH_MS or more after the swipe
  const clock = useClock(op && !op.hit ? op.netId : null, op ? wallet.tempo[op.netId] : undefined)
  useEffect(() => {
    if (!op || op.hit || clock.height === undefined || clock.lastAt === undefined) return
    if (clock.height > op.sentHeight && clock.lastAt - op.sentAt >= REACH_MS) setOp({ ...op, hit: { height: clock.height, at: clock.lastAt } })
  }, [clock, op])

  const openCoin = (c: string, id?: string) => {
    const nets = netsOf(c)
    // listen to the asked network, else the one that holds the most of this coin
    const best = id ?? [...nets].sort((a, b) => (wallet.balances[b.id] > wallet.balances[a.id] ? 1 : -1))[0].id
    setCoin(c)
    setTuned(best)
    setNetId(best)
    go("coin")
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="wallet eb" style={{ ["--eb-nav" as string]: BAR ? "41px" : "0px" }}>
        {BAR ? (
          <nav aria-label="Навигация прототипа" className="eb-nav">
            <div className="mx-auto flex h-10 w-full max-w-[480px] items-center gap-1 px-4">
              <span className="t-body3 c-2 mr-auto whitespace-nowrap">Прототип E</span>
              {SCREENS.map((s) => (
                <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={screen === s.id ? "page" : undefined} className="t-label3 h-8 px-2">
                  {s.label}
                </button>
              ))}
            </div>
          </nav>
        ) : null}
        <AnimatePresence mode="wait" initial={false}>
          <motion.main key={screen} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
            {screen === "home" ? (
              <HomeScreen wallet={wallet} op={op} onSend={() => go("send")} onCoin={openCoin} />
            ) : screen === "coin" ? (
              <CoinScreen
                coin={coin}
                wallet={wallet}
                tuned={tuned}
                onTune={(id) => {
                  setTuned(id)
                  if (id) setNetId(id)
                }}
                onBack={() => go("home")}
                onSend={() => go("send")}
              />
            ) : screen === "send" ? (
              <SendScreen
                netId={netId}
                wallet={wallet}
                op={op}
                onNet={(id) => {
                  setNetId(id)
                  setCoin(netById(id).symbol)
                  setTuned(id)
                }}
                onSent={setOp}
                onAgain={() => setOp(null)}
                onClose={() => {
                  if (op?.hit) setOp(null)
                  go("home")
                }}
              />
            ) : (
              <UnlockScreen onOpen={() => go("home")} />
            )}
          </motion.main>
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}
