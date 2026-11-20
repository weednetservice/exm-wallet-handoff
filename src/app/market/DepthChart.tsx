/**
 * Order book depth chart
 *
 * Adapted from "Depth Chart" by Arihant jain (21st.dev @arihantcodes_1f7b8c4d, Spectrum UI),
 * https://21st.dev/@arihantcodes_1f7b8c4d/components/depth-chart. No public licence; used with the
 * author's permission reported by the project owner on 2026-11-14, see licenses/depth-chart.LICENSE.
 * The restored original stays untouched in src/components/ui/depth-chart.tsx.
 *
 * Kept: the geometry (padding, a price range symmetric around the mid, stepped bid and ask areas
 * drawn from the mid outward, 1 / 2 / 2.5 / 5 / 10 ticks, a dashed size grid, the crosshair with the
 * cumulative size reached at the pointer, the table copy for screen readers).
 * Changed: Russian copy (the original table caption had an em dash); wallet colour tokens instead of
 * the Spectrum palette; axis labels 12 px at 5.9:1 instead of 10.5 px at 4.2:1; the crosshair also
 * works from the keyboard (arrows step through the levels); the readout sits in HTML above the plot
 * instead of a fixed 92 px SVG tag that clipped longer Russian prices; no mount animation, because
 * the book refreshes every 5 s; loading, empty and error states live in the screen.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import type { DepthBook, DepthLevel } from "./data"
import { formatPrice, formatPriceDigits, formatSize } from "./format"

const UP = "var(--green)"
const DOWN = "var(--red)"
const SURFACE = "var(--grouped)"
const PAD = { top: 10, right: 58, bottom: 24, left: 4 }

/** 1 / 2 / 2.5 / 5 / 10 steps covering [min, max] */
function niceTicks(min: number, max: number, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return { ticks: [min], step: 0 }
  const raw = (max - min) / count
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const residual = raw / magnitude
  const step = (residual >= 7.5 ? 10 : residual >= 3.5 ? 5 : residual >= 2.25 ? 2.5 : residual >= 1.5 ? 2 : 1) * magnitude
  const first = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let v = first; v <= max + step * 0.001; v += step) ticks.push(Math.round(v / step) * step)
  return { ticks, step }
}

/** stepped area from the mid outward: horizontal to each level's price, then vertical to its cumulative total */
function stepPath(levels: DepthLevel[], x: (price: number) => number, y: (total: number) => number, midX: number, baseY: number) {
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

function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** decimals that write a step exactly: 5 → 0, 2.5 → 1, 0.25 → 2, 0.0002 → 4 */
function decimals(step: number) {
  if (!(step > 0)) return 2
  let d = 0
  while (d < 8 && Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) > 1e-6) d++
  return d
}
const spreadPercent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 3 })

export function DepthChart({ book, symbol, height = 200 }: { book: DepthBook; symbol: string; height?: number }) {
  const [containerRef, measuredWidth] = useElementWidth()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverPrice, setHoverPrice] = useState<number | null>(null)

  const width = Math.max(measuredWidth, 240)
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
  const bidDepth = book.bids[book.bids.length - 1]?.total ?? 0
  const askDepth = book.asks[book.asks.length - 1]?.total ?? 0
  const maxTotal = Math.max(bidDepth, askDepth, 1e-9)

  const xScale = useCallback((price: number) => x0 + ((price - minPrice) / (maxPrice - minPrice)) * (x1 - x0), [x0, x1, minPrice, maxPrice])
  const yScale = useCallback((total: number) => y1 - (total / maxTotal) * (y1 - y0), [y0, y1, maxTotal])
  const xInvert = useCallback((px: number) => minPrice + ((px - x0) / (x1 - x0)) * (maxPrice - minPrice), [x0, x1, minPrice, maxPrice])

  const midX = xScale(book.mid)
  const bidPath = stepPath(book.bids, xScale, yScale, midX, y1)
  const askPath = stepPath(book.asks, xScale, yScale, midX, y1)
  const priceAxis = useMemo(() => {
    // about one label per 90 px: a Russian price label ("1 885 $") is up to ~60 px wide at 12 px
    const { ticks, step } = niceTicks(minPrice, maxPrice, Math.max(2, Math.min(5, Math.floor((x1 - x0) / 90))))
    // labels too close to the mid line would sit on top of it
    return { ticks: ticks.filter((p) => Math.abs(xScale(p) - midX) > 20), digits: decimals(step) }
  }, [minPrice, maxPrice, x0, x1, xScale, midX])
  const sizeTicks = useMemo(() => niceTicks(0, maxTotal, 4).ticks, [maxTotal])

  // every level price, low to high: the stops of the keyboard crosshair
  const stops = useMemo(
    () =>
      [...book.bids]
        .reverse()
        .map((l) => l.price)
        .concat(book.asks.map((l) => l.price)),
    [book],
  )

  // cumulative size resting between the mid and the hovered price
  const hover = useMemo(() => {
    if (hoverPrice == null) return null
    const isBid = hoverPrice < book.mid
    const levels = isBid ? book.bids : book.asks
    let reached: DepthLevel | null = null
    for (const level of levels) if (isBid ? hoverPrice <= level.price : hoverPrice >= level.price) reached = level
    return { price: hoverPrice, isBid, total: reached?.total ?? 0 }
  }, [hoverPrice, book])

  const onMove = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * width
    setHoverPrice(xInvert(Math.max(x0, Math.min(x1, px))))
  }

  const onKey = (e: KeyboardEvent) => {
    if (!stops.length) return
    const nearest =
      hoverPrice == null ? -1 : stops.reduce((best, p, i) => (Math.abs(p - hoverPrice) < Math.abs(stops[best] - hoverPrice) ? i : best), 0)
    const startAt = stops.length - book.asks.length - 1 // best bid
    const cur = nearest < 0 ? startAt : nearest
    const step = e.shiftKey ? 4 : 1
    const next =
      e.key === "ArrowLeft"
        ? cur - step
        : e.key === "ArrowRight"
          ? cur + step
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? stops.length - 1
              : null
    if (e.key === "Escape") setHoverPrice(null)
    if (next !== null) {
      e.preventDefault()
      setHoverPrice(stops[Math.max(0, Math.min(stops.length - 1, next))])
    }
  }

  const ready = measuredWidth > 0
  // quote precision: cents above $10, four decimals below (as for the price itself)
  const spreadDigits = book.mid < 10 ? 4 : 2
  const priceDigits = Math.max(priceAxis.digits, decimals(book.step))
  const uid = "dc" + useId().replace(/:/g, "")

  return (
    <div ref={containerRef} className="flex w-full flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className="t-footnote c-2">Средняя цена</dt>
          <dd className="t-headline tabular-nums">{formatPrice(book.mid)}</dd>
        </div>
        <div className="text-right">
          <dt className="t-footnote c-2">Спред</dt>
          <dd className="t-headline tabular-nums">
            {formatPriceDigits(book.spread, spreadDigits)}{" "}
            <span className="t-footnote c-2 font-normal">({spreadPercent.format(book.spread / book.mid)})</span>
          </dd>
        </div>
        <div>
          <dt className="t-footnote c-2 flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: UP }} />
            {/* the totals cover only the drawn window, so the label says where it ends */}
            Покупка от {formatPriceDigits(lowestBid, decimals(book.step))}
          </dt>
          <dd className="t-subhead tabular-nums">
            {formatSize(bidDepth)} {symbol}
          </dd>
        </div>
        <div className="text-right">
          <dt className="t-footnote c-2 flex items-center justify-end gap-1.5">
            Продажа до {formatPriceDigits(highestAsk, decimals(book.step))}
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: DOWN }} />
          </dt>
          <dd className="t-subhead tabular-nums">
            {formatSize(askDepth)} {symbol}
          </dd>
        </div>
      </dl>

      {/* two lines reserved: the readout wraps on narrow phones, and the plot must not jump while scrubbing */}
      <p className="t-footnote min-h-[36px] tabular-nums" aria-live="polite">
        {hover ? (
          <span style={{ color: "var(--label)" }}>
            {hover.isBid ? "Покупка по " : "Продажа по "}
            {formatPriceDigits(hover.price, priceDigits)}
            {hover.isBid ? " и дороже: " : " и дешевле: "}
            <b className="font-semibold">
              {formatSize(hover.total)} {symbol}
            </b>
          </span>
        ) : (
          <span className="c-2">Проведите по графику: объём до выбранной цены.</span>
        )}
      </p>

      <div
        className="relative w-full rounded-[8px]"
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`Глубина стакана ${symbol}: средняя цена ${formatPrice(book.mid)}, спред ${formatPriceDigits(book.spread, spreadDigits)}. Стрелки влево и вправо переходят по уровням цены.`}
        onKeyDown={onKey}
        onFocus={() => setHoverPrice((p) => p ?? book.bids[0]?.price ?? null)}
        onBlur={() => setHoverPrice(null)}
      >
        {ready ? (
          <svg
            ref={svgRef}
            width={width}
            height={h}
            viewBox={`0 0 ${width} ${h}`}
            className="block w-full cursor-crosshair touch-pan-y select-none overflow-visible"
            aria-hidden="true"
            onPointerMove={(e) => onMove(e.clientX)}
            onPointerDown={(e) => onMove(e.clientX)}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") setHoverPrice(null)
            }}
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
                  stroke="var(--label-3)"
                  strokeOpacity={0.6}
                  strokeDasharray="2 4"
                />
              ))}
            </g>

            <path d={bidPath} fill={`url(#${uid}-bid)`} stroke={UP} strokeWidth={1.5} />
            <path d={askPath} fill={`url(#${uid}-ask)`} stroke={DOWN} strokeWidth={1.5} />

            {/* mid line */}
            <line x1={midX} x2={midX} y1={y0 - 4} y2={y1} stroke="var(--label-2)" strokeDasharray="3 3" />

            {/* size axis (right) */}
            {sizeTicks.map((t) =>
              t === 0 ? null : (
                <text
                  key={t}
                  x={x1 + 8}
                  y={yScale(t)}
                  dominantBaseline="middle"
                  fontSize={12}
                  fill="var(--label-2)"
                  className="tabular-nums"
                >
                  {formatSize(t)}
                </text>
              ),
            )}

            {/* price axis (bottom) */}
            {priceAxis.ticks.map((p) => (
              <text
                key={p}
                x={Math.max(x0 + 24, Math.min(x1 - 24, xScale(p)))}
                y={y1 + 17}
                textAnchor="middle"
                fontSize={12}
                fill="var(--label-2)"
                className="tabular-nums"
              >
                {formatPriceDigits(p, priceAxis.digits)}
              </text>
            ))}

            {/* crosshair */}
            {hover ? (
              <g>
                <line x1={xScale(hover.price)} x2={xScale(hover.price)} y1={y0} y2={y1} stroke="var(--label-2)" strokeDasharray="3 3" />
                <line
                  x1={x0}
                  x2={x1}
                  y1={yScale(hover.total)}
                  y2={yScale(hover.total)}
                  stroke={hover.isBid ? UP : DOWN}
                  strokeOpacity={0.6}
                  strokeDasharray="3 3"
                />
                <circle
                  cx={xScale(hover.price)}
                  cy={yScale(hover.total)}
                  r={4.5}
                  fill={SURFACE}
                  stroke={hover.isBid ? UP : DOWN}
                  strokeWidth={2}
                />
              </g>
            ) : null}
          </svg>
        ) : null}
      </div>

      {/* screen-reader copy of the chart data */}
      <div className="sr-only">
        <table>
          <caption>Стакан {symbol}: накопленный объём заявок по ценам</caption>
          <thead>
            <tr>
              <th scope="col">Цена</th>
              <th scope="col">Сторона</th>
              <th scope="col">Объём, {symbol}</th>
              <th scope="col">Накоплено, {symbol}</th>
            </tr>
          </thead>
          <tbody>
            {[...book.asks].reverse().map((l) => (
              <tr key={"a" + l.price}>
                <th scope="row">{formatPriceDigits(l.price, priceDigits)}</th>
                <td>продажа</td>
                <td>{formatSize(l.size)}</td>
                <td>{formatSize(l.total)}</td>
              </tr>
            ))}
            {book.bids.map((l) => (
              <tr key={"b" + l.price}>
                <th scope="row">{formatPriceDigits(l.price, priceDigits)}</th>
                <td>покупка</td>
                <td>{formatSize(l.size)}</td>
                <td>{formatSize(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
