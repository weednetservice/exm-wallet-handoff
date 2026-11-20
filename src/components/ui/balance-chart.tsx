/**
 * Balance Chart
 *
 * Original author: Savva Sicevs (21st.dev @ssychui, ssych ui)
 * Component page: https://21st.dev/@ssychui/components/balance-chart
 * Also: https://ssych.com/library/balance-chart
 * License: MIT, see licenses/balance-chart.LICENSE
 *
 * Source restored from the public 21st.dev preview bundle: names, types and
 * comments are ours, behaviour, numbers and CSS unchanged.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"

const UP = "var(--chart-2, #22c55e)"
const GRID = "var(--border)"
const DOWN = "var(--chart-down, #ef5350)"
const FONT = "inherit"
const CARD = "var(--card)"
const FG = "var(--foreground)"
const MUTED = "var(--muted-foreground)"

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`

const RANGES = ["1H", "24H", "1W", "1M", "1Y", "All"] as const
export type BalanceRange = (typeof RANGES)[number]

// x-axis labels per timeframe (static, not derived from the series)
const TICKS: Record<BalanceRange, string[]> = {
  "1H": ["12:10", "12:25", "12:40", "12:55"],
  "24H": ["06:00", "12:00", "18:00", "00:00", "06:00"],
  "1W": ["Mon", "Wed", "Fri", "Sun"],
  "1M": ["May 24", "Jun 3", "Jun 13", "Jun 20"],
  "1Y": ["Aug", "Nov", "Feb", "May"],
  All: ["2022", "2023", "2024", "2025", "2026"],
}

// seeded PRNG: the series is deterministic for a given base and timeframe
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 1831565813) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// viewBox size, number of points, line width
const W = 640
const H = 240
const N = 90
const STROKE = 2.1

type Point = { x: number; y: number }

// Catmull-Rom spline through the points, as cubic Bezier segments
function smoothPath(pts: Point[]) {
  if (pts.length < 2) return ""
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] ?? p2
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(2)},${(p1.y + (p2.y - p0.y) / 6).toFixed(2)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(2)},${(p2.y - (p3.y - p1.y) / 6).toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
  }
  return d
}

export interface BalanceChartProProps {
  /** balance the generated series starts around (the first value is base * 0.94) */
  base?: number
  className?: string
}

export function BalanceChartPro({ base = 48213, className }: BalanceChartProProps) {
  const [range, setRange] = useState<BalanceRange>("24H")
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(W)

  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // narrow chart: fewer pixels per point than two line widths, so smooth the series and draw a spline
  const dense = width / (N - 1) < 2 * STROKE

  const { pts, path, area, min, max, iMin, iMax, up } = useMemo(() => {
    const rand = mulberry32(11 + RANGES.indexOf(range) * 97)
    const drift = range === "1W" ? -0.12 : 0.35
    const raw: number[] = []
    let v = base * 0.94
    for (let i = 0; i < N; i++) {
      v += (rand() - 0.42) * base * 0.006 + drift * base * 8e-4
      raw.push(v)
    }

    const vals = raw.slice()
    if (dense)
      for (let pass = 0; pass < 2; pass++) {
        const prev = vals.slice()
        for (let i = 0; i < N; i++) {
          const from = Math.max(0, i - 3),
            to = Math.min(N - 1, i + 3)
          let sum = 0
          for (let j = from; j <= to; j++) sum += prev[j]
          vals[i] = sum / (to - from + 1)
        }
      }

    const lo = Math.min(...vals),
      hi = Math.max(...vals)
    const nx = (i: number) => (i / (N - 1)) * W
    const ny = (val: number) => H - 14 - ((val - lo) / (hi - lo || 1)) * (H - 44)
    const xy = vals.map((val, i) => ({ x: nx(i), y: ny(val) }))
    const line = dense
      ? smoothPath(xy)
      : xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")

    const min = Math.min(...raw),
      max = Math.max(...raw)
    return {
      pts: raw.map((val, i) => ({ x: xy[i].x, y: xy[i].y, val })),
      path: line,
      area: `${line} L${W},${H} L0,${H} Z`,
      min,
      max,
      iMin: raw.indexOf(min),
      iMax: raw.indexOf(max),
      up: raw[N - 1] >= raw[0],
    }
  }, [base, range, dense])

  const color = up ? UP : DOWN
  const active = hover != null ? pts[hover] : null
  const onLeftHalf = active ? active.x / W < 0.5 : false

  // keep the high/low labels inside the chart near the edges
  const edge = (x: number): CSSProperties =>
    (x / W) * 100 <= 12
      ? { left: 0 }
      : (x / W) * 100 >= 88
        ? { right: 0 }
        : { left: `${(x / W) * 100}%`, transform: "translateX(-50%)" }

  const scrubTo = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const i = Math.round(((clientX - rect.left) / rect.width) * (N - 1))
    setHover(Math.max(0, Math.min(N - 1, i)))
  }

  return (
    <div className={`w-full max-w-[640px] ${className ?? ""}`} style={{ fontFamily: FONT }}>
      <div
        className="rounded-md pb-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={0}
        role="group"
        aria-label="Balance chart. Use the left and right arrow keys to read values."
        onFocus={() => setHover((h) => h ?? N - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1
          const cur = hover ?? N - 1
          const next =
            e.key === "ArrowLeft"
              ? cur - step
              : e.key === "ArrowRight"
                ? cur + step
                : e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? N - 1
                    : null
          if (e.key === "Escape") setHover(null)
          if (next !== null) {
            e.preventDefault()
            setHover(Math.max(0, Math.min(N - 1, next)))
          }
        }}
      >
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-[240px] w-full cursor-crosshair"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Balance over ${range}, ${usd(pts[N - 1].val, 0)} now`}
            style={{ touchAction: "pan-y" }}
            onPointerDown={(e) => scrubTo(e.clientX)}
            onPointerMove={(e) => scrubTo(e.clientX)}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") setHover(null)
            }}
          >
            <defs>
              <linearGradient id="bcp-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={up ? "var(--chart-2, #22c55e)" : "var(--chart-down, #ef5350)"}
                  stopOpacity="0.16"
                />
                <stop
                  offset="100%"
                  stopColor={up ? "var(--chart-2, #22c55e)" : "var(--chart-down, #ef5350)"}
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#bcp-fill)" />
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {active && (
            <>
              <i
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-0 border-l border-dashed"
                style={{ left: `${(active.x / W) * 100}%`, borderColor: "var(--chart-1)", opacity: 0.5 }}
              />
              <i
                aria-hidden
                className="pointer-events-none absolute block h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${(active.x / W) * 100}%`,
                  top: `${(active.y / H) * 100}%`,
                  background: color,
                  boxShadow: `0 0 0 1.5px ${CARD}`,
                }}
              />
            </>
          )}

          <span
            className="pointer-events-none absolute text-[11px] font-medium tabular-nums"
            style={{ ...edge(pts[iMax].x), top: `${(pts[iMax].y / H) * 100}%`, marginTop: -18, color: MUTED }}
          >
            {usd(max, 0)}
          </span>
          <span
            className="pointer-events-none absolute text-[11px] font-medium tabular-nums"
            style={{ ...edge(pts[iMin].x), top: `${(pts[iMin].y / H) * 100}%`, marginTop: 8, color: MUTED }}
          >
            {usd(min, 0)}
          </span>

          {active && (
            <div
              className="pointer-events-none absolute z-10 rounded-lg border px-2.5 py-1.5"
              role="status"
              style={{
                left: `${(active.x / W) * 100}%`,
                top: `clamp(2px, calc(${(active.y / H) * 100}% - 22px), calc(100% - 52px))`,
                transform: onLeftHalf ? "translateX(14px)" : "translateX(calc(-100% - 14px))",
                background: CARD,
                borderColor: GRID,
                boxShadow: "0 8px 24px -6px rgba(0,0,0,0.35)",
              }}
            >
              <div className="text-[13px] font-bold tabular-nums" style={{ color: FG }}>
                {usd(active.val)}
              </div>
              <div className="text-[10px]" style={{ color: MUTED }}>
                Jul 20, {String(Math.floor((hover! / N) * 24)).padStart(2, "0")}:00
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-1 flex justify-between px-1 text-[11px] tabular-nums" style={{ color: MUTED }}>
        {TICKS[range].map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>

      <div className="relative mx-auto mt-3 flex w-full max-w-[360px] gap-1" role="group" aria-label="Timeframe">
        {/* sliding pill behind the active timeframe */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full bg-foreground/[0.07] transition-transform duration-[380ms] ease-[cubic-bezier(0.34,1.16,0.5,1)] motion-reduce:transition-none"
          style={{
            width: `calc((100% - ${(RANGES.length - 1) * 4}px) / ${RANGES.length})`,
            transform: `translateX(calc(${RANGES.indexOf(range)} * (100% + 4px)))`,
          }}
        />
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className="relative z-[1] h-7 flex-1 rounded-full text-[12px] font-medium tracking-[0.01em] tabular-nums transition-[color,transform] duration-200 active:scale-[0.94] motion-reduce:transition-none"
            style={{ color: range === r ? FG : MUTED }}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Demo() {
  return (
    <div className="flex min-h-[340px] w-full items-center justify-center p-6">
      <BalanceChartPro />
    </div>
  )
}
