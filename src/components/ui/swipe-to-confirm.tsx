/**
 * Swipe to Confirm: a slide-to-confirm control (SwipeToConfirm) and the confirmation panel around
 * it (ConfirmPanel), shown as a card or as a bottom sheet.
 *
 * Original author: Vasnev.art (21st.dev @romanvasnev)
 * https://21st.dev/@romanvasnev/components/swipe-to-confirm
 * License: MIT, see licenses/swipe-to-confirm.LICENSE
 *
 * Source restored from the public 21st.dev preview bundle: names, types and comments are ours,
 * behaviour, numbers and CSS unchanged. (Function names come from the bundle, which kept them;
 * constants and local variables had no names left and were named by us.)
 */
"use client"

import * as React from "react"

/* ----------------------------------------------------------------------------------------------
 * Tokens: every color is a shadcn theme variable, except the success green.
 * -------------------------------------------------------------------------------------------- */

const TOKENS = {
  bg: "var(--color-background)",
  card: "var(--color-card)",
  label: "var(--color-card-foreground)",
  secondary: "var(--color-muted-foreground)",
  tertiary: "color-mix(in oklab, var(--color-muted-foreground) 55%, transparent)",
  fill: "var(--color-muted)",
  separator: "var(--color-border)",
  primary: "var(--color-primary)",
  primaryInk: "var(--color-primary-foreground)",
  green: "#22C55E",
  red: "var(--color-destructive)",
  avatar: "var(--color-muted)",
  avatarInk: "var(--color-muted-foreground)",
  grabber: "color-mix(in oklab, var(--color-muted-foreground) 40%, transparent)",
  shadow: "0 0 0 1px var(--color-border), 0 24px 60px rgb(0 0 0 / .12)",
}

type Tokens = typeof TOKENS

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', Inter, 'Segoe UI', Roboto, sans-serif"
const EASE_OUT = "cubic-bezier(.2,.9,.25,1)"
const EASE_SPRING = "cubic-bezier(.34,1.56,.64,1)"
const EASE_SHEET = "cubic-bezier(.32,.72,0,1)"

const KEYFRAMES = `
@keyframes stc-shine{from{background-position:100% 0}to{background-position:-150% 0}}
@keyframes stc-spin{to{transform:rotate(360deg)}}
@keyframes stc-draw{to{stroke-dashoffset:0}}
@keyframes stc-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
`

/** Haptic tick where the browser supports it (Android Chrome); silently ignored elsewhere. */
const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {}
}

/* ----------------------------------------------------------------------------------------------
 * SwipeToConfirm
 * -------------------------------------------------------------------------------------------- */

export type SwipeToConfirmStatus = "idle" | "loading" | "done" | "error"

export interface SwipeToConfirmProps {
  /** Text in the track, also the slider's aria-label. */
  label?: string
  /** Text shown on green after a successful confirm. */
  doneLabel?: string
  /** Shown when onConfirm throws without an Error message. */
  errorLabel?: string
  /** Knob and trail color. Without it the theme primary is used (with primary-foreground ink). */
  color?: string
  /** Share of the track (0..1) the knob must pass to confirm on release. */
  threshold?: number
  /** Runs on confirm. Return a promise to show the spinner; throw to show the error state. */
  onConfirm?: () => unknown
  /** Called after onConfirm resolved. */
  onDone?: () => void
  /** Milliseconds after success before the control resets to idle. 0 keeps the done state. */
  resetAfter?: number
  disabled?: boolean
  /** Replaces the arrow on the knob. */
  icon?: React.ReactNode
  className?: string
}

type DragState = {
  x: number
  v: number
  max: number
  drag: boolean
  start: number
  base: number
  raf: number
  tick: number
}

export function SwipeToConfirm({
  label = "Slide to confirm",
  doneLabel = "Done",
  errorLabel = "Something went wrong",
  color,
  threshold = 0.85,
  onConfirm,
  onDone,
  resetAfter = 0,
  disabled = false,
  icon,
  className = "",
}: SwipeToConfirmProps) {
  const t = TOKENS
  const accent = color ?? t.primary
  const ink = color ? "#fff" : t.primaryInk
  const [status, setStatus] = React.useState<SwipeToConfirmStatus>("idle")
  const [message, setMessage] = React.useState("")
  const trackRef = React.useRef<HTMLDivElement>(null)
  const knobRef = React.useRef<HTMLDivElement>(null)
  const trailRef = React.useRef<HTMLDivElement>(null)
  const labelRef = React.useRef<HTMLDivElement>(null)
  const s = React.useRef<DragState>({ x: 0, v: 0, max: 0, drag: false, start: 0, base: 0, raf: 0, tick: 0 })

  // writes the knob position straight to the DOM (no re-render while dragging)
  const paint = React.useCallback(() => {
    const { x, max } = s.current
    const progress = max > 0 ? Math.max(0, Math.min(1, x / max)) : 0
    if (knobRef.current) {
      knobRef.current.style.transform = `translateX(${x}px)`
      knobRef.current.setAttribute("aria-valuenow", String(Math.round(progress * 100)))
    }
    if (trailRef.current) {
      trailRef.current.style.width = `${Math.max(64, x + 64)}px`
      trailRef.current.style.opacity = String(0.22 + progress * 0.33)
    }
    if (labelRef.current) labelRef.current.style.setProperty("--fade", String(Math.max(0, 1 - progress * 1.8)))
  }, [])

  const measure = () => {
    const track = trackRef.current
    const knob = knobRef.current
    if (track && knob) s.current.max = track.offsetWidth - knob.offsetWidth - 8
  }

  // damped spring toward `target`, one step per frame
  const animateTo = (target: number, done?: () => void) => {
    cancelAnimationFrame(s.current.raf)
    const step = () => {
      const z = s.current
      z.v = (z.v + (target - z.x) * 0.18) * 0.62
      z.x += z.v
      if (Math.abs(target - z.x) < 0.3 && Math.abs(z.v) < 0.3) {
        z.x = target
        paint()
        done?.()
        return
      }
      paint()
      z.raf = requestAnimationFrame(step)
    }
    s.current.raf = requestAnimationFrame(step)
  }

  React.useEffect(() => {
    const ro = new ResizeObserver(() => {
      measure()
      if (status === "loading" || status === "done") s.current.x = s.current.max
      paint()
    })
    if (trackRef.current) ro.observe(trackRef.current)
    const state = s.current
    return () => {
      ro.disconnect()
      cancelAnimationFrame(state.raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const confirm = async () => {
    setStatus("loading")
    setMessage("")
    animateTo(s.current.max)
    buzz([10, 40, 10])
    try {
      await onConfirm?.()
      setStatus("done")
      buzz(30)
      onDone?.()
      if (resetAfter > 0) setTimeout(reset, resetAfter)
    } catch (e) {
      setMessage(e instanceof Error && e.message ? e.message : errorLabel)
      setStatus("error")
      buzz([30, 60, 30])
      knobRef.current?.parentElement?.animate(
        [0, -8, 7, -5, 3, 0].map((x) => ({ transform: `translateX(${x}px)` })),
        { duration: 420, easing: "ease-out" },
      )
      setTimeout(() => {
        animateTo(0, () => setStatus((current) => (current === "error" ? "idle" : current)))
      }, 450)
    }
  }

  const reset = () => {
    setStatus("idle")
    setMessage("")
    s.current.x = 0
    s.current.v = 0
    paint()
  }

  const locked = disabled || status === "loading" || status === "done"

  return (
    <div className={className} style={{ fontFamily: FONT }}>
      <style>{KEYFRAMES}</style>
      <div
        ref={trackRef}
        className="relative h-16 select-none overflow-hidden rounded-full"
        style={{
          background: status === "done" ? t.green : t.fill,
          transition: "background-color .35s",
          touchAction: "none",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {/* trail behind the knob */}
        <div
          className="absolute inset-0"
          style={{ opacity: status === "done" || status === "error" ? 0 : 1, transition: "opacity .3s" }}
        >
          <div
            ref={trailRef}
            className="absolute bottom-0 left-0 top-0 w-16 rounded-full"
            style={{ background: accent, opacity: 0.22 }}
          />
        </div>

        {/* label with the moving shine, fades out as the knob travels */}
        <div
          ref={labelRef}
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center pl-14 pr-2 text-[clamp(14px,4vw,17px)] font-semibold"
          style={{
            opacity: status === "idle" ? "var(--fade, 1)" : 0,
            transition: "opacity .2s",
            background: `linear-gradient(90deg, ${t.tertiary} 0%, ${t.tertiary} 40%, ${t.label} 50%, ${t.tertiary} 60%, ${t.tertiary} 100%) 0 0/250% 100%`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            animation: disabled ? "none" : "stc-shine 2.4s linear infinite",
          }}
        >
          {label}
        </div>

        {/* error message */}
        <div
          role="alert"
          className="absolute inset-0 flex items-center justify-center whitespace-nowrap pl-16 pr-4 text-[15px] font-semibold"
          style={{ color: t.red, opacity: status === "error" ? 1 : 0, transition: "opacity .2s" }}
        >
          {status === "error" ? message : ""}
        </div>

        {/* success: check mark + done label */}
        <div
          aria-live="polite"
          className="absolute inset-0 flex items-center justify-center gap-2 text-[17px] font-semibold text-white"
          style={{
            opacity: status === "done" ? 1 : 0,
            transform: status === "done" ? "none" : "scale(.9)",
            transition: `opacity .35s ${EASE_SPRING} .12s, transform .4s ${EASE_SPRING} .12s`,
          }}
        >
          {status === "done" && (
            <>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: `stc-draw .4s ${EASE_OUT} .25s forwards` }}
                />
              </svg>
              {doneLabel}
            </>
          )}
        </div>

        {/* knob: the slider itself (drag, or Enter / Space) */}
        <div
          ref={knobRef}
          role="slider"
          tabIndex={locked ? -1 : 0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          aria-disabled={locked}
          onPointerDown={(e) => {
            if (locked || status === "error") return
            measure()
            const d = s.current
            d.drag = true
            d.start = e.clientX
            d.base = d.x
            cancelAnimationFrame(d.raf)
            e.currentTarget.setPointerCapture(e.pointerId)
            buzz(8)
          }}
          onPointerMove={(e) => {
            const d = s.current
            if (!d.drag) return
            let x = d.base + e.clientX - d.start
            if (x > d.max) x = d.max + (x - d.max) * 0.15
            if (x < 0) x *= 0.2
            d.x = x
            paint()
            const tick = Math.floor((Math.max(0, x) / d.max) * 5)
            if (tick !== d.tick) {
              d.tick = tick
              buzz(4)
            }
          }}
          onPointerUp={() => {
            const d = s.current
            if (d.drag) {
              d.drag = false
              if (d.x >= d.max * threshold) confirm()
              else animateTo(0)
            }
          }}
          onPointerCancel={() => {
            s.current.drag = false
            animateTo(0)
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !locked && status !== "error") {
              e.preventDefault()
              measure()
              confirm()
            }
          }}
          className="absolute left-1 top-1 grid h-14 w-14 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={
            {
              background: status === "error" ? t.red : accent,
              boxShadow: `0 4px 14px color-mix(in srgb, ${accent} 40%, transparent)`,
              cursor: locked ? "default" : "grab",
              touchAction: "none",
              opacity: status === "done" ? 0 : 1,
              scale: status === "done" ? "0.5" : "1",
              transition: "opacity .3s, scale .3s, background-color .25s",
              "--tw-ring-color": accent,
              "--tw-ring-offset-color": t.card,
            } as React.CSSProperties
          }
        >
          <span className="relative grid h-[26px] w-[26px] place-items-center" style={{ color: status === "error" ? "#fff" : ink }}>
            <span
              style={{
                opacity: status === "loading" ? 0 : 1,
                transform: status === "loading" ? "scale(.4)" : "none",
                transition: `opacity .2s, transform .3s ${EASE_SPRING}`,
              }}
            >
              {icon ?? (
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              )}
            </span>
            {status === "loading" && (
              <svg
                className="absolute"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                style={{ animation: "stc-spin .8s linear infinite" }}
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="2.6" />
                <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------------------------------------
 * ConfirmPanel
 * -------------------------------------------------------------------------------------------- */

/** true below 641px wide (the "auto" presentation then opens as a bottom sheet) */
export function useIsPhone() {
  const [isPhone, setIsPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)")
    const on = () => setIsPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return isPhone
}

export interface ConfirmPanelParty {
  name: string
  detail?: string
  /** Replaces the initial in the round avatar. */
  avatar?: React.ReactNode
}

export interface ConfirmPanelAmount {
  value: React.ReactNode
  token?: { symbol: React.ReactNode; icon?: React.ReactNode }
  fiat?: React.ReactNode
}

export interface ConfirmPanelRow {
  /** Also the React key, keep it unique. */
  label: string
  value: React.ReactNode
}

export interface ConfirmPanelProps {
  /** Heading; also the dialog's aria-label in sheet mode. */
  title: string
  caption?: React.ReactNode
  party?: ConfirmPanelParty
  amount?: ConfirmPanelAmount
  /** Free content under the party / amount block. */
  hero?: React.ReactNode
  rows?: ConfirmPanelRow[]
  /** Props for the SwipeToConfirm at the bottom. */
  swipe?: SwipeToConfirmProps
  /** "auto" = card on wide screens, sheet at 640px and below. */
  presentation?: "auto" | "card" | "sheet"
  /** Sheet only. */
  open?: boolean
  /** Sheet only: called with false on Escape, overlay click, close button, swipe down, and closeAfter. */
  onOpenChange?: (open: boolean) => void
  /** Sheet only: "viewport" = position fixed, "parent" = position absolute inside the parent. */
  sheetContainer?: "viewport" | "parent"
  /** Sheet only: milliseconds after success before the sheet closes itself. 0 keeps it open. */
  closeAfter?: number
  className?: string
}

function PanelBody({ p, t, inSheet, onClose }: { p: ConfirmPanelProps; t: Tokens; inSheet: boolean; onClose?: () => void }) {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className={inSheet ? "flex flex-col gap-[3px]" : "flex w-full items-baseline justify-between gap-4"}>
          <span className={inSheet ? "text-[20px] font-bold leading-6" : "text-[17px] font-semibold"} style={{ color: t.label }}>
            {p.title}
          </span>
          {p.caption && (
            <span className={`${inSheet ? "text-[13px]" : "text-[15px]"} tabular-nums`} style={{ color: t.secondary }}>
              {p.caption}
            </span>
          )}
        </div>
        {inSheet && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-0.5 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
            style={{ background: t.fill, color: t.secondary, "--tw-ring-color": t.primary } as React.CSSProperties}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      {p.party && (
        <div className="mt-5 flex items-center gap-3">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full text-[17px] font-semibold"
            style={{ background: t.avatar, color: t.avatarInk }}
          >
            {p.party.avatar ?? p.party.name.trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold" style={{ color: t.label }}>
              {p.party.name}
            </div>
            {p.party.detail && (
              <div className="truncate text-[13px]" style={{ color: t.secondary }}>
                {p.party.detail}
              </div>
            )}
          </div>
        </div>
      )}

      {p.amount && (
        <div className="mb-1.5 mt-[26px] text-center">
          <div className="flex items-center justify-center gap-3">
            <span className="text-[56px] font-bold leading-none tabular-nums tracking-[-0.035em]" style={{ color: t.label }}>
              {p.amount.value}
            </span>
            {p.amount.token && (
              <span
                className="mt-1 inline-flex h-[34px] items-center gap-1.5 rounded-full pl-[5px] pr-3 text-[17px] font-semibold tracking-[-0.01em]"
                style={{ background: t.fill, color: t.label }}
              >
                {p.amount.token.icon && <span className="grid h-6 w-6 place-items-center">{p.amount.token.icon}</span>}
                {p.amount.token.symbol}
              </span>
            )}
          </div>
          {p.amount.fiat && (
            <div className="mt-1.5 text-[15px] tabular-nums" style={{ color: t.secondary }}>
              {p.amount.fiat}
            </div>
          )}
        </div>
      )}

      {p.hero && <div className="mt-5">{p.hero}</div>}

      {p.rows && p.rows.length > 0 && (
        <div className="mb-[18px] mt-5 rounded-[14px] px-3.5 py-0.5" style={{ background: t.fill }}>
          {p.rows.map((row, i) => (
            <div
              key={row.label}
              className="flex justify-between gap-4 py-[11px] text-[15px]"
              style={{ borderTop: i ? `.5px solid ${t.separator}` : "none" }}
            >
              <span style={{ color: t.secondary }}>{row.label}</span>
              <span className="text-right tabular-nums" style={{ color: t.label }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
      {(!p.rows || p.rows.length === 0) && <div className="h-5" />}
    </>
  )
}

export function ConfirmPanel(props: ConfirmPanelProps) {
  const {
    presentation = "auto",
    open = true,
    onOpenChange,
    sheetContainer = "viewport",
    closeAfter = 1300,
    swipe,
    className = "",
  } = props
  const t = TOKENS
  const isPhone = useIsPhone()
  const asSheet = presentation === "sheet" || (presentation === "auto" && isPhone)
  const close = React.useCallback(() => onOpenChange?.(false), [onOpenChange])
  const sheetRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef({ on: false, y: 0, dy: 0, t: 0 })

  // sheet: Escape closes, and the slider gets focus once the sheet has slid in
  React.useEffect(() => {
    if (!asSheet || !open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
    document.addEventListener("keydown", onKey)
    const slider = sheetRef.current?.querySelector<HTMLElement>("[role=slider]")
    const timer = setTimeout(() => slider?.focus({ preventScroll: true }), 420)
    return () => {
      document.removeEventListener("keydown", onKey)
      clearTimeout(timer)
    }
  }, [asSheet, open, close])

  const control = (
    <SwipeToConfirm
      {...swipe}
      onDone={() => {
        swipe?.onDone?.()
        if (asSheet && closeAfter > 0) setTimeout(close, closeAfter)
      }}
    />
  )

  if (!asSheet)
    return (
      <div
        className={`w-full max-w-[380px] rounded-[28px] px-5 pb-5 pt-[22px] ${className}`}
        style={{ background: t.card, boxShadow: t.shadow, fontFamily: FONT, WebkitFontSmoothing: "antialiased" }}
      >
        <PanelBody p={props} t={t} inSheet={false} />
        {control}
      </div>
    )

  const position = sheetContainer === "parent" ? "absolute" : "fixed"
  return (
    <div
      className={`${position} inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      style={{ fontFamily: FONT, WebkitFontSmoothing: "antialiased" }}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0"
        onClick={close}
        style={{ background: "rgba(0,0,0,.4)", opacity: open ? 1 : 0, transition: "opacity .45s" }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        className={`absolute inset-x-0 bottom-0 rounded-t-[22px] px-5 pb-[max(30px,env(safe-area-inset-bottom))] pt-2 ${className}`}
        style={{
          background: t.card,
          boxShadow: "0 -10px 40px rgba(0,0,0,.18)",
          transform: open ? "translateY(0)" : "translateY(105%)",
          transition: `transform .5s ${EASE_SHEET}`,
          touchAction: "none",
        }}
        // drag the sheet down to dismiss (not when the drag starts on the slider or a button)
        onPointerDown={(e) => {
          if ((e.target as Element).closest("[role=slider],button")) return
          drag.current = { on: true, y: e.clientY, dy: 0, t: performance.now() }
          e.currentTarget.setPointerCapture(e.pointerId)
          e.currentTarget.style.transition = "none"
        }}
        onPointerMove={(e) => {
          if (!drag.current.on) return
          const dy = e.clientY - drag.current.y
          drag.current.dy = dy
          e.currentTarget.style.transform = `translateY(${dy > 0 ? dy : dy * 0.15}px)`
        }}
        onPointerUp={(e) => {
          if (!drag.current.on) return
          drag.current.on = false
          const el = e.currentTarget
          el.style.transition = `transform .5s ${EASE_SHEET}`
          const velocity = drag.current.dy / (performance.now() - drag.current.t)
          el.style.transform = ""
          if (drag.current.dy > 120 || velocity > 0.6) close()
        }}
      >
        <span className="mx-auto mb-[18px] block h-[5px] w-9 rounded-full" style={{ background: t.grabber }} aria-hidden="true" />
        <PanelBody p={props} t={t} inSheet onClose={close} />
        {control}
      </div>
    </div>
  )
}
