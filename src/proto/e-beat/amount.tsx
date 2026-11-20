/**
 * Numbers, by the shared base of all three prototypes (08 §4 D): amounts stand in a column aligned by
 * the decimal comma, zeros between the comma and the first significant digit are quiet, and a digit
 * moves only when it changed.
 */
import { useEffect, useRef } from "react"
import { fromUnits } from "@/lib/format"

const NNBSP = " " // narrow no-break space between groups of three

export const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP)
/** fraction groups run left to right: 000 078 */
const groupFrac = (digits: string) => (digits.length > 4 ? digits.replace(/(\d{3})(?=\d)/g, "$1" + NNBSP) : digits)

export type Parts = {
  int: string
  /** quiet zeros right after the comma */
  lead: string
  /** significant digits of the fraction */
  sig: string
  zero: boolean
}

/** base units → parts; `sig` significant fraction digits are kept (cut, not rounded: a balance never shows more than there is) */
export function parts(units: bigint, decimals: number, sig = 4): Parts {
  const [w, f = ""] = fromUnits(units, decimals).split(".")
  const lead = w === "0" ? (f.match(/^0*/)?.[0] ?? "") : ""
  const rest = f.slice(lead.length, lead.length + sig).replace(/0+$/, "")
  return { int: group(w), lead: rest ? lead : "", sig: rest, zero: units === 0n }
}

/** the fraction as it is shown, split into its quiet zeros and its significant digits (group spaces kept) */
function fracShown(p: Parts): [string, string] {
  const g = groupFrac(p.lead + p.sig)
  let i = 0
  for (let seen = 0; seen < p.lead.length; i++) if (g[i] !== NNBSP) seen++
  return [g.slice(0, i), g.slice(i)]
}

/** "0,2206": for accessible names and plain text */
export function amountText(units: bigint, decimals: number, sig = 4) {
  const p = parts(units, decimals, sig)
  return p.int + (p.sig ? "," + p.lead + p.sig : "")
}

/** the same number as spans: quiet zeros in the secondary colour, a zero balance quiet as a whole */
export function Amount({ units, decimals, sig, unit, className }: { units: bigint; decimals: number; sig?: number; unit?: string; className?: string }) {
  const p = parts(units, decimals, sig)
  const [lead, sig$] = fracShown(p)
  return (
    <span className={className} aria-label={amountText(units, decimals, sig) + (unit ? " " + unit : "")}>
      <span aria-hidden="true">
        {p.zero ? (
          <span className="c-2">0</span>
        ) : p.sig ? (
          <>
            <span className={p.int === "0" ? "c-2" : undefined}>{p.int},</span>
            {lead ? <span className="c-2">{lead}</span> : null}
            {sig$}
          </>
        ) : (
          p.int
        )}
        {unit ? <span className={p.zero ? "c-2" : undefined}> {unit}</span> : null}
      </span>
    </span>
  )
}

/**
 * One cell of a comma-aligned column: the whole part ends and the fraction starts on the same vertical
 * in every row. `intCh` and `fracCh` are the widest whole part and fraction of the column, in digits.
 */
export function AmountCell({ units, decimals, sig, intCh, fracCh, className }: { units: bigint; decimals: number; sig?: number; intCh: number; fracCh: number; className?: string }) {
  const p = parts(units, decimals, sig)
  const [lead, sig$] = fracShown(p)
  return (
    <span className={"inline-grid " + (className ?? "")} style={{ gridTemplateColumns: `${intCh}ch ${fracCh ? fracCh + 0.5 : 0}ch` }} aria-label={amountText(units, decimals, sig)}>
      <span aria-hidden="true" className={"text-right " + (p.zero || p.int === "0" ? "c-2" : "")}>
        {p.int}
      </span>
      <span aria-hidden="true" className="text-left">
        {p.sig ? (
          <>
            <span className="c-2">,{lead}</span>
            {sig$}
          </>
        ) : null}
      </span>
    </span>
  )
}

/** column widths for a list of amounts */
export function columnOf(list: { units: bigint; decimals: number }[], sig?: number) {
  const ps = list.map((x) => parts(x.units, x.decimals, sig))
  return { intCh: Math.max(...ps.map((p) => p.int.length)), fracCh: Math.max(...ps.map((p) => groupFrac(p.lead + p.sig).length)) }
}

const usdParts = (value: number) => {
  const [w, f] = Math.abs(value).toFixed(2).split(".")
  return { int: group(w), frac: f }
}
export const usdText = (value: number) => {
  const p = usdParts(value)
  return `${p.int},${p.frac}${NNBSP}$`
}
/** a price can be far below a cent (MON): three significant digits then */
export const priceText = (value: number) => (value >= 0.01 || value === 0 ? usdText(value) : value.toPrecision(3).replace(".", ",") + NNBSP + "$")

/** dollars in a comma-aligned column (all secondary: the coin amount above it is the figure) */
export function UsdCell({ value, intCh }: { value: number; intCh: number }) {
  const p = usdParts(value)
  return (
    <span className="inline-grid" style={{ gridTemplateColumns: `${intCh}ch auto` }} aria-label={usdText(value)}>
      <span aria-hidden="true" className="text-right">
        {p.int}
      </span>
      <span aria-hidden="true">
        ,{p.frac}
        {NNBSP}$
      </span>
    </span>
  )
}
export const usdIntCh = (values: number[]) => Math.max(...values.map((v) => usdParts(v).int.length))

/** the big balance: whole dollars loud, cents and the sign quiet and smaller (Monzo's pence, Uniswap's cents) */
export function Balance({ value }: { value: number }) {
  const p = usdParts(value)
  return (
    <p className="t-balance" aria-label={usdText(value)}>
      <span aria-hidden="true">
        {p.int}
        <span className="eb-cents">
          ,{p.frac}
          {NNBSP}$
        </span>
      </span>
    </p>
  )
}

/**
 * A number whose digits change in place: only a digit that changed slides in, upwards (heights only grow).
 * `slide` is off for networks faster than a block a second: four slides a second is flicker, not information
 * (HIG motion.md: avoid motion on frequent updates), so there the digits just switch.
 */
export function Ticker({ value, slide }: { value: number; slide: boolean }) {
  const text = group(String(value))
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
  }, [])
  return (
    <span className="eb-ticker" aria-label={text}>
      {[...text].map((ch, i) => (
        // counted from the right, so a digit keeps its key when the number grows by a place
        <span key={`${text.length - i}:${ch}`} aria-hidden="true" className={slide && mounted.current ? "eb-digit" : undefined}>
          {ch}
        </span>
      ))}
    </span>
  )
}
