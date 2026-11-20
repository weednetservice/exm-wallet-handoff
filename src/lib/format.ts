/** Russian formatting for money, coin amounts, addresses and dates. Base units stay bigint until display. */

const usd = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
const usdSmall = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", maximumSignificantDigits: 3 })
const pct = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" })

export function formatUsd(value: number) {
  if (!Number.isFinite(value)) return "нет данных"
  return Math.abs(value) > 0 && Math.abs(value) < 0.01 ? usdSmall.format(value) : usd.format(value)
}

/** 2.5 → "+2,5 %" */
export function formatPercent(value: number) {
  return Number.isFinite(value) ? pct.format(value / 100) : "нет данных"
}

/** bigint base units → decimal string, trimmed: (1500000000000000000n, 18) → "1.5" */
export function fromUnits(amount: bigint, decimals: number) {
  const neg = amount < 0n
  const abs = neg ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "")
  return (neg ? "-" : "") + whole.toString() + (frac ? "." + frac : "")
}

/** decimal string → bigint base units; throws on more decimals than the coin has */
export function toUnits(value: string, decimals: number) {
  const clean = value.trim().replace(",", ".")
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") throw new Error("Введите число")
  const [whole, frac = ""] = clean.split(".")
  if (frac.length > decimals) throw new Error(`Не больше ${decimals} знаков после запятой`)
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0")
}

/** coin amount for display, up to `max` significant decimals: "0,0421 ETH" */
export function formatCoin(amount: bigint, decimals: number, symbol: string, max = 6) {
  const [w, f = ""] = fromUnits(amount, decimals).split(".")
  const wholeFmt = new Intl.NumberFormat("ru-RU").format(BigInt(w.replace("-", "")))
  const sign = w.startsWith("-") ? "−" : ""
  const lead = f.match(/^0*/)?.[0].length ?? 0
  const frac = f.slice(0, Math.max(max, lead + 2)).replace(/0+$/, "")
  return `${sign}${wholeFmt}${frac ? "," + frac : ""} ${symbol}`
}

const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 })

/** for tight spots (a card): up to 999 999 as usual, larger as "116,3 млн TON" */
export function formatCoinShort(amount: bigint, decimals: number, symbol: string, max = 4) {
  const whole = amount / 10n ** BigInt(decimals)
  if (whole < 1_000_000n && whole > -1_000_000n) return formatCoin(amount, decimals, symbol, max)
  return `${compact.format(Number(whole))} ${symbol}`
}

/** 0x1234…abcd */
export function shortAddress(addr: string, head = 6, tail = 4) {
  return addr.length <= head + tail + 1 ? addr : `${addr.slice(0, head)}…${addr.slice(-tail)}`
}

const relative = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" })
const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" })
const dateYearFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })

/** "5 минут назад", "вчера", "3 ноября", "3 ноября 2025 г." */
export function formatWhen(date: Date, now = new Date()) {
  const s = Math.round((date.getTime() - now.getTime()) / 1000)
  if (Math.abs(s) < 60) return "только что"
  if (Math.abs(s) < 3600) return relative.format(Math.round(s / 60), "minute")
  if (Math.abs(s) < 86_400) return relative.format(Math.round(s / 3600), "hour")
  if (Math.abs(s) < 2 * 86_400) return relative.format(Math.round(s / 86_400), "day")
  return date.getFullYear() === now.getFullYear() ? dateFmt.format(date) : dateYearFmt.format(date)
}
