/**
 * Portfolio value chart. Based on Balance Chart by Savva Sicevs (21st.dev @ssychui, MIT,
 * licenses/balance-chart.LICENSE): same drawing (line, soft area, high/low labels, crosshair,
 * keyboard reading, sliding range pill), fed with real points and Russian labels.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { CandleRange } from "@/lib/api/market"
import { formatUsd } from "@/lib/format"

const UP = "var(--green)"
const DOWN = "var(--red)"
const W = 640
const H = 200
const STROKE = 2.1

export const VALUE_RANGES: { id: CandleRange; label: string; spoken: string }[] = [
  { id: "1H", label: "1Ч", spoken: "за час" },
  { id: "1D", label: "1Д", spoken: "за сутки" },
  { id: "1W", label: "1Н", spoken: "за неделю" },
  { id: "1M", label: "1М", spoken: "за месяц" },
  { id: "1Y", label: "1Г", spoken: "за год" },
  { id: "ALL", label: "Всё", spoken: "за всё время" },
]

type P = { x: number; y: number }

// Catmull-Rom spline through the points, as cubic Bezier segments (from the original)
function smoothPath(pts: P[]) {
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

const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" })
const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
const dayTimeFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const monthFmt = new Intl.DateTimeFormat("ru-RU", { month: "short", year: "2-digit" })

const tick = (t: number, range: CandleRange) =>
  range === "1H" || range === "1D" ? timeFmt.format(t) : range === "1W" || range === "1M" ? dayFmt.format(t) : monthFmt.format(t)
const when = (t: number, range: CandleRange) =>
  range === "1H" ? timeFmt.format(t) : range === "1D" || range === "1W" ? dayTimeFmt.format(t) : dayFmt.format(t)

export function ValueChart({
  points,
  range,
  onRange,
}: {
  points: { time: number; value: number }[]
  range: CandleRange
  onRange: (r: CandleRange) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(W)
  const N = points.length
  const gradientId = "vc-fill"

  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // narrow chart: fewer pixels per point than two line widths, so smooth the series and draw a spline
  const dense = width / Math.max(1, N - 1) < 2 * STROKE

  const geo = useMemo(() => {
    if (N < 2) return null
    const raw = points.map((p) => p.value)
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
    const ny = (v: number) => H - 14 - ((v - lo) / (hi - lo || 1)) * (H - 44)
    const xy = vals.map((v, i) => ({ x: nx(i), y: ny(v) }))
    const line = dense ? smoothPath(xy) : xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
    const min = Math.min(...raw),
      max = Math.max(...raw)
    return {
      pts: raw.map((v, i) => ({ x: xy[i].x, y: xy[i].y, val: v, time: points[i].time })),
      path: line,
      area: `${line} L${W},${H} L0,${H} Z`,
      min,
      max,
      iMin: raw.indexOf(min),
      iMax: raw.indexOf(max),
      up: raw[N - 1] >= raw[0],
    }
  }, [points, dense, N])

  const spoken = VALUE_RANGES.find((r) => r.id === range)!.spoken
  const ticks = geo ? [0, 0.33, 0.66, 1].map((f) => geo.pts[Math.round(f * (N - 1))].time) : []

  const edge = (x: number): CSSProperties =>
    (x / W) * 100 <= 12 ? { left: 0 } : (x / W) * 100 >= 88 ? { right: 0 } : { left: `${(x / W) * 100}%`, transform: "translateX(-50%)" }

  const scrubTo = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const i = Math.round(((clientX - rect.left) / rect.width) * (N - 1))
    setHover(Math.max(0, Math.min(N - 1, i)))
  }

  const color = geo?.up ? UP : DOWN
  const active = geo && hover != null ? geo.pts[hover] : null
  const onLeftHalf = active ? active.x / W < 0.5 : false

  return (
    <div className="w-full">
      <div
        className="rounded-[14px] pb-3"
        tabIndex={geo ? 0 : -1}
        role="group"
        aria-label={`График стоимости ${spoken}. Стрелками влево и вправо можно прочитать значения.`}
        onFocus={() => setHover((h) => h ?? N - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (!geo) return
          const step = e.shiftKey ? 10 : 1
          const cur = hover ?? N - 1
          const next = e.key === "ArrowLeft" ? cur - step : e.key === "ArrowRight" ? cur + step : e.key === "Home" ? 0 : e.key === "End" ? N - 1 : null
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
            className="h-[200px] w-full cursor-crosshair"
            preserveAspectRatio="none"
            role="img"
            aria-label={geo ? `Стоимость ${spoken}: от ${formatUsd(geo.min)} до ${formatUsd(geo.max)}, сейчас ${formatUsd(geo.pts[N - 1].val)}` : "Нет данных для графика"}
            style={{ touchAction: "pan-y" }}
            onPointerDown={(e) => geo && scrubTo(e.clientX)}
            onPointerMove={(e) => geo && scrubTo(e.clientX)}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") setHover(null)
            }}
          >
            {geo ? (
              <>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={geo.area} fill={`url(#${gradientId})`} />
                <path d={geo.path} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </>
            ) : null}
          </svg>

          {active ? (
            <>
              <i aria-hidden className="pointer-events-none absolute inset-y-0 w-0 border-l border-dashed border-[var(--label-3)]" style={{ left: `${(active.x / W) * 100}%` }} />
              <i
                aria-hidden
                className="pointer-events-none absolute block size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%`, background: color, boxShadow: "0 0 0 1.5px var(--bg)" }}
              />
              <div
                className="pointer-events-none absolute z-10 rounded-[10px] border border-[var(--separator)] bg-[var(--elevated-2)] px-2.5 py-1.5"
                role="status"
                style={{
                  left: `${(active.x / W) * 100}%`,
                  top: `clamp(2px, calc(${(active.y / H) * 100}% - 22px), calc(100% - 52px))`,
                  transform: onLeftHalf ? "translateX(14px)" : "translateX(calc(-100% - 14px))",
                  boxShadow: "0 8px 24px -6px rgba(0,0,0,.5)",
                }}
              >
                <div className="t-footnote font-semibold">{formatUsd(active.val)}</div>
                <div className="t-caption c-2">{when(active.time, range)}</div>
              </div>
            </>
          ) : null}

          {geo ? (
            <>
              <span className="t-caption c-2 pointer-events-none absolute font-medium" style={{ ...edge(geo.pts[geo.iMax].x), top: `${(geo.pts[geo.iMax].y / H) * 100}%`, marginTop: -18 }}>
                {formatUsd(geo.max)}
              </span>
              <span className="t-caption c-2 pointer-events-none absolute font-medium" style={{ ...edge(geo.pts[geo.iMin].x), top: `${(geo.pts[geo.iMin].y / H) * 100}%`, marginTop: 8 }}>
                {formatUsd(geo.min)}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="t-caption c-2 flex justify-between px-1" aria-hidden="true">
        {ticks.map((t, i) => (
          <span key={i}>{tick(t, range)}</span>
        ))}
      </div>

      <div className="relative mx-auto mt-3 flex w-full gap-1 rounded-full bg-[var(--grouped)] p-1" role="group" aria-label="Период графика">
        {/* sliding pill behind the active range (from the original) */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 rounded-full bg-[var(--elevated-2)] transition-transform duration-[380ms] ease-[cubic-bezier(0.34,1.16,0.5,1)] motion-reduce:transition-none"
          style={{
            width: `calc((100% - 8px - ${(VALUE_RANGES.length - 1) * 4}px) / ${VALUE_RANGES.length})`,
            transform: `translateX(calc(${VALUE_RANGES.findIndex((r) => r.id === range)} * (100% + 4px)))`,
          }}
        />
        {VALUE_RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onRange(r.id)}
            aria-pressed={range === r.id}
            aria-label={`Показать ${r.spoken}`}
            className="t-footnote relative z-[1] min-h-11 flex-1 rounded-full font-semibold transition-[color,transform] duration-200 active:scale-[0.94] motion-reduce:transition-none"
            style={{ color: range === r.id ? "var(--label)" : "var(--label-2)" }}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}
