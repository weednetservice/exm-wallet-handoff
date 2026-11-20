/** Shared pieces of prototype A: the light's context, logos, and amounts that stand by the decimal comma. */
import { createContext, useContext, type CSSProperties, type ReactNode } from "react"
import type { MotionValue } from "motion/react"
import { RoundMark } from "@/app/marks"
import { formatUsd, fromUnits } from "@/lib/format"
import { cn } from "@/lib/utils"
import { coinBySymbol, type Coin, type Net } from "./data"

export type Route = { screen: "home"; filter: string | null } | { screen: "coin"; coin: string; net: string | null } | { screen: "send"; coin: string; net: string } | { screen: "unlock" }

export type GoOptions = {
  /** viewport y where the light is born before it rises to the top */
  fromY?: number
  /** how long the light takes to change, ms */
  dur?: number
}

export type Proto = {
  go: (route: Route, options?: GoOptions) => void
  /** a light that travels from `fromY` to the top once, without changing the screen */
  burst: (color: string, alpha: number, fromY: number, dur: number) => void
  /** 0..1: how far the bottom light has grown (the swipe drives it) */
  bottom: MotionValue<number>
}

export const ProtoContext = createContext<Proto | null>(null)
export function useProto() {
  const p = useContext(ProtoContext)
  if (!p) throw new Error("useProto outside the prototype root")
  return p
}

/** the vertical middle of an element on screen: where a tapped row gives birth to the light */
export function midY(el: Element) {
  const r = el.getBoundingClientRect()
  return r.top + r.height / 2
}

/* ------------------------------------------------------------------------------------- logos */

/** a network's own logo in a circle; `ring` draws the 2 px ring of its light around it (the header mark) */
export function NetMark({ net, size = 24, ring = false, className }: { net: Net; size?: number; ring?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 overflow-hidden rounded-full", className)}
      style={{
        width: size,
        height: size,
        boxShadow: ring ? `0 0 0 2px var(--bg), 0 0 0 4px ${net.light}` : undefined,
      }}
    >
      <RoundMark mark={net.mark} size={size} base={net.id === "base-sepolia"} />
    </span>
  )
}

/** a coin's logo; away from its home chain it carries the network's badge, as the app does */
export function CoinMark({ coin, net, size = 40, cut = "var(--grouped)" }: { coin: Coin; net?: Net | null; size?: number; cut?: string }) {
  const M = coin.mark
  const badge = Math.max(16, Math.round(size * 0.4))
  return (
    <span aria-hidden="true" className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span className="block size-full overflow-hidden rounded-full bg-[var(--tint)]">
        <M variant="background" size={size} />
      </span>
      {net && net.id !== coin.home ? (
        <span
          className="absolute overflow-hidden rounded-full"
          style={{
            width: badge,
            height: badge,
            right: -2,
            bottom: -2,
            boxShadow: `0 0 0 2px ${cut}`,
          }}
        >
          <RoundMark mark={net.mark} size={badge} base={net.id === "base-sepolia"} />
        </span>
      ) : null}
    </span>
  )
}

/* ----------------------------------------------------------------------------------- amounts */

const group = new Intl.NumberFormat("ru-RU")

/** base units → whole part with digit groups and up to `max` decimals, zeros trimmed (cut, never rounded up) */
export function coinParts(amount: bigint, decimals: number, max = 4) {
  const [w, f = ""] = fromUnits(amount, decimals).split(".")
  return {
    whole: group.format(BigInt(w)),
    frac: f.slice(0, max).replace(/0+$/, ""),
  }
}
export function coinText(amount: bigint, decimals: number, max = 4) {
  const { whole, frac } = coinParts(amount, decimals, max)
  return whole + (frac ? "," + frac : "")
}

/** zeros between the comma and the first significant digit are quiet: 0,0005 reads as 5 */
function Fraction({ frac }: { frac: string }) {
  const lead = frac.match(/^0*/)?.[0] ?? ""
  return (
    <>
      ,{lead ? <span className="c-2">{lead}</span> : null}
      {frac.slice(lead.length)}
    </>
  )
}

/** a coin amount split at the comma, for a column; a zero balance is quiet as a whole */
export function CoinAmount({ amount, decimals, className, style }: { amount: bigint; decimals: number; className?: string; style?: CSSProperties }) {
  const { whole, frac } = coinParts(amount, decimals)
  return (
    <span className={cn("al-amt", amount === 0n && "c-2", className)} style={style} aria-label={whole + (frac ? "," + frac : "")}>
      <span aria-hidden="true">{whole}</span>
      <span aria-hidden="true">{frac ? <Fraction frac={frac} /> : null}</span>
    </span>
  )
}

/** dollars split at the comma: "400" | ",90 $". Always two decimals, so a right-aligned column of them stands by the comma too */
export function usdParts(value: number) {
  const text = formatUsd(value)
  const i = text.indexOf(",")
  return i < 0 ? { whole: text, frac: "" } : { whole: text.slice(0, i), frac: text.slice(i) }
}
export function UsdAmount({ value, className }: { value: number; className?: string }) {
  const { whole, frac } = usdParts(value)
  return (
    <span className={cn("al-amt [--al-frac:auto]", className)} aria-label={whole + frac}>
      <span aria-hidden="true">{whole}</span>
      <span aria-hidden="true">{frac}</span>
    </span>
  )
}

/** the large figure of a screen: whole part loud, the fraction and the unit quieter (Monzo's pence, Uniswap's cents) */
export function BigFigure({ whole, rest, label }: { whole: string; rest: string; label: string }) {
  return (
    <p className="t-balance" style={{ fontVariantNumeric: "proportional-nums" }} aria-label={label}>
      <span aria-hidden="true">{whole}</span>
      <span aria-hidden="true" className="c-2" style={{ fontSize: 26, fontWeight: 500, letterSpacing: 0 }}>
        {rest}
      </span>
    </p>
  )
}

/** where the figures above come from: a line under the amount naming the network, or how many there are */
export function Scope({ net, children }: { net?: Net | null; children: ReactNode }) {
  return (
    <p className="t-body2 c-2 flex min-h-6 items-center justify-center gap-2.5">
      {net ? <NetMark net={net} size={16} ring /> : null}
      <span className={net ? "text-[var(--label)]" : undefined}>{children}</span>
    </p>
  )
}

export function usdOfNet(net: Net) {
  const c = coinBySymbol(net.coin)
  return (Number(net.amount) / 10 ** c.decimals) * c.usd
}
