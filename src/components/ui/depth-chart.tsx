/**
 * Depth Chart
 *
 * Original author: Arihant jain (21st.dev @arihantcodes_1f7b8c4d, Spectrum UI)
 * Component page: https://21st.dev/@arihantcodes_1f7b8c4d/components/depth-chart
 * Source listed on 21st.dev: https://ui.spectrumhq.in/r/depth-chart.json
 * License: no public license on 21st.dev (no-license). Used with the author's
 * permission, reported by the project owner on 2026-11-14.
 * See licenses/depth-chart.LICENSE.
 *
 * Source restored from the public 21st.dev preview bundle: names, types and
 * comments are ours, behaviour, numbers and CSS unchanged.
 *
 * The bundle also carried unused sample data of the Spectrum chart kit
 * (three generateCandles series and a second order book, mid 96480,
 * seed 771204). Nothing reads them, so they are left out.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/* ---------- tokens ---------- */

const CHART_TOKENS =
  "[--spectrum-chart-up:#059669] [--spectrum-chart-down:#e11d48] [--spectrum-chart-surface:#fff] dark:[--spectrum-chart-up:#34d399] dark:[--spectrum-chart-down:#fb7185] dark:[--spectrum-chart-surface:#0a0a0a]"
const UP = "var(--spectrum-chart-up)"
const DOWN = "var(--spectrum-chart-down)"
const SURFACE = "var(--spectrum-chart-surface)"
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)"

/* ---------- data ---------- */

export interface BookLevel {
  price: number
  /** size resting at this level */
  size: number
  /** cumulative size from the best level up to this one */
  total: number
}

export interface OrderBook {
  mid: number
  spread: number
  /** best (highest) bid first, prices falling away from mid */
  bids: BookLevel[]
  /** best (lowest) ask first, prices rising away from mid */
  asks: BookLevel[]
}

/** seeded PRNG, so the sample book is the same on every load */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 1831565813) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function formatMoney(value: number, compact = false) {
  const digits = compact || value >= 1e3 || value >= 1 ? 2 : 4
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatAxisPrice(value: number) {
  return Math.abs(value) >= 1e4 ? formatMoney(value, true) : formatMoney(value, false)
}

/** 1 / 2 / 2.5 / 5 / 10 steps covering [min, max] */
function niceTicks(min: number, max: number, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min]
  const raw = (max - min) / count
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const residual = raw / magnitude
  const step =
    (residual >= 7.5 ? 10 : residual >= 3.5 ? 5 : residual >= 2.25 ? 2.5 : residual >= 1.5 ? 2 : 1) * magnitude
  const first = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let v = first; v <= max + step * 0.001; v += step) ticks.push(Math.round(v / step) * step)
  return ticks
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduce(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])
  return reduce
}

function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

const KEYFRAMES_CSS = `
@keyframes spectrum-mc-rise {
  from { transform: scaleY(0); opacity: 0; }
  to   { transform: scaleY(1); opacity: 1; }
}
@keyframes spectrum-mc-draw {
  from { stroke-dashoffset: 1; }
  to   { stroke-dashoffset: 0; }
}
@keyframes spectrum-mc-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes spectrum-sk-pulse {
  from { opacity: 1; }
  to   { opacity: 0.4; }
}
@keyframes spectrum-mc-enter {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes spectrum-mc-grow {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes spectrum-mc-flash {
  from { opacity: 0.2; }
  to   { opacity: 0; }
}
@keyframes spectrum-mc-ping {
  0%   { r: 4; opacity: 0.55; }
  70%  { r: 13; opacity: 0; }
  100% { r: 13; opacity: 0; }
}
`

function Keyframes() {
  return <style>{KEYFRAMES_CSS}</style>
}

export interface GenerateOrderBookOptions {
  mid: number
  seed: number
  levels?: number
  /** price step between levels; defaults to 0.06% of mid (min 0.01) */
  tick?: number
  depth?: number
}

/** deterministic sample book: `levels` levels per side, sizes from a seeded PRNG */
export function generateOrderBook({ mid, seed, levels = 14, tick, depth = 900 }: GenerateOrderBookOptions): OrderBook {
  const rand = mulberry32(seed)
  const step = tick ?? Math.max(0.01, round2(mid * 6e-4))
  const side = (direction: 1 | -1) => {
    const out: BookLevel[] = []
    let total = 0
    for (let i = 0; i < levels; i += 1) {
      const t = (i + 1) / levels
      const base = depth * (0.18 + t * 0.9)
      const wall = rand() > 0.87 ? 2.4 : 1
      const size = Math.round(base * (0.55 + rand() * 0.9) * wall)
      total += size
      out.push({ price: round2(mid + direction * step * (i + 1)), size, total })
    }
    return out
  }
  const asks = side(1)
  const bids = side(-1)
  return { mid, spread: round2(asks[0].price - bids[0].price), bids, asks }
}

/* ---------- loading / empty / error states ---------- */

type SkeletonVariant = "bars" | "line" | "grid" | "rows" | "cards" | "donut"

const SKELETON_BARS = [46, 72, 55, 83, 41, 68, 92, 57, 76, 49, 88, 63]
const SKELETON_ROWS = [92, 74, 86, 61, 79, 55]

function SkeletonShapes({
  variant,
  height,
  mode,
  reduce,
}: {
  variant: SkeletonVariant
  height: number
  mode: "pulse" | "ghost"
  reduce: boolean
}) {
  const pulse = mode === "pulse" && !reduce
  const breathe = (i: number) =>
    pulse ? { animation: `spectrum-sk-pulse 1.5s ease-in-out ${i * 120}ms infinite alternate` } : undefined
  const block = "rounded-md bg-black/[0.06] dark:bg-white/[0.08]"

  if (variant === "bars")
    return (
      <div className="flex h-full items-end gap-2 pb-5 pt-3">
        {SKELETON_BARS.map((h, i) => (
          <div key={i} className={cn("flex-1", block)} style={{ height: `${h}%`, ...breathe(i) }} />
        ))}
      </div>
    )
  if (variant === "line")
    return (
      <div className="relative flex h-full flex-col justify-between py-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-px w-full bg-black/[0.05] dark:bg-white/[0.06]" />
        ))}
        <svg className="absolute inset-x-0 top-1/4 h-1/2 w-full" preserveAspectRatio="none" viewBox="0 0 100 40">
          <path
            d="M0,30 C12,10 22,34 34,22 C46,10 54,28 66,16 C78,6 88,20 100,8"
            fill="none"
            className="stroke-black/[0.1] dark:stroke-white/[0.12]"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={breathe(1)}
          />
        </svg>
      </div>
    )
  if (variant === "grid")
    return (
      <div className="grid h-full grid-cols-12 grid-rows-6 gap-1.5 py-2">
        {Array.from({ length: 72 }, (_, i) => (
          <div key={i} className={cn("h-full w-full rounded-[3px]", block)} style={breathe(i % 14)} />
        ))}
      </div>
    )
  if (variant === "rows")
    return (
      <div className="flex h-full flex-col justify-evenly py-2">
        {SKELETON_ROWS.map((w, i) => (
          <div key={i} className={cn("h-4", block)} style={{ width: `${w}%`, ...breathe(i) }} />
        ))}
      </div>
    )
  if (variant === "cards")
    return (
      <div className="grid h-full grid-cols-2 content-center gap-3 py-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex h-full min-h-16 flex-col justify-between gap-2 rounded-xl border border-black/[0.05] p-3 dark:border-white/[0.06]"
            style={breathe(i)}
          >
            <div className={cn("h-2.5 w-1/2", block)} />
            <div className={cn("h-5 w-3/4", block)} />
            <div className={cn("h-6 w-full", block)} />
          </div>
        ))}
      </div>
    )
  return (
    <div className="flex h-full items-center justify-center">
      <div
        className="rounded-full border-[14px] border-black/[0.06] dark:border-white/[0.08]"
        style={{ width: height * 0.6, height: height * 0.6, ...breathe(0) }}
      />
    </div>
  )
}

function ChartSkeleton({
  variant = "bars",
  height = 300,
  className,
}: {
  variant?: SkeletonVariant
  height?: number
  className?: string
}) {
  const reduce = usePrefersReducedMotion()
  return (
    <div className={cn("relative w-full overflow-hidden", className)} style={{ height }} aria-hidden>
      <Keyframes />
      <SkeletonShapes variant={variant} height={height} mode="pulse" reduce={reduce} />
    </div>
  )
}

function StateShell({
  height,
  variant,
  icon,
  iconClassName,
  title,
  description,
  action,
}: {
  height: number
  variant: SkeletonVariant
  icon: ReactNode
  iconClassName?: string
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  const reduce = usePrefersReducedMotion()
  return (
    <div
      className="relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-black/[0.06] bg-black/[0.015] dark:border-white/[0.08] dark:bg-white/[0.02]"
      style={{ height }}
      role="status"
    >
      <Keyframes />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 inset-y-4 opacity-60 dark:opacity-50"
        style={{
          maskImage: "radial-gradient(ellipse 62% 58% at 50% 50%, transparent 34%, black 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 62% 58% at 50% 50%, transparent 34%, black 78%)",
        }}
      >
        <SkeletonShapes variant={variant} height={height} mode="ghost" reduce={reduce} />
      </div>
      <div
        className="relative flex max-w-[38ch] flex-col items-center gap-1 px-6 text-center"
        style={reduce ? undefined : { animation: `spectrum-mc-enter 480ms ${EASE_OUT} both` }}
      >
        <span
          className={cn(
            "mb-2 flex size-10 items-center justify-center rounded-xl border border-black/[0.07] bg-white text-neutral-500 shadow-xs dark:border-white/[0.1] dark:bg-neutral-900 dark:text-neutral-400",
            iconClassName,
          )}
        >
          {icon}
        </span>
        <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">{title}</p>
        {description ? <p className="text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">{description}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  )
}

const RETRY_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-900 shadow-xs transition-colors hover:bg-black/[0.03] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black/20 dark:border-white/12 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1] dark:focus-visible:ring-white/25"

export interface ChartEmptyCopy {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
}

function ChartEmpty({
  height = 300,
  variant = "line",
  title = "No data yet",
  description = "Once events start arriving this chart will fill in automatically.",
  action,
}: ChartEmptyCopy & { height?: number; variant?: SkeletonVariant }) {
  return (
    <StateShell
      height={height}
      variant={variant}
      title={title}
      description={description}
      action={action}
      icon={
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 19h16M7 16V9m5 7V5m5 11v-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      }
    />
  )
}

export interface ChartErrorCopy {
  title?: ReactNode
  description?: ReactNode
  retryLabel?: ReactNode
}

function ChartError({
  height = 300,
  variant = "line",
  title = "Could not load this chart",
  description = "The request failed. Check the connection and try again.",
  onRetry,
  retryLabel = "Retry",
}: ChartErrorCopy & { height?: number; variant?: SkeletonVariant; onRetry?: () => void }) {
  return (
    <StateShell
      height={height}
      variant={variant}
      title={title}
      description={description}
      iconClassName="text-rose-500/90 dark:text-rose-400/90"
      action={
        onRetry ? (
          <button type="button" onClick={onRetry} className={RETRY_BUTTON_CLASS}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M20 11A8 8 0 1 0 18 16M20 5v6h-6"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {retryLabel}
          </button>
        ) : null
      }
      icon={
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 8v5m0 3.5v.5M10.3 3.9 2.6 17.3A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      }
    />
  )
}

export type ChartStatus = "ready" | "loading" | "empty" | "error"

function ChartState({
  status = "ready",
  height = 300,
  variant = "bars",
  empty,
  error,
  onRetry,
  children,
}: {
  status?: ChartStatus
  height?: number
  variant?: SkeletonVariant
  empty?: ChartEmptyCopy
  error?: ChartErrorCopy
  onRetry?: () => void
  children?: ReactNode
}) {
  if (status === "loading")
    return (
      <div aria-busy="true" aria-live="polite">
        <ChartSkeleton variant={variant} height={height} />
        <span className="sr-only">Loading chart data</span>
      </div>
    )
  if (status === "empty") return <ChartEmpty height={height} variant={variant} {...empty} />
  if (status === "error") return <ChartError height={height} variant={variant} onRetry={onRetry} {...error} />
  return <>{children}</>
}

/** screen-reader copy of the chart data */
function ChartDataTable({
  caption,
  columns,
  rows,
}: {
  caption: string
  columns: string[]
  rows: (string | number)[][]
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) =>
                c === 0 ? (
                  <th key={c} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={c}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- depth chart ---------- */

/** sample book of the 21st demo (SOL/USDC around $245.85) */
export const SAMPLE_BOOK = generateOrderBook({ mid: 245.85, seed: 90210, levels: 16, depth: 820 })

const PAD = { top: 14, right: 58, bottom: 24, left: 12 }

function formatSpread(spread: number, mid: number) {
  const digits = mid >= 100 ? 2 : mid >= 1 ? 3 : 5
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(spread)
}

function compactSize(n: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: n >= 100 ? 1 : 2,
  }).format(n)
}

/** stepped area from the mid outward: horizontal to each level's price, then vertical to its cumulative total */
function stepPath(
  levels: BookLevel[],
  x: (price: number) => number,
  y: (total: number) => number,
  midX: number,
  baseY: number,
) {
  if (!levels.length) return ""
  let d = `M${midX.toFixed(2)},${baseY.toFixed(2)}`
  let prevY = baseY
  for (const level of levels) {
    const px = x(level.price)
    const py = y(level.total)
    d += `L${px.toFixed(2)},${prevY.toFixed(2)}L${px.toFixed(2)},${py.toFixed(2)}`
    prevY = py
  }
  const lastX = x(levels[levels.length - 1].price)
  d += `L${lastX.toFixed(2)},${baseY.toFixed(2)}Z`
  return d
}

export interface DepthChartProps {
  className?: string
  /** order book to draw; defaults to the demo's seeded SOL book */
  book?: OrderBook
  symbol?: string
  name?: string
  /** chart area height in px (the header sits above it) */
  height?: number
  status?: ChartStatus
  /** shows a Retry button in the error state */
  onRetry?: () => void
}

export function DepthChart({
  className,
  book = SAMPLE_BOOK,
  symbol = "SOL",
  name = "Solana · USDC",
  height = 320,
  status = "ready",
  onRetry,
}: DepthChartProps) {
  const reduce = usePrefersReducedMotion()
  const [containerRef, measuredWidth] = useElementWidth()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)

  const width = Math.max(measuredWidth, 260)
  const h = height
  const x0 = PAD.left
  const x1 = width - PAD.right
  const y0 = PAD.top
  const y1 = h - PAD.bottom

  const lowestBid = book.bids[book.bids.length - 1]?.price ?? book.mid
  const highestAsk = book.asks[book.asks.length - 1]?.price ?? book.mid
  // symmetric price range around the mid
  const halfRange = Math.max(book.mid - lowestBid, highestAsk - book.mid) || 1
  const minPrice = book.mid - halfRange
  const maxPrice = book.mid + halfRange
  const maxTotal = Math.max(book.bids[book.bids.length - 1]?.total ?? 0, book.asks[book.asks.length - 1]?.total ?? 0, 1)

  const xScale = useCallback(
    (price: number) => x0 + ((price - minPrice) / (maxPrice - minPrice)) * (x1 - x0),
    [x0, x1, minPrice, maxPrice],
  )
  const yScale = useCallback((total: number) => y1 - (total / maxTotal) * (y1 - y0), [y0, y1, maxTotal])
  const xInvert = useCallback(
    (px: number) => minPrice + ((px - x0) / (x1 - x0)) * (maxPrice - minPrice),
    [x0, x1, minPrice, maxPrice],
  )

  const midX = xScale(book.mid)
  const bidPath = stepPath(book.bids, xScale, yScale, midX, y1)
  const askPath = stepPath(book.asks, xScale, yScale, midX, y1)
  // price labels, minus the ones that would collide with the MID tag
  const priceTicks = useMemo(
    () => niceTicks(minPrice, maxPrice, 5).filter((p) => Math.abs(xScale(p) - midX) > 26),
    [minPrice, maxPrice, xScale, midX],
  )
  const sizeTicks = useMemo(() => niceTicks(0, maxTotal, 4), [maxTotal])

  // cumulative size resting between the mid and the hovered price
  const hover = useMemo(() => {
    if (hoverX == null) return null
    const price = xInvert(hoverX)
    const isBid = price < book.mid
    const levels = isBid ? book.bids : book.asks
    let reached: BookLevel | null = null
    for (const level of levels) if (isBid ? price <= level.price : price >= level.price) reached = level
    return { price, isBid, total: reached?.total ?? 0 }
  }, [hoverX, xInvert, book])

  const onMove = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * width
    setHoverX(Math.max(x0, Math.min(x1, px)))
  }

  const spreadPct = (book.spread / book.mid) * 100
  const uid = useId().replace(/:/g, "")
  const ready = measuredWidth > 0

  return (
    <div ref={containerRef} className={cn("flex w-full flex-col text-neutral-400 dark:text-neutral-500", CHART_TOKENS, className)}>
      <Keyframes />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[12px] font-medium tracking-wide text-neutral-950 dark:text-white">{symbol}</span>
            <span className="text-[12px] text-neutral-500 dark:text-neutral-400">{name}</span>
          </div>
          <p className="mt-1 font-mono text-[22px] font-medium leading-none tabular-nums text-neutral-950 dark:text-white">
            {formatMoney(book.mid)}
          </p>
        </div>
        <dl className="flex items-end gap-4 font-mono text-[11px] tabular-nums">
          <div className="text-right">
            <dt className="text-neutral-400 dark:text-neutral-500">Spread</dt>
            <dd className="text-neutral-950 dark:text-white">
              {formatSpread(book.spread, book.mid)} <span className="text-neutral-400">({spreadPct.toFixed(3)}%)</span>
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-neutral-400 dark:text-neutral-500">Bid depth</dt>
            <dd style={{ color: UP }}>{compactSize(book.bids[book.bids.length - 1]?.total ?? 0)}</dd>
          </div>
          <div className="text-right">
            <dt className="text-neutral-400 dark:text-neutral-500">Ask depth</dt>
            <dd style={{ color: DOWN }}>{compactSize(book.asks[book.asks.length - 1]?.total ?? 0)}</dd>
          </div>
        </dl>
      </div>

      <ChartState
        status={status}
        height={height}
        variant="line"
        empty={{ title: "Empty book", description: "No resting orders on either side of the mid right now." }}
        onRetry={onRetry}
      >
        <div className="relative w-full" style={{ height }}>
          {ready ? (
            <svg
              ref={svgRef}
              width={width}
              height={h}
              viewBox={`0 0 ${width} ${h}`}
              className="block w-full touch-pan-y select-none overflow-visible"
              role="img"
              aria-label={`${symbol} order book depth. Mid ${formatMoney(book.mid)}, spread ${formatSpread(book.spread, book.mid)}.`}
              tabIndex={0}
              onPointerMove={(e) => onMove(e.clientX)}
              onPointerDown={(e) => onMove(e.clientX)}
              onPointerLeave={() => setHoverX(null)}
            >
              <defs>
                <linearGradient id={`${uid}-bid`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={UP} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={UP} stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id={`${uid}-ask`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={DOWN} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={DOWN} stopOpacity={0.04} />
                </linearGradient>
              </defs>

              {/* size grid */}
              <g shapeRendering="crispEdges">
                {sizeTicks.map((t) => (
                  <line
                    key={t}
                    x1={x0}
                    x2={x1}
                    y1={yScale(t)}
                    y2={yScale(t)}
                    stroke="currentColor"
                    strokeOpacity={0.12}
                    strokeDasharray="2 4"
                  />
                ))}
              </g>

              {/* bid and ask areas, rising from the baseline on mount */}
              <g
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "bottom center",
                  animation: reduce ? undefined : `spectrum-mc-rise 620ms ${EASE_OUT} both`,
                }}
              >
                <path d={bidPath} fill={`url(#${uid}-bid)`} stroke={UP} strokeWidth={1.5} />
                <path d={askPath} fill={`url(#${uid}-ask)`} stroke={DOWN} strokeWidth={1.5} />
              </g>

              {/* mid line and tag */}
              <line x1={midX} x2={midX} y1={y0 - 4} y2={y1} stroke="currentColor" strokeOpacity={0.5} strokeDasharray="3 3" />
              <g transform={`translate(${midX}, ${y0 - 4})`}>
                <rect x={-40} y={-13} width={80} height={15} rx={4} className="fill-neutral-900 dark:fill-white" />
                <text
                  x={0}
                  y={-5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={9.5}
                  fontWeight={600}
                  className="fill-white font-mono tabular-nums dark:fill-neutral-950"
                >
                  MID {formatAxisPrice(book.mid)}
                </text>
              </g>

              {/* size axis (right) */}
              <g className="font-mono">
                {sizeTicks.map((t) =>
                  t === 0 ? null : (
                    <text
                      key={t}
                      x={x1 + 8}
                      y={yScale(t)}
                      dominantBaseline="middle"
                      fontSize={10.5}
                      fill="currentColor"
                      className="tabular-nums"
                    >
                      {compactSize(t)}
                    </text>
                  ),
                )}
              </g>

              {/* price axis (bottom) */}
              <g className="font-mono">
                {priceTicks.map((p) => (
                  <text
                    key={p}
                    x={Math.max(x0 + 18, Math.min(x1 - 18, xScale(p)))}
                    y={y1 + 15}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill="currentColor"
                    className="tabular-nums"
                  >
                    {formatAxisPrice(p)}
                  </text>
                ))}
              </g>

              {/* crosshair */}
              {hoverX != null && hover ? (
                <g>
                  <line
                    x1={hoverX}
                    x2={hoverX}
                    y1={y0}
                    y2={y1}
                    stroke="currentColor"
                    strokeOpacity={0.45}
                    strokeDasharray="3 3"
                    style={{ transition: reduce ? undefined : `all 90ms ${EASE_OUT}` }}
                  />
                  <line
                    x1={x0}
                    x2={x1}
                    y1={yScale(hover.total)}
                    y2={yScale(hover.total)}
                    stroke={hover.isBid ? UP : DOWN}
                    strokeOpacity={0.55}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={hoverX}
                    cy={yScale(hover.total)}
                    r={4}
                    fill={SURFACE}
                    stroke={hover.isBid ? UP : DOWN}
                    strokeWidth={2}
                  />
                  <g transform={`translate(${Math.max(x0 + 46, Math.min(x1 - 46, hoverX))}, ${y1 + 3})`}>
                    <rect x={-46} y={0} width={92} height={16} rx={4} className="fill-neutral-900 dark:fill-white" />
                    <text
                      x={0}
                      y={8.5}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={9.5}
                      fontWeight={600}
                      className="fill-white font-mono tabular-nums dark:fill-neutral-950"
                    >
                      {formatAxisPrice(hover.price)} ·{" "}{compactSize(hover.total)}
                    </text>
                  </g>
                </g>
              ) : null}
            </svg>
          ) : null}
        </div>
      </ChartState>

      <ChartDataTable
        caption={`${symbol} order book depth — cumulative size by price`}
        columns={["Price", "Side", "Size", "Cumulative"]}
        rows={[
          ...book.asks.map((l) => [formatAxisPrice(l.price), "Ask", l.size, l.total]),
          ...book.bids.map((l) => [formatAxisPrice(l.price), "Bid", l.size, l.total]),
        ]}
      />
    </div>
  )
}
