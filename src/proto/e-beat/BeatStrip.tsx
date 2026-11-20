/**
 * The beat strip, the one recurring motion of direction E. Every tick is a block this browser saw arrive
 * (clock.ts); nothing here runs on a timer. Between two blocks the strip stands still, and that stillness
 * is the rhythm: Base steps five times a second, Sepolia once in twelve.
 *
 * Geometry: ticks 2 px wide stand on a hairline, the newest on the right. A new block shifts the strip
 * left by one step. The step depends on the network's tempo (networks.ts › stepOf), so a still frame of a
 * fast network is a dense comb and of a slow one a few posts.
 * Motion: the shift lasts half a block, clamped to 120..400 ms (08 §4 E), on the project curve
 * cubic-bezier(.22, 1, .36, 1); it animates `transform` only and picks up from where the previous shift
 * was if a block interrupts it. The new tick lands white and settles to its resting grey in 600 ms.
 * Reduced motion: the strip is not rendered at all, the caller's block counter carries the same fact.
 */
import { useLayoutEffect, useRef } from "react"
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react"

const EASE = [0.22, 1, 0.36, 1] as const
/** px the strip can show; older blocks are not drawn */
const SPAN = 380

export const shiftMs = (tempo?: number) => Math.round(Math.min(400, Math.max(120, (tempo ?? 1) * 500)))

export function BeatStrip({
  head,
  step,
  tempo,
  size = "card",
  sentHeight,
  hit,
  slot = false,
  className,
  style,
}: {
  /** the newest block of the network (clock.ts); undefined until the first answer */
  head: number | undefined
  /** px between two ticks */
  step: number
  /** seconds per block, for the length of the shift */
  tempo?: number
  /** card: 44 px tall with 20 px ticks · row: 8 px tall with 6 px ticks, sits on a row's hairline */
  size?: "card" | "row"
  /** the newest block at the moment of sending: blocks above it are the ones the operation has waited through */
  sentHeight?: number
  /** the block that took the operation: drawn green; the caller then keeps `head` on it */
  hit?: number
  /** an empty place for the block the operation waits for */
  slot?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const reduced = useReducedMotion()
  const x = useMotionValue(0)
  /** the head when the strip appeared: a tick keeps a fixed place counted from it, only the track moves */
  const h0 = useRef<number | undefined>(undefined)
  if (h0.current === undefined && head !== undefined) h0.current = head
  const base = h0.current ?? 0
  const mounted = useRef(false)

  const target = head === undefined ? 0 : -(head - base) * step
  useLayoutEffect(() => {
    // the first frame, and a jump (the tab was hidden, a long batch), are not played back
    if (!mounted.current || Math.abs(target - x.get()) > 14 * step) {
      mounted.current = head !== undefined
      x.set(target)
      return
    }
    // a block that interrupts a shift continues from where the strip is
    const a = animate(x, target, { duration: shiftMs(tempo) / 1000, ease: EASE })
    return () => a.stop()
  }, [target, head, step, tempo, x])

  if (reduced || head === undefined) return <div className={`eb-strip eb-strip-${size} ${className ?? ""}`} style={style} aria-hidden="true" hidden={!!reduced} />

  // every tick is a block of the chain: the ones before the strip appeared exist just as surely as the ones seen arriving
  const count = Math.ceil(SPAN / step)
  const ticks = Array.from({ length: count }, (_, i) => head - i)
  return (
    <div className={`eb-strip eb-strip-${size} ${className ?? ""}`} style={style} aria-hidden="true">
      <motion.div className="eb-track" style={{ x, right: slot ? step : 0 }}>
        {ticks.map((h) => (
          <i key={h} className={`eb-tick${h === hit ? " eb-hit" : sentHeight !== undefined && h > sentHeight ? " eb-post" : ""}${h > base ? " eb-new" : ""}`} style={{ right: (base - h) * step }} />
        ))}
        {sentHeight !== undefined ? <i className="eb-sent" style={{ right: (base - sentHeight - 1) * step + step / 2 }} /> : null}
      </motion.div>
      {slot ? <i key={head} className="eb-slot" style={{ animationDuration: shiftMs(tempo) + "ms" }} /> : null}
    </div>
  )
}

/** a still ruler with the same ticks: the tempo of a class of networks on the home screen */
export function Ruler({ step, ticks, className }: { step: number; ticks: number; className?: string }) {
  return (
    <span className={`eb-ruler ${className ?? ""}`} aria-hidden="true">
      {Array.from({ length: ticks }, (_, i) => (
        <i key={i} className="eb-tick" style={{ right: i * step }} />
      ))}
    </span>
  )
}
