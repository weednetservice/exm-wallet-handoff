/** Russian formatting for the market and prediction tabs: prices, changes, compact money, chart times. */
import type { CandleRange } from "@/lib/api/market"

/** the four ranges the coin screen offers (the data layer also knows 1H and ALL) */
export type ChartRange = Extract<CandleRange, "1D" | "1W" | "1M" | "1Y">

const MINUS = "−"
const withMinus = (s: string) => s.replace("-", MINUS)

const priceSmall = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
const priceLarge = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "1 890,15 $"; under $10 up to four decimals, as exchanges quote TON: "1,0849 $" */
export function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "нет данных"
  return withMinus((Math.abs(value) < 10 ? priceSmall : priceLarge).format(value))
}

/** price at a given precision, for axis labels and order book steps */
export function formatPriceDigits(value: number, digits: number) {
  return withMinus(
    new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value),
  )
}

const change = new Intl.NumberFormat("ru-RU", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
})

/** -4.49 → "−4,49 %", 2.5 → "+2,50 %" (the sign is the cue that does not depend on colour) */
export function formatChange(percent: number) {
  return Number.isFinite(percent) ? withMinus(change.format(percent / 100)) : "нет данных"
}

const usdCompact = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})
/** 251756 → "251,8 тыс. $" */
export const formatUsdCompact = (value: number) => usdCompact.format(value)

const numCompact = new Intl.NumberFormat("ru-RU", { notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 })
const numPlain = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 })
/** coin amounts in the order book: "4,4 тыс.", "812,5" */
export const formatSize = (value: number) => (Math.abs(value) >= 10_000 ? numCompact.format(value) : numPlain.format(value))

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", o)
const hm = fmt({ hour: "2-digit", minute: "2-digit" })
const numericDayMonth = fmt({ day: "2-digit", month: "2-digit" })
const dayMonth = fmt({ day: "numeric", month: "short" })
const month = fmt({ month: "short" })
const year = fmt({ year: "2-digit" })
const dayMonthTime = fmt({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const dayMonthYear = fmt({ day: "numeric", month: "short", year: "numeric" })
const clock = fmt({ hour: "2-digit", minute: "2-digit", second: "2-digit" })

export const RANGE_LABEL: Record<ChartRange, string> = { "1D": "День", "1W": "Неделя", "1M": "Месяц", "1Y": "Год" }
export const RANGE_SPAN: Record<ChartRange, string> = { "1D": "за день", "1W": "за неделю", "1M": "за месяц", "1Y": "за год" }

/** x-axis label for a price chart of the given range */
export function tickFormat(range: ChartRange, first?: number, last?: number) {
  const crossesMidnight = first !== undefined && last !== undefined && new Date(first).toDateString() !== new Date(last).toDateString()
  if (!crossesMidnight) {
    return first !== undefined && last !== undefined && hm.format(first) === hm.format(last)
      ? (time: number) => clock.format(time)
      : (time: number) => hm.format(time)
  }
  if (range === "1D") return (time: number) => (time === first || time === last ? numericDayMonth : hm).format(time)
  if (range !== "1Y" || first === undefined || last === undefined || last - first < 62 * 86_400_000) {
    return (time: number) => dayMonth.format(time)
  }
  const sameMonth = month.format(first) === month.format(last)
  return (time: number) => sameMonth && (time === first || time === last) ? `${month.format(time)} ${year.format(time)}` : month.format(time)
}

/** time in the chart's tooltip */
export function pointTimeFormat(range: ChartRange) {
  return (t: number) => (range === "1Y" ? dayMonthYear : dayMonthTime).format(t)
}

export const formatClock = (t: number) => clock.format(t)
