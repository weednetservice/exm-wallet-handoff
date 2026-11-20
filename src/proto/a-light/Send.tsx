/**
 * Отправка: the confirmation step, then waiting, then done. The network's light stays on top the
 * whole way; changing the network changes it (a wrong network is seen from the corner of the eye).
 * While the knob is dragged a second, weaker light of the same network grows from the bottom;
 * when the transfer is done that light rises into the top one. One moment per operation.
 *
 * The prototype sends nothing: WAIT_MS stands in for the real wait for the network.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from "motion/react"
import { SuccessMark } from "@/app/art/SuccessMark"
import { IconBack, IconChevronRight } from "@/app/glyph"
import { IconButton, Notice, SecondaryButton, Sheet } from "@/app/ui"
import { shortAddress } from "@/lib/format"
import { ADDRESS, BOTTOM_ALPHA, coinBySymbol, DRAFT, feeWei, netById, netsOf, usdOf } from "./data"
import { NetRow } from "./Coin"
import { BigFigure, CoinMark, coinText, NetMark, UsdAmount, useProto } from "./parts"

/** prototype only: how long "waiting for the network" lasts */
const WAIT_MS = 1600

type Phase = "confirm" | "waiting" | "done"

export function SendScreen({ symbol, netId, onBack, onDone }: { symbol: string; netId: string; onBack: () => void; onDone: () => void }) {
  const { go, burst, bottom } = useProto()
  const [phase, setPhase] = useState<Phase>("confirm")
  const [picking, setPicking] = useState(false)
  const coin = coinBySymbol(symbol)
  const net = netById(netId)
  const nets = netsOf(symbol)
  const amount = DRAFT[symbol] ?? 0n
  const enough = amount > 0n && net.amount >= amount
  const funded = nets.find((n) => n.amount >= amount && amount > 0n)
  const to = ADDRESS[net.family]
  const fee = feeWei(net)
  const text = coinText(amount, coin.decimals)

  // the bottom light belongs to this screen: it goes out when the screen is left
  useEffect(() => () => bottom.set(0), [bottom])
  useEffect(() => {
    if (phase !== "waiting") return
    const t = setTimeout(() => {
      setPhase("done")
      // the lower light leaves for the top: the transfer has gone
      burst(net.light, BOTTOM_ALPHA, window.innerHeight, 480)
      animate(bottom, 0, { duration: 0.48, ease: [0.22, 1, 0.36, 1] })
    }, WAIT_MS)
    return () => clearTimeout(t)
  }, [phase, burst, bottom, net.light])

  const pick = (id: string) => {
    setPicking(false)
    go({ screen: "send", coin: symbol, net: id }, { dur: 240 })
  }

  return (
    <div className="flex min-h-[calc(100svh-var(--al-top))] flex-col pb-[max(16px,env(safe-area-inset-bottom))]">
      <header className="grid min-h-16 grid-cols-[48px_1fr_48px] items-center">
        {phase === "confirm" ? (
          <IconButton label="Назад" onClick={onBack} className="-ml-2">
            <IconBack size={24} />
          </IconButton>
        ) : (
          <span />
        )}
        <h1 className="t-h3 text-center">Отправка</h1>
      </header>

      <section aria-live="polite" className="flex flex-col items-center gap-1 pt-2 pb-6 text-center">
        {/* the coin gives its place to the success mark; nothing else on the screen moves */}
        <span className="grid size-[72px] place-items-center">{phase === "done" ? <SuccessMark size={72} play /> : <CoinMark coin={coin} net={net} size={72} cut="var(--bg)" />}</span>
        <p className="t-body2 c-2 pt-4">{phase === "confirm" ? "Подтвердите перевод" : phase === "waiting" ? `Отправляем в ${net.name}` : `Отправлено в ${net.name}`}</p>
        <BigFigure whole={text} rest={" " + coin.symbol} label={`${text} ${coin.symbol}`} />
        <UsdAmount value={usdOf(amount, coin)} className="t-body1 c-2" />
      </section>

      <div className="card list overflow-hidden">
        <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
          <span className="t-body2 c-2 shrink-0">Получатель</span>
          <span className="flex flex-col items-end">
            {to ? <span className="mono t-label2">{shortAddress(to, 8, 6)}</span> : <span className="t-label2">Адрес не указан</span>}
            {to ? <span className="t-body3 c-2">ваш адрес</span> : null}
          </span>
        </div>
        {nets.length > 1 && phase === "confirm" ? (
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={`Сеть: ${net.name}. Выбрать другую`}
            className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-2 text-left"
          >
            <span className="t-body2 c-2 shrink-0">Сеть</span>
            <span className="flex items-center gap-3">
              <NetMark net={net} size={20} ring />
              <span className="t-label2">{net.name}</span>
              <IconChevronRight size={18} className="c-2 -mr-1" />
            </span>
          </button>
        ) : (
          <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
            <span className="t-body2 c-2 shrink-0">Сеть</span>
            <span className="flex items-center gap-3">
              <NetMark net={net} size={20} ring />
              <span className="t-label2">{net.name}</span>
            </span>
          </div>
        )}
        {fee !== undefined ? (
          <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
            <span className="t-body2 c-2 shrink-0">Комиссия, оценка</span>
            <span className="t-label2">
              {/* a plain transfer on today's testnets costs under a millionth of a coin: say so instead of a tail of zeros */}
              {fee < 10n ** 12n ? (
                <>
                  меньше 0,<span className="c-2">00000</span>1 {coin.symbol}
                </>
              ) : (
                `${coinText(fee, coin.decimals, 6)} ${coin.symbol}`
              )}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-6">
        {phase === "done" ? (
          <SecondaryButton onClick={onDone}>Готово</SecondaryButton>
        ) : enough ? (
          <Swipe busy={phase === "waiting"} progress={bottom} onConfirm={() => setPhase("waiting")} />
        ) : (
          <>
            <Notice>
              В сети {net.name} нет {coin.symbol} для этого перевода.
              {funded ? ` Монеты лежат в ${funded.name}.` : ""}
            </Notice>
            {funded ? <SecondaryButton onClick={() => pick(funded.id)}>Отправить из {funded.name}</SecondaryButton> : null}
          </>
        )}
      </div>

      <Sheet open={picking} onOpenChange={setPicking} title="Сеть перевода" subtitle="Адрес получателя один во всех этих сетях">
        <div className="card list overflow-hidden">
          {nets.map((n) => (
            <button key={n.id} type="button" aria-pressed={n.id === netId} onClick={() => pick(n.id)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left">
              <NetRow net={n} decimals={coin.decimals} on={n.id === netId} />
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

/**
 * The swipe that confirms. Dragging the knob past 80 % of the track confirms on release, anything
 * less springs back; Enter or Space on the focused knob does the same from the keyboard.
 * `progress` (0..1) follows the knob: the bottom light is bound to it.
 */
function Swipe({ busy, progress, onConfirm }: { busy: boolean; progress: MotionValue<number>; onConfirm: () => void }) {
  const track = useRef<HTMLDivElement>(null)
  const [max, setMax] = useState(0)
  const x = useMotionValue(0)
  const trail = useTransform(x, (v) => v + 48)
  const fade = useTransform(x, [0, 36], [1, 0])

  useLayoutEffect(() => {
    const el = track.current!
    const measure = () => setMax(el.clientWidth - 64)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useMotionValueEvent(x, "change", (v) => progress.set(max > 0 ? Math.min(1, Math.max(0, v / max)) : 0))

  const spring = { type: "spring" as const, stiffness: 520, damping: 42 }
  const finish = () => {
    if (busy) return
    animate(x, max, spring)
    onConfirm()
  }

  return (
    <div ref={track} className="relative h-16 overflow-hidden rounded-[var(--radius-group)] bg-[var(--grouped)]">
      <motion.div aria-hidden="true" className="absolute inset-y-0 left-0 rounded-[var(--radius-group)] bg-[#0671eb]/30" style={{ width: trail }} />
      <motion.span aria-hidden="true" className="t-label1 pointer-events-none absolute inset-0 grid place-items-center pl-12" style={{ opacity: busy ? 1 : fade }}>
        {busy ? "Отправляем" : "Проведите, чтобы отправить"}
      </motion.span>
      <motion.button
        type="button"
        aria-label={busy ? "Отправляем" : "Подтвердить перевод: проведите вправо или нажмите Enter"}
        aria-disabled={busy}
        drag={busy ? false : "x"}
        dragConstraints={{ left: 0, right: max }}
        dragElastic={0}
        dragMomentum={false}
        style={{ x, touchAction: "none" }}
        onDragEnd={() => (x.get() > max * 0.8 ? finish() : animate(x, 0, spring))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            finish()
          }
        }}
        className="absolute top-1 left-1 grid size-14 place-items-center rounded-[var(--radius-btn)] bg-[var(--blue-fill)] text-white"
      >
        {busy ? <span className="al-spinner" /> : <IconChevronRight size={24} />}
      </motion.button>
    </div>
  )
}
