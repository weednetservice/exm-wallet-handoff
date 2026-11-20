/**
 * Swap Ticket
 *
 * Original author: Savva Sicevs (21st.dev @ssicevs / @ssychui, ssych ui)
 * Component page: https://21st.dev/@ssicevs/components/swap-ticket
 * Also: https://ssych.com/library/swap-ticket
 * License: MIT, see licenses/swap-ticket.LICENSE
 *
 * Source restored from the public 21st.dev preview bundle: names, types and
 * comments are ours, behaviour, numbers and CSS unchanged.
 */
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUpDown, ChevronDown, X, createLucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// The bundle ships lucide-react 0.503.0, whose "settings" glyph differs from lucide 1.x.
// This is the 0.503.0 icon node, so the gear renders exactly as in the original.
const Settings = createLucideIcon("settings", [
  [
    "path",
    {
      d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
      key: "1qme2f",
    },
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }],
])

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
const BUY = "var(--chart-2)"
const SELL = "var(--chart-down, #e06a6a)"
const ACCENT = "var(--chart-1)"
const PANEL = "var(--panel, var(--card))"
const RAISED = "var(--card-raised, var(--muted))"
const BORDER = "var(--border)"
const FG = "var(--foreground)"
const MUTED = "var(--muted-foreground)"

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`

const balanceOf = (t: SwapToken) =>
  t.balanceLabel ?? t.balance.toLocaleString("en-US", { maximumFractionDigits: 6 })

export interface SwapToken {
  symbol: string
  name: string
  /** CSS color of the round token badge */
  color: string
  /** price in USD, used for the pair rate and the "$" value under each amount */
  price: number
  /** wallet balance in token units, caps the pay amount */
  balance: number
  /** optional text shown instead of the formatted balance */
  balanceLabel?: string
}

export type SwapSide = "buy" | "sell"

export interface SwapOrder {
  side: SwapSide
  pay: SwapToken
  receive: SwapToken
  amount: number
}

// demo tokens: prices and balances are sample values, not market data
const DEFAULT_TOKENS: SwapToken[] = [
  { symbol: "ETH", name: "Ethereum", color: "var(--coin-eth, #627eea)", price: 3050, balance: 4.1 },
  { symbol: "BTC", name: "Bitcoin", color: "var(--coin-btc, #f7931a)", price: 64200, balance: 0.18 },
  { symbol: "USDC", name: "USD Coin", color: "var(--coin-usdc, #2775ca)", price: 1, balance: 8200 },
  { symbol: "USDT", name: "Tether", color: "var(--coin-usdt, #26a17b)", price: 1, balance: 1500 },
  { symbol: "SOL", name: "Solana", color: "var(--coin-sol, #9945ff)", price: 148, balance: 32 },
]

// token glyphs drawn inside the colored badge; unknown symbols fall back to two letters
const ICONS: Record<string, () => ReactElement> = {
  ETH: () => (
    <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="currentColor">
      <path opacity="0.9" d="M12 2 5.5 12.2 12 16l6.5-3.8L12 2Z" />
      <path opacity="0.65" d="M12 17.4l-6.5-3.8L12 22l6.5-8.4-6.5 3.8Z" />
    </svg>
  ),
  BTC: () => (
    <svg
      viewBox="0 0 24 24"
      className="h-[62%] w-[62%]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      style={{ transform: "rotate(14deg)" }}
    >
      <path d="M9 5v14M9 5h5a3 3 0 0 1 0 6H9m0 0h6a3 3 0 0 1 0 6H9M11 3v2M14 3v2M11 19v2M14 19v2" />
    </svg>
  ),
  USDC: () => (
    <svg
      viewBox="0 0 24 24"
      className="h-[64%] w-[64%]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M15 8.4c-.6-1-1.7-1.5-3-1.5-1.9 0-3.2 1-3.2 2.5 0 3.6 6.6 1.5 6.6 5.1 0 1.6-1.4 2.6-3.4 2.6-1.5 0-2.7-.6-3.3-1.7M12 4.8v2.1M12 17.1v2.1" />
      <path opacity="0.55" d="M8.2 3.4a9.2 9.2 0 1 0 7.6 0" />
    </svg>
  ),
  USDT: () => (
    <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="currentColor">
      <path d="M4 4h16v3.4h-6.1v2.1c3.6.2 6.1 1 6.1 2s-2.5 1.8-6.1 2v6.5h-3.8v-6.5c-3.6-.2-6.1-1-6.1-2s2.5-1.8 6.1-2V7.4H4V4Zm7.9 8.3c3 0 5.1-.5 5.6-1-.5-.5-2.6-1-5.6-1s-5.1.5-5.6 1c.5.5 2.6 1 5.6 1Z" />
    </svg>
  ),
  SOL: () => (
    <svg viewBox="0 0 24 24" className="h-[54%] w-[54%]" fill="currentColor">
      <path opacity="0.95" d="M6.8 4.5h11.4l-2.6 2.8H4.2l2.6-2.8Z" />
      <path opacity="0.75" d="M4.2 10.6h11.4l2.6 2.8H6.8l-2.6-2.8Z" />
      <path opacity="0.95" d="M6.8 16.7h11.4l-2.6 2.8H4.2l2.6-2.8Z" />
    </svg>
  ),
}

function AssetIcon({ symbol, color, size = 32 }: { symbol: string; color: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{ width: size, height: size, background: color, color: "#fff", fontSize: Math.round(size * 0.32) }}
    >
      {ICONS[symbol.toUpperCase()]?.() ?? symbol.slice(0, 2)}
    </span>
  )
}

interface AmountCardProps {
  side: "Pay" | "Receive"
  value: string
  /** omitted on the receive side, which makes the input read-only */
  onChange?: (value: string) => void
  asset: SwapToken
  /** balance text; when set, the "Bal … Max" row is shown */
  balance?: string
  onMax?: () => void
  onPickToken?: () => void
  flush?: boolean
  trailing?: ReactNode
}

function AmountCard({ side, value, onChange, asset, balance, onMax, onPickToken, flush, trailing }: AmountCardProps) {
  const valueUsd = (parseFloat(value.replace(/,/g, "")) || 0) * asset.price
  return (
    <div
      className={cn("flex flex-col gap-2", flush ? "px-3 py-3" : "rounded-2xl border p-3.5")}
      style={flush ? undefined : { borderColor: BORDER, background: "var(--card)" }}
    >
      <div className="flex items-center justify-between text-[11px]" style={{ color: MUTED }}>
        <span>You {side.toLowerCase()}</span>
        <span className="flex items-center gap-1.5">
          {balance && (
            <span className="flex items-center gap-1.5 tabular-nums">
              Bal {balance}
              <button
                type="button"
                onClick={onMax}
                className="rounded px-1 py-0.5 text-[10px] font-semibold"
                style={{ color: ACCENT }}
              >
                Max
              </button>
            </span>
          )}
          {trailing}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => {
            const next = e.target.value
            // digits with at most one decimal point
            if (/^\d*\.?\d*$/.test(next)) onChange?.(next)
          }}
          readOnly={!onChange}
          placeholder="0"
          inputMode="decimal"
          aria-label={`Amount to ${side.toLowerCase()}`}
          className="w-full min-w-0 bg-transparent text-[26px] font-medium tabular-nums outline-none"
          style={{ color: value ? FG : MUTED, caretColor: ACCENT }}
        />
        <button
          type="button"
          onClick={onPickToken}
          className="flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 transition-opacity hover:opacity-80"
          style={{ borderColor: BORDER, background: RAISED }}
          aria-haspopup="listbox"
        >
          <AssetIcon symbol={asset.symbol} color={asset.color} size={22} />
          <span className="text-[13px] font-semibold" style={{ color: FG }}>
            {asset.symbol}
          </span>
          <ChevronDown size={12} />
        </button>
      </div>
      <span className="text-[11px] tabular-nums" style={{ color: MUTED }}>
        {usd(valueUsd)}
      </span>
    </div>
  )
}

export interface SwapTicketProps {
  title?: string
  /** tokens offered in the picker; the first is paid and the third received by default */
  tokens?: SwapToken[]
  /** initial pay token symbol (falls back to tokens[0]) */
  paySymbol?: string
  /** initial receive token symbol (falls back to tokens[2], tokens[1], tokens[0]) */
  receiveSymbol?: string
  /** initial pay amount as typed text */
  defaultAmount?: string
  /** content of the slippage chip on the rate row */
  slippage?: ReactNode
  /** called on submit; afterwards the ticket flips the pair and toggles buy/sell */
  onSubmit?: (order: SwapOrder) => void
  /** called on mount and whenever the pay or receive token changes */
  onPairChange?: (pair: { pay: SwapToken; receive: SwapToken }) => void
  /** borderless variant for embedding in a panel: no title row, cards joined by a divider */
  flush?: boolean
  className?: string
}

export function SwapTicket({
  title = "Trade",
  tokens = DEFAULT_TOKENS,
  paySymbol,
  receiveSymbol,
  defaultAmount = "1.2",
  slippage = "Auto · 0.5%",
  onSubmit,
  onPairChange,
  flush = false,
  className,
}: SwapTicketProps) {
  const reduceMotion = useReducedMotion()
  const find = (symbol: string | undefined, fallback: SwapToken) => tokens.find((t) => t.symbol === symbol) ?? fallback
  const [pay, setPay] = useState(() => find(paySymbol, tokens[0]))
  const [receive, setReceive] = useState(() => find(receiveSymbol, tokens[2] ?? tokens[1] ?? tokens[0]))
  const [amount, setAmount] = useState(defaultAmount)
  const [picking, setPicking] = useState<"pay" | "receive" | null>(null)
  const [side, setSide] = useState<SwapSide>("buy")

  useEffect(() => {
    onPairChange?.({ pay, receive })
  }, [pay, receive])

  const rate = pay.price / receive.price
  const receiveAmount = useMemo(() => {
    const n = parseFloat(amount) || 0
    return n ? (n * rate).toLocaleString("en-US", { maximumFractionDigits: rate >= 100 ? 0 : 4 }) : ""
  }, [amount, rate])

  const payAmount = parseFloat(amount) || 0
  const insufficient = payAmount > pay.balance
  const empty = payAmount === 0
  const canSubmit = !empty && !insufficient

  // swap the two sides; the received amount becomes the new pay amount
  const flip = () => {
    const n = parseFloat(receiveAmount.replace(/,/g, "")) || 0
    setPay(receive)
    setReceive(pay)
    setAmount(n ? String(Number(n.toFixed(6))) : "")
  }

  // picking the token already on the other side swaps the sides
  const pick = (t: SwapToken) => {
    if (picking === "pay") {
      if (t.symbol === receive.symbol) setReceive(pay)
      setPay(t)
    } else if (picking === "receive") {
      if (t.symbol === pay.symbol) setPay(receive)
      setReceive(t)
    }
    setPicking(null)
  }

  const settings = (
    <button
      type="button"
      className={cn("grid place-items-center rounded-lg", flush ? "h-5 w-5" : "h-7 w-7")}
      style={{ color: MUTED }}
      aria-label="Settings"
    >
      <Settings size={flush ? 13 : 15} />
    </button>
  )

  return (
    <div className={cn("relative flex w-[320px] flex-col", className)}>
      {!flush && (
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[14px] font-semibold" style={{ color: FG }}>
            {title}
          </span>
          {settings}
        </div>
      )}

      <div className={cn("relative flex flex-col", flush ? "gap-0" : "gap-1")}>
        <motion.div
          key={pay.symbol + "-pay"}
          layout
          layoutId={`swap-card-${pay.symbol}`}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        >
          <AmountCard
            side="Pay"
            value={amount}
            onChange={setAmount}
            asset={pay}
            balance={`${balanceOf(pay)} ${pay.symbol}`}
            onMax={() => setAmount(String(pay.balance))}
            onPickToken={() => setPicking("pay")}
            flush={flush}
            trailing={flush ? settings : undefined}
          />
        </motion.div>
        <button
          type="button"
          onClick={flip}
          className="absolute left-1/2 top-1/2 z-10 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border transition-transform duration-[400ms] hover:rotate-180"
          style={{ borderColor: BORDER, background: RAISED, color: FG }}
          aria-label="Flip pair"
        >
          <ArrowUpDown size={16} />
        </button>
        <motion.div
          key={receive.symbol + "-recv"}
          layout
          layoutId={`swap-card-${receive.symbol}`}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className={flush ? "border-t" : undefined}
          style={flush ? { borderColor: BORDER } : undefined}
        >
          <AmountCard
            side="Receive"
            value={receiveAmount}
            asset={receive}
            onPickToken={() => setPicking("receive")}
            flush={flush}
          />
        </motion.div>
      </div>

      <div
        className={cn("flex items-center justify-between py-2.5 text-[11px]", flush ? "px-3" : "px-1.5")}
        style={{ color: MUTED }}
      >
        <span className="tabular-nums">
          1 {pay.symbol} = {rate.toLocaleString("en-US", { maximumFractionDigits: rate >= 100 ? 0 : 5 })}{" "}
          {receive.symbol}
        </span>
        <span
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums"
          style={{ background: "color-mix(in srgb, var(--foreground) 6%, transparent)" }}
        >
          {slippage}
        </span>
      </div>

      <motion.button
        type="button"
        disabled={!canSubmit}
        onClick={() => {
          onSubmit?.({ side, pay, receive, amount: payAmount })
          flip()
          setSide((s) => (s === "buy" ? "sell" : "buy"))
        }}
        aria-pressed={side === "sell"}
        whileHover={canSubmit && !reduceMotion ? { scale: 1.02, y: -1 } : undefined}
        whileTap={canSubmit && !reduceMotion ? { scale: 0.965, y: 0 } : undefined}
        transition={{ duration: 0.2, ease: EASE }}
        className={cn(
          "group relative h-14 rounded-xl text-[15px] font-bold transition-[filter,opacity,background-color] duration-200 enabled:cursor-pointer enabled:hover:brightness-[1.07] enabled:active:brightness-[0.93] disabled:cursor-not-allowed",
          flush && "mx-3 mb-3",
        )}
        style={{
          background: canSubmit ? (side === "buy" ? BUY : SELL) : RAISED,
          color: canSubmit
            ? side === "buy"
              ? "var(--on-accent, var(--background))"
              : "var(--on-danger, var(--background))"
            : MUTED,
        }}
      >
        {canSubmit && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-active:opacity-100"
            style={{ boxShadow: `0 6px 24px -6px color-mix(in srgb, ${side === "buy" ? BUY : SELL} 55%, transparent)` }}
          />
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={empty ? "empty" : insufficient ? "insufficient" : side}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: reduceMotion ? 0 : 0.14, ease: EASE }}
            className="relative block"
          >
            {empty ? "Enter an amount" : insufficient ? `Insufficient ${pay.symbol} balance` : side === "buy" ? "Buy" : "Sell"}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* token picker, laid over the whole ticket */}
      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={cn("absolute z-20 flex flex-col p-3", flush ? "inset-0" : "-inset-1 rounded-xl border")}
            style={{ borderColor: BORDER, background: PANEL }}
            role="listbox"
            aria-label="Choose a token"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[13px] font-semibold" style={{ color: FG }}>
                {picking === "pay" ? "You pay" : "You receive"}
              </span>
              <button
                type="button"
                onClick={() => setPicking(null)}
                className="grid h-7 w-7 place-items-center rounded-lg"
                style={{ color: MUTED }}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-0.5 overflow-y-auto">
              {tokens.map((t) => {
                const selected = (picking === "pay" ? pay : receive).symbol === t.symbol
                return (
                  <button
                    key={t.symbol}
                    type="button"
                    onClick={() => pick(t)}
                    role="option"
                    aria-selected={selected}
                    className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors"
                    style={{
                      background: selected ? "color-mix(in srgb, var(--foreground) 6%, transparent)" : "transparent",
                    }}
                  >
                    <AssetIcon symbol={t.symbol} color={t.color} size={26} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-semibold" style={{ color: FG }}>
                        {t.symbol}
                      </span>
                      <span className="truncate text-[11px]" style={{ color: MUTED }}>
                        {t.name}
                      </span>
                    </span>
                    <span className="text-[11px] tabular-nums" style={{ color: MUTED }}>
                      {balanceOf(t)} {t.symbol}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
