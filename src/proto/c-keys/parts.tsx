/** Общие детали прототипа C: ключи с веером, адрес «края и середина», сумма столбиком по запятой. */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import { NetLogo } from "./logos"
import { addressLines, EVM_NETS, KEYS, partsText, type KeyId, type Parts } from "./model"

/**
 * Пружина веера из 08 (stiffness 420, damping 36): коэффициент затухания 0,88, логотипы чуть
 * перелетают место и оседают примерно за 320 мс. Прерывается: повторное нажатие ведёт их обратно с текущей точки.
 */
export const FAN_SPRING = { type: "spring", stiffness: 420, damping: 36, mass: 1 } as const
/** наша кривая по умолчанию (08 §4) */
export const EASE = [0.22, 1, 0.36, 1] as const

const CELL_H = 92
const SHELF_H = 154
const LOGO = 28
const ROW_H = 54
const GRID_TOP = 38
const COLS = 6
/** сдвиг логотипов в стопке: в 08 было 10, при 12 третий и четвёртый знак читаются, а не сливаются в полоску */
const STACK_STEP = 12

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/**
 * Четыре ключа на одной карточке. Ключ EVM это стопка из четырёх видимых логотипов; когда он выбран,
 * все 11 логотипов одновременно разъезжаются на полку под ключами (веер), и у каждого появляется подпись.
 * Остальные ключи стоят на месте и остаются нажимаемыми.
 */
export function KeyRing({
  selected,
  net,
  onKey,
  onNet,
  caption,
  label,
}: {
  selected: KeyId | null
  /** выбранная сеть EVM (кольцо и белая подпись) */
  net?: string | null
  onKey: (key: KeyId) => void
  /** если задано, сети на полке нажимаются */
  onNet?: (id: string) => void
  caption: string
  label: string
}) {
  const [ref, w] = useWidth<HTMLDivElement>(358)
  const group = useId()
  const reduce = useReducedMotion()
  const open = selected === "evm"
  const cellW = (w - 16) / COLS
  const at = (i: number) =>
    open
      ? { x: 8 + (i % COLS) * cellW + (cellW - LOGO) / 2, y: CELL_H + GRID_TOP + Math.floor(i / COLS) * ROW_H + 4, scale: 1, opacity: 1 }
      : { x: 12 + Math.min(i, 3) * STACK_STEP, y: 12, scale: i === 0 ? 1 : 0.86, opacity: i < 4 ? 1 : 0 }
  const move = reduce ? { duration: 0 } : FAN_SPRING

  return (
    <LayoutGroup id={group}>
      <motion.div ref={ref} role="group" aria-label={label} className="ck-ring" initial={false} animate={{ height: open ? CELL_H + SHELF_H : CELL_H }} transition={move}>
        <div className="ck-cells">
          {KEYS.map((k) => {
            const on = selected === k.id
            return (
              <button
                key={k.id}
                type="button"
                className="ck-cell"
                aria-pressed={on}
                aria-expanded={k.id === "evm" ? open : undefined}
                aria-label={k.id === "evm" ? `EVM, ${k.sub}: ${EVM_NETS.map((n) => n.full).join(", ")}` : `${k.title} ${k.sub}`}
                onClick={() => onKey(k.id)}
              >
                {on ? <motion.span layoutId="sel" className="ck-sel" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }} /> : null}
                {k.id === "evm" ? (
                  // место стопки: пока логотипы на полке, здесь видны пустые гнёзда, куда они вернутся
                  <motion.span aria-hidden="true" className="ck-ghosts" initial={false} animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.16, delay: open && !reduce ? 0.08 : 0 }}>
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="ck-ghost" style={{ left: 12 + i * STACK_STEP, transform: i ? "scale(.86)" : undefined }} />
                    ))}
                  </motion.span>
                ) : (
                  <NetLogo id={k.nets[0].id} className="ck-cell-logo" />
                )}
                <span className="ck-cell-name">{k.title}</span>
                <span className="ck-cell-sub">{k.sub}</span>
              </button>
            )
          })}
        </div>

        <motion.div
          className="ck-shelf"
          inert={!open}
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={open ? { duration: 0.16, delay: reduce ? 0 : 0.2, ease: "easeOut" } : { duration: 0.08 }}
        >
          <p className="ck-shelf-cap">{caption}</p>
          <div role={onNet ? "group" : "list"} aria-label="Сети EVM">
            {EVM_NETS.map((n, i) => {
              const style = { left: 8 + (i % COLS) * cellW, top: GRID_TOP + Math.floor(i / COLS) * ROW_H, width: cellW }
              return onNet ? (
                <button key={n.id} type="button" className="ck-net" style={style} aria-pressed={net === n.id} aria-label={n.full} onClick={() => onNet(n.id)}>
                  {n.name}
                </button>
              ) : (
                <span key={n.id} role="listitem" className="ck-net" style={style} aria-label={n.full}>
                  {n.name}
                </span>
              )
            })}
          </div>
        </motion.div>

        {EVM_NETS.map((n, i) => (
          <motion.span key={n.id} aria-hidden="true" className="ck-fly" data-on={open && net === n.id} style={{ zIndex: 20 - i }} initial={false} animate={at(i)} transition={move}>
            <NetLogo id={n.id} />
          </motion.span>
        ))}
      </motion.div>
    </LayoutGroup>
  )
}

/** неподвижная стопка ключа: в строках, на экране входа */
export function KeyStack({ id, mono = false, size = 28, surface = "var(--bg)" }: { id: KeyId; mono?: boolean; size?: number; surface?: string }) {
  const nets = id === "evm" ? EVM_NETS.slice(0, 4) : KEYS.find((k) => k.id === id)!.nets
  const step = Math.round((size * STACK_STEP) / LOGO)
  return (
    <span aria-hidden="true" className="relative inline-block shrink-0" style={{ width: size + (nets.length - 1) * step, height: size }}>
      {nets.map((n, i) => (
        <span key={n.id} className="absolute top-0 rounded-full" style={{ left: i * step, zIndex: 9 - i, transform: i ? "scale(.86)" : undefined, boxShadow: `0 0 0 2px ${surface}` }}>
          <NetLogo id={n.id} size={size} mono={mono} />
        </span>
      ))}
    </span>
  )
}

/**
 * Адрес целиком, без многоточия: группы по 4 знака, края белые, середина вторичным цветом.
 * `lit`: весь адрес белый (вспышка после копирования: скопирован весь, а не края).
 * `settle`: при появлении адрес целиком белый, затем середина гаснет: глаз остаётся на краях, которые сверяют.
 */
export function Address({ value, size = "md", lit = false, settle = false, className }: { value: string; size?: "md" | "lg"; lit?: boolean; settle?: boolean; className?: string }) {
  const [fresh, setFresh] = useState(settle)
  useEffect(() => {
    if (!settle) return
    setFresh(true)
    const t = setTimeout(() => setFresh(false), 320)
    return () => clearTimeout(t)
  }, [settle, value])
  const { prefix, lines } = addressLines(value)
  return (
    <span className={cn("ck-addr", className)} data-size={size} data-lit={lit || fresh}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">
        {lines.map((line, li) => (
          <span key={li} className="ck-addr-line">
            {prefix ? (
              <span className="ck-addr-g" style={li ? { visibility: "hidden" } : undefined}>
                {prefix}
              </span>
            ) : null}
            {line.map((g, gi) => (
              <span key={gi} className="ck-addr-g" data-edge={g.edge}>
                {g.text}
              </span>
            ))}
          </span>
        ))}
      </span>
    </span>
  )
}

/**
 * Сумма для столбца по запятой: целая часть прижата вправо, дробь занимает место фиксированной ширины,
 * поэтому запятые всех строк стоят на одной вертикали. Нули до первой значащей цифры и нулевая сумма тихие.
 */
export function Amount({ parts, unit, fracWidth, className }: { parts: Parts; unit?: string; fracWidth?: number; className?: string }) {
  const quiet = parts.zero ? "ck-q" : undefined
  return (
    <span className={cn("ck-am", className)}>
      <span className="sr-only">{partsText(parts, unit)}</span>
      <span aria-hidden="true" className={quiet}>
        {parts.int}
      </span>
      <span aria-hidden="true" className={cn("ck-am-frac", quiet)} style={{ width: fracWidth }}>
        {parts.frac ? (
          <>
            ,
            {fracGroups(parts.frac).map((ch, i) => (
              <span key={i} className={ch.i < parts.lead ? "ck-q" : undefined}>
                {ch.text}
              </span>
            ))}
          </>
        ) : null}
        {unit ? <span className="ck-q"> {unit}</span> : null}
      </span>
    </span>
  )
}

/** дробь длиннее четырёх знаков делится на тройки узким пробелом: 0,000 078 */
function fracGroups(frac: string) {
  return [...frac].map((c, i) => ({ i, text: frac.length > 4 && i > 0 && i % 3 === 0 ? "\u202f" + c : c }))
}

/** смена содержимого на месте: короткое растворение, без сдвига */
export function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={id} className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
