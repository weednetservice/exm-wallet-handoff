/** Helpers for the "Прогнозы" tab: outcome names in Russian, the headline outcome, probabilities, dates. */
import type { Outcome, PredictionMarket } from "@/lib/api/polymarket"

/** the standard answers get Russian names; anything else (teams, prices) stays as Polymarket wrote it */
const OUTCOME_RU: Record<string, string> = { yes: "Да", no: "Нет", up: "Вверх", down: "Вниз" }

export const outcomeName = (o: Outcome) => OUTCOME_RU[o.name.trim().toLowerCase()] ?? o.name
/** true when the name is Polymarket's own text, so screen readers read it in English */
export const outcomeIsEnglish = (o: Outcome) => !(o.name.trim().toLowerCase() in OUTCOME_RU)

/** the outcome with the highest price */
export function leadingIndex(m: PredictionMarket) {
  return m.outcomes.reduce((best, o, i) => (o.price > m.outcomes[best].price ? i : best), 0)
}

/**
 * The outcome a row and the sheet lead with. A two-way market is read as the chance of its first
 * answer ("Да", "Вверх"), as Polymarket and Perplexity show it, so the number always answers the
 * question as asked; with three or more answers the favourite leads.
 */
export const headlineIndex = (m: PredictionMarket) => (m.outcomes.length === 2 ? 0 : leadingIndex(m))

const pct0 = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 })
const pct1 = new Intl.NumberFormat("ru-RU", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** list precision, as Polymarket shows it: "<1 %", "54 %", ">99 %" */
export function formatChance(p: number) {
  if (!Number.isFinite(p)) return "нет данных"
  if (p > 0 && p < 0.01) return "<1 %"
  if (p < 1 && p > 0.99) return ">99 %"
  return pct0.format(p)
}

/** detail precision: "53,5 %" */
export const formatChanceExact = (p: number) => (Number.isFinite(p) ? pct1.format(p) : "нет данных")

/*
 * Polymarket closes markets on New York time: "by December 31" ends at 2027-01-01T05:00Z, midnight
 * in New York. Dates are shown in that zone, and a close at midnight is shown as the end of the day
 * before, so the date matches the question ("31 декабря", not "1 января" in Moscow).
 */
const ZONE = "America/New_York"
const relative = new Intl.RelativeTimeFormat("ru-RU", { numeric: "always", style: "short" })
const nyDay = new Intl.DateTimeFormat("ru-RU", { timeZone: ZONE, day: "numeric", month: "long" })
const nyDayYear = new Intl.DateTimeFormat("ru-RU", { timeZone: ZONE, day: "numeric", month: "long", year: "numeric" })
const nyYear = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric" })
const nyClock = new Intl.DateTimeFormat("ru-RU", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })

/** the close as New York sees it; midnight counts as the end of the previous day */
function nyClose(t: number) {
  const clock = nyClock.format(t)
  const midnight = clock === "00:00"
  return { day: midnight ? t - 1000 : t, clock: midnight ? "24:00" : clock }
}

/** when the market stops trading: "закроется через 3 ч", "до 31 декабря", "срок вышел, ждёт итога" */
export function closingText(iso?: string, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return "дата закрытия не указана"
  const diff = t - now
  if (diff <= 0) return "срок вышел, ждёт итога"
  if (diff < 3_600_000) return "закроется " + relative.format(Math.max(1, Math.round(diff / 60_000)), "minute")
  if (diff < 48 * 3_600_000) return "закроется " + relative.format(Math.round(diff / 3_600_000), "hour")
  const { day } = nyClose(t)
  return "до " + (nyYear.format(day) === nyYear.format(now) ? nyDay : nyDayYear).format(day)
}

/** "31 декабря 2026 г., 24:00 по Нью-Йорку" for the detail sheet */
export function closingDate(iso?: string) {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return "не указана"
  const { day, clock } = nyClose(t)
  // "2026 г." and "по Нью-Йорку" stay whole when the line wraps on a narrow phone
  return `${nyDayYear.format(day).replace(/ г\.$/, "\u00a0г.")}, ${clock} по\u00a0Нью-Йорку`
}
