/**
 * A coin's price over a chosen period: price (or the scrubbed point), change over the period,
 * the chart and the period switch. Used by the token screen and by Рынок.
 */
import { useLayoutEffect, useRef, useState } from "react"
import { Skeleton } from "../ui"
import { LoadError } from "./states"
import { formatMarketSavedTime, useSeries, type Coin } from "./data"
import { PriceChart, type ChartPoint } from "./PriceChart"
import { Segmented } from "./Segmented"
import { formatChange, formatPrice, formatPriceDigits, pointTimeFormat, RANGE_LABEL, RANGE_SPAN, tickFormat, type ChartRange } from "./format"

const RANGES: ChartRange[] = ["1D", "1W", "1M", "1Y"]

function MarketPriceFigure({ text }: { text: string }) {
  const number = text.replace(/\s*\$$/, "")
  const content = <><span>{number}</span>{text.endsWith("$") ? <span className="market-price-unit">$</span> : null}</>
  const frame = useRef<HTMLSpanElement>(null)
  const measure = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const figure = frame.current
    const natural = measure.current
    const container = figure?.parentElement
    if (!figure || !natural || !container) return
    let pending: number | undefined
    let previous = ""
    const fit = () => {
      pending = undefined
      const available = container.clientWidth
      if (available <= 0) return
      const width = natural.getBoundingClientRect().width
      const size = parseFloat(getComputedStyle(natural).fontSize)
      const signature = `${available}:${width}:${size}`
      if (signature === previous) return
      previous = signature
      let fittedSize = size * Math.min(1, available / Math.max(width, 1))
      for (let attempt = 0; attempt < 3; attempt++) {
        const next = `${Math.floor(fittedSize * 1000) / 1000}px`
        if (figure.style.fontSize !== next) figure.style.fontSize = next
        if (figure.scrollWidth <= available) break
        fittedSize *= available / figure.scrollWidth
      }
    }
    fit()
    const observer = new ResizeObserver(() => { if (pending === undefined) pending = requestAnimationFrame(fit) })
    observer.observe(container)
    observer.observe(natural)
    return () => { observer.disconnect(); if (pending !== undefined) cancelAnimationFrame(pending) }
  }, [text])
  return <><span className="market-price-measure" aria-hidden="true"><span ref={measure}>{content}</span></span><span ref={frame} className="market-price-figure">{content}</span></>
}

/**
 * `quote` is a fallback while the chart loads or if its source is unavailable. Once candles arrive,
 * the headline and period change use the same first and last points as the line. Mixing a rolling
 * 24-hour quote with exchange candles can otherwise show a green percentage over a red chart.
 */
export function CoinChart({
  coin,
  range,
  onRange,
  big = false,
  quote,
  quoteUpdatedAt,
  quoteRefreshFailed = false,
  onRetryQuote,
}: {
  coin: Coin
  range: ChartRange
  onRange: (r: ChartRange) => void
  big?: boolean
  quote?: { usd: number; change24h?: number }
  quoteUpdatedAt?: number
  quoteRefreshFailed?: boolean
  onRetryQuote?: () => void
}) {
  const series = useSeries(coin, range)
  const chartId = `${coin.id}:${range}`
  const [selection, setSelection] = useState<{ chartId: string; point: ChartPoint } | null>(null)
  const scrub = selection?.chartId === chartId ? selection.point : null
  const s = series.data
  const last = s?.points[s.points.length - 1] ?? null
  const first = s?.points[0] ?? null
  const shown = scrub ?? last ?? (quote ? { time: Date.now(), value: quote.usd } : null)
  const change = s
    ? s.points.length > 1 && first && last && first.value > 0 ? ((last.value - first.value) / first.value) * 100 : null
    : range === "1D" ? quote?.change24h ?? null : null
  const shownRange = s?.complete === false ? "за доступный период" : RANGE_SPAN[range]
  const up = (change ?? 0) >= 0
  const refreshFailed = s ? series.isError : !!quote && quoteRefreshFailed
  const savedAt = s ? series.dataUpdatedAt : quoteUpdatedAt

  return (
    <section className="market-coin-chart flex flex-col gap-3" data-big={big || undefined} aria-label={`Цена ${coin.symbol}`}>
      <div className="market-price-heading">
        <p className="market-price-label">{scrub ? "Цена в точке" : "Цена"}</p>
        <p className="market-price-value">
          {shown ? <MarketPriceFigure text={formatPrice(shown.value)} /> : series.isError ? <span className="market-price-unavailable">Цена недоступна</span> : <Skeleton className="h-8 w-40 rounded-[8px]" />}
        </p>
        {/* scrubbing shows the point's time; otherwise the change over the chosen period */}
        <p className="market-price-change min-h-5 tabular-nums">
          {scrub ? (
            <span className="c-2">{pointTimeFormat(range)(scrub.time)}</span>
          ) : change !== null ? (
            <>
              <span style={{ color: formatChange(change) === formatChange(0) ? "var(--label-2)" : up ? "var(--green)" : "var(--red)" }}>{formatChange(change)}</span> <span className="c-2">{shownRange}</span>
            </>
          ) : null}
        </p>
      </div>

      {refreshFailed ? <div className="market-refresh-note" role="status"><p>{s ? "График не обновился." : "Цена не обновилась."} Показаны данные{savedAt ? <>, сохранённые <time dateTime={new Date(savedAt).toISOString()}>{formatMarketSavedTime(savedAt)}</time></> : " из последнего расчёта"}.</p><button type="button" disabled={series.isFetching} onClick={() => { void series.refetch(); if (!s && quoteRefreshFailed) onRetryQuote?.() }}>{series.isFetching ? "Обновляем…" : "Повторить обновление"}</button></div> : null}

      {s && s.points.length > 1 ? (
        <PriceChart
          key={chartId}
          points={s.points}
          label={`Цена ${coin.symbol} ${shownRange}, ${s.source}`}
          formatValue={formatPrice}
          formatExtremum={(value, span) => formatPriceDigits(value, Math.min(12, Math.max(2, Math.ceil(-Math.log10(span)) + 1)))}
          formatTime={pointTimeFormat(range)}
          formatTick={tickFormat(range, first?.time, last?.time)}
          onScrub={(point) => setSelection((current) => point ? { chartId, point } : current?.chartId === chartId ? null : current)}
          height={big ? 220 : 180}
        />
      ) : series.isPending ? (
        <div className="market-chart-placeholder market-chart-loading" style={{ height: big ? 244 : 204 }} aria-busy="true">
          <p className="t-body2 c-2">График загружается</p>
          <Skeleton className="h-1 w-20 rounded-full" />
        </div>
      ) : (
        <div className="market-chart-placeholder flex items-center" style={{ minHeight: big ? 244 : 204 }}>
          {series.isError ? (
            <LoadError message="Не удалось загрузить график." onRetry={() => series.refetch()} />
          ) : (
            <p className="t-body2 c-2 px-4 py-4">За этот период нет данных. Выберите другой период.</p>
          )}
        </div>
      )}

      <Segmented className="market-chart-periods" label="Период графика" options={RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))} value={range} onChange={onRange} />
    </section>
  )
}
