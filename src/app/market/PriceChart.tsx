/**
 * Price chart
 *
 * Adapted from "Balance Chart" by Savva Sicevs (21st.dev @ssychui, ssych ui),
 * https://21st.dev/@ssychui/components/balance-chart. MIT License, see licenses/balance-chart.LICENSE.
 * The restored original stays untouched in src/components/ui/balance-chart.tsx.
 *
 * The time axis uses elapsed time. Thinning keeps the actual first, last and extreme prices.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import "./price-chart-motion.css"

export type ChartPoint = { time: number; value: number }

/** at most `max` real points: evenly spaced picks plus the first, last, highest and lowest */
function thin(points: ChartPoint[], max: number) {
  if (points.length <= max) return points
  const n = points.length
  const keep = new Set<number>([0, n - 1])
  let hi = 0,
    lo = 0
  points.forEach((p, i) => {
    if (p.value > points[hi].value) hi = i
    if (p.value < points[lo].value) lo = i
  })
  keep.add(hi).add(lo)
  const base = Math.max(2, max - 2)
  for (let k = 0; k < base; k++) keep.add(Math.round((k * (n - 1)) / (base - 1)))
  return [...keep].sort((a, b) => a - b).map((i) => points[i])
}

// viewBox width and line width (the height follows the `height` prop)
const W = 640
const STROKE = 2.1
/** trailing space for grid labels ("100 %") when the chart has a fixed range */
const GUTTER = 44

export interface PriceChartProps {
  /** at least two points, oldest first */
  points: ChartPoint[]
  /** what the chart shows, for screen readers: "Цена ETH за неделю" */
  label: string
  formatValue: (value: number) => string
  formatExtremum?: (value: number, span: number) => string
  /** time in the tooltip */
  formatTime: (time: number) => string
  /** x-axis labels */
  formatTick: (time: number) => string
  /** line colour: green or red by the direction over the range, or one neutral colour */
  tone?: "direction" | "neutral"
  /** fixed value range, e.g. [0, 1]; default: the data's own range */
  domain?: [number, number]
  /** values that get a dashed grid line and a label on the trailing side (use with `domain`) */
  grid?: { value: number; label: string }[]
  /** colour under the chart, for the ring around the scrub dot */
  surface?: string
  height?: number
  /**
   * Stocks behaviour: the screen shows the scrubbed value in its own header instead of a floating
   * tooltip. Called with the point under the pointer or keyboard, and null when scrubbing ends.
   */
  onScrub?: (point: ChartPoint | null) => void
}

export function PriceChart({
  points: input,
  label,
  formatValue,
  formatExtremum,
  formatTime,
  formatTick,
  tone = "direction",
  domain,
  grid,
  surface = "var(--bg)",
  height = 220,
  onScrub,
}: PriceChartProps) {
  const H = height
  const [hoverRaw, setHover] = useState<number | null>(null)
  const [hasScrubbed, setHasScrubbed] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const axisRef = useRef<HTMLDivElement>(null)
  const [{ width, tickSize }, setLayout] = useState({ width: W, tickSize: 12 })

  useLayoutEffect(() => {
    const el = svgRef.current
    const axis = axisRef.current
    if (!el || !axis) return
    const measure = () => {
      const next = { width: el.clientWidth, tickSize: parseFloat(getComputedStyle(axis).fontSize) }
      setLayout((prev) => prev.width === next.width && prev.tickSize === next.tickSize ? prev : next)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(axis)
    measure()
    return () => ro.disconnect()
  }, [])

  // as many real points as fit at two line widths apart, so the line is never averaged
  const points = useMemo(() => thin(input, Math.max(2, Math.floor(width / (2 * STROKE)) + 1)), [input, width])
  const N = points.length
  const t0 = points[0].time
  const span = points[N - 1].time - t0 || 1

  const { pts, path, area, min, max, up, ny } = useMemo(() => {
    const raw = points.map((p) => p.value)
    const min = Math.min(...raw)
    const max = Math.max(...raw)
    const [lo, hi] = domain ?? [min, max]
    const ny = (val: number) => hi === lo ? H / 2 : H - 14 - ((val - lo) / (hi - lo)) * (H - 44)
    const pts = points.map(({ time, value }) => ({ x: ((time - t0) / span) * W, y: ny(value), val: value, time }))
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")

    return {
      pts,
      path: line,
      area: `${line} L${W},${H} L0,${H} Z`,
      min,
      max,
      up: raw[N - 1] >= raw[0],
      ny,
    }
  }, [points, domain, H, N, t0, span])

  // a refetch can shorten the series under a held scrub position
  const hover = hoverRaw == null ? null : Math.min(hoverRaw, N - 1)
  const color = tone === "neutral" || min === max ? "var(--blue)" : up ? "var(--green)" : "var(--red)"
  const active = hover != null ? pts[hover] : null
  const onLeftHalf = active ? active.x / W < 0.5 : false
  const fillId = "pc-fill-" + useId().replace(/:/g, "")

  const boundLabel = (value: number) => min !== max && formatExtremum && formatValue(min) === formatValue(max) ? formatExtremum(value, max - min) : formatValue(value)

  /** index of the point nearest to a time */
  const nearest = (t: number) => {
    let best = 0
    for (let i = 1; i < N; i++) if (Math.abs(points[i].time - t) < Math.abs(points[best].time - t)) best = i
    return best
  }

  const scrubTo = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setHasScrubbed(true)
    setHover(nearest(t0 + f * span))
  }

  // the screen's header follows the scrub (Stocks); the floating tooltip is for charts without one
  const scrubRef = useRef(onScrub)
  scrubRef.current = onScrub
  const activeTime = active?.time
  const activeVal = active?.val
  useEffect(() => {
    scrubRef.current?.(activeTime == null || activeVal == null ? null : { time: activeTime, value: activeVal })
  }, [activeTime, activeVal])
  // a chart replaced by a loading state must not leave the header frozen on an old point
  useEffect(() => () => scrubRef.current?.(null), [])

  const tickCount = Math.max(2, Math.min(4, Math.floor(width / (tickSize * 8))))
  const startLabel = formatTick(t0)
  const endLabel = formatTick(points[N - 1].time)
  const labels = new Set([startLabel, endLabel])
  const ticks = [{ at: 0, text: startLabel }]
  for (let i = 1; i < tickCount - 1; i++) {
    const at = i / (tickCount - 1)
    const text = formatTick(t0 + span * at)
    if (!labels.has(text)) {
      labels.add(text)
      ticks.push({ at, text })
    }
  }
  if (endLabel !== startLabel) ticks.push({ at: 1, text: endLabel })

  return (
    <div className="price-chart w-full" data-flat={min === max || undefined}>
      {!grid ? <div className="price-chart-bounds" aria-hidden="true">
        <div className="price-chart-extrema" data-selecting={!!active && !!onScrub || undefined}>
          {min === max ? <span className="price-chart-flat-label">Без изменения · {formatValue(min)}</span> : <><span className="price-chart-extreme"><span>Мин.</span><span>{boundLabel(min)}</span></span><span className="price-chart-extreme"><span>Макс.</span><span>{boundLabel(max)}</span></span></>}
        </div>
        {active && onScrub ? <p className="price-chart-selection"><strong>{formatValue(active.val)}</strong><span>{formatTime(active.time)}</span></p> : null}
      </div> : null}
      <div
        className="price-chart-interactive rounded-[12px] pb-2"
        tabIndex={0}
        role="group"
        aria-label={`${label}. Стрелки влево и вправо показывают цену в каждой точке.`}
        onFocus={() => {
          setHasScrubbed(true)
          setHover((h) => h ?? N - 1)
        }}
        // hide the scrub a frame later: removing the tooltip while focus is in transit (activeElement is
        // <body> between blur and focus) makes a dialog's focus trap pull focus back to the dialog
        onBlur={(event) => {
          const chart = event.currentTarget
          requestAnimationFrame(() => { if (!chart.contains(document.activeElement)) setHover(null) })
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1
          const cur = hover ?? N - 1
          const next =
            e.key === "ArrowLeft" ? cur - step : e.key === "ArrowRight" ? cur + step : e.key === "Home" ? 0 : e.key === "End" ? N - 1 : null
          if (e.key === "Escape") setHover(null)
          if (next !== null) {
            e.preventDefault()
            setHover(Math.max(0, Math.min(N - 1, next)))
          }
        }}
      >
        {/* with grid labels, the plot leaves a 44 px gutter on the trailing side so labels never sit on the line */}
        <div className="relative" style={grid ? { paddingRight: GUTTER } : undefined}>
          {grid?.map((g) => (
            <span
              key={g.value}
              aria-hidden="true"
              className="t-caption c-2 pointer-events-none absolute right-0 -translate-y-1/2 whitespace-nowrap tabular-nums"
              style={{ top: `${(ny(g.value) / H) * 100}%` }}
            >
              {g.label}
            </span>
          ))}
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full cursor-crosshair"
              style={{ height: H, touchAction: "pan-y" }}
              preserveAspectRatio="none"
              role="img"
              aria-label={min === max ? `${label}: цена не менялась, ${formatValue(min)}` : `${label}: от ${boundLabel(min)} до ${boundLabel(max)}, в конце ${formatValue(pts[N - 1].val)}`}
              onPointerDown={(e) => scrubTo(e.clientX)}
              onPointerMove={(e) => scrubTo(e.clientX)}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") setHover(null)
              }}
            >
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              {grid?.map((g) => (
                <line
                  key={g.value}
                  x1={0}
                  x2={W}
                  y1={ny(g.value)}
                  y2={ny(g.value)}
                  stroke="var(--label-3)"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <g className="price-chart-trace" data-scrubbed={hasScrubbed || undefined}>
                <path className="price-chart-area" d={area} fill={`url(#${fillId})`} />
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            </svg>

            {active && (
              <>
                <i
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-0 border-l border-dashed"
                  style={{
                    left: `${(active.x / W) * 100}%`,
                    borderColor: "var(--label-2)",
                  }}
                />
                <i
                  aria-hidden
                  className="pointer-events-none absolute block h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${(active.x / W) * 100}%`,
                    top: `${(active.y / H) * 100}%`,
                    background: color,
                    boxShadow: `0 0 0 2px ${surface}`,
                  }}
                />
              </>
            )}

            {active && onScrub ? (
              <span role="status" className="sr-only">
                {formatValue(active.val)}, {formatTime(active.time)}
              </span>
            ) : null}

            {active && !onScrub && (
              <div
                className="pointer-events-none absolute z-10 rounded-[10px] px-2.5 py-1.5"
                role="status"
                style={{
                  left: `${(active.x / W) * 100}%`,
                  top: `clamp(2px, calc(${(active.y / H) * 100}% - 22px), calc(100% - 52px))`,
                  transform: onLeftHalf ? "translateX(14px)" : "translateX(calc(-100% - 14px))",
                  background: "var(--elevated-2)",
                  // the tooltip floats over the line, so it gets the one shadow on the chart
                  boxShadow: "0 8px 24px -6px rgba(0,0,0,0.6)",
                }}
              >
                <div className="t-subhead whitespace-nowrap font-semibold tabular-nums text-[var(--label)]">{formatValue(active.val)}</div>
                <div className="t-caption c-2 whitespace-nowrap">{formatTime(active.time)}</div>
              </div>
            )}
            <p className="price-chart-keyboard-help" aria-hidden="true">← → по точкам · Home / End по краям · Esc сбросить</p>
          </div>
        </div>
      </div>

      <div className="price-chart-time-axis" aria-hidden="true" style={grid ? { paddingRight: GUTTER } : undefined}>
        <div ref={axisRef} className="t-caption c-2 relative min-h-[1lh] tabular-nums">
          {ticks.map(({ at, text }) => (
            <span
              key={text}
              className="absolute top-0 whitespace-nowrap"
              style={
                at === 0
                  ? { left: 0 }
                  : at === 1
                    ? { right: 0 }
                    : {
                        left: `${at * 100}%`,
                        transform: "translateX(-50%)",
                      }
              }
            >
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
