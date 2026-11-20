/**
 * Prediction Market (order ticket)
 *
 * Original author: larsen66 (21st.dev @larsen66), component "be-ui-prediction-market"
 * Original bundle: https://cdn.21st.dev/larsen66/be-ui-prediction-market/default/bundle.1782396827088.html
 * License: the 21st.dev page is gone (404), no public license found. Used with the
 * author's permission, reported by the project owner on 2026-11-14.
 * See licenses/prediction-market.LICENSE.
 *
 * Source restored from the public 21st.dev preview bundle: names, types and
 * comments are ours, behaviour, numbers and CSS unchanged.
 *
 * Buy/Sell ticket for one binary market: pick an outcome (price in dollars per
 * share, shown in cents), type an amount or tap a quick chip, see the payout,
 * press Trade. The ticket holds no market data of its own: question, volume and
 * price history live outside it, feed `outcomes`, `balance` and `positions`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { AnimatePresence, animate, motion, useReducedMotion, type HTMLMotionProps } from "motion/react"
import { Banknote, ChevronDown, CircleAlert, LoaderCircle, createLucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// The bundle ships lucide-react 0.503.0, whose "circle-check" glyph differs from lucide 1.x
// (1.x draws "m16 9-5.5 5.5L8 12"). This is the 0.503.0 icon node, as in the original.
const CircleCheck = createLucideIcon("circle-check", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }],
])

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
const PRESS_SPRING = { type: "spring", stiffness: 500, damping: 30, mass: 0.6 } as const
const INDICATOR_SPRING = { type: "spring", stiffness: 360, damping: 32, mass: 0.6 } as const

/* ------------------------------------------------------------------------------------------------
 * StatefulButton: a button whose label and icon swap with a blur slide per state
 * ----------------------------------------------------------------------------------------------*/

export type StatefulButtonState = "idle" | "loading" | "success" | "error"

export interface StatefulButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  state?: StatefulButtonState
  variant?: "primary" | "secondary" | "ghost" | "outline"
  size?: "sm" | "md" | "lg" | "icon"
  /** scale while pressed (skipped under reduced motion or when disabled) */
  pressScale?: number
  loadingText?: ReactNode
  successText?: ReactNode
  errorText?: ReactNode
  children?: ReactNode
}

export function StatefulButton({
  state = "idle",
  variant = "primary",
  size = "md",
  pressScale = 0.96,
  loadingText = "Loading",
  successText = "Success",
  errorText = "Error",
  className,
  children,
  disabled,
  ...props
}: StatefulButtonProps) {
  const reduce = useReducedMotion()
  const label =
    state === "loading" ? loadingText : state === "success" ? successText : state === "error" ? errorText : children
  const Icon =
    state === "loading" ? LoaderCircle : state === "success" ? CircleCheck : state === "error" ? CircleAlert : null

  return (
    <motion.button
      type="button"
      whileTap={reduce || disabled ? undefined : { scale: pressScale }}
      transition={PRESS_SPRING}
      disabled={disabled || state === "loading"}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "secondary" && "border border-border bg-card text-foreground hover:bg-card/70",
        variant === "ghost" && "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
        variant === "outline" && "border border-border bg-transparent text-foreground hover:bg-primary/5",
        size === "sm" && "h-8 rounded-full px-3 text-xs",
        size === "md" && "h-10 rounded-full px-5 text-sm",
        size === "lg" && "h-12 rounded-full px-6 text-base",
        size === "icon" && "h-8 w-8 rounded-lg",
        className,
      )}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {Icon ? (
          <motion.span
            key={state}
            initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            transition={{ duration: 0.18, ease: EASE }}
            className="inline-flex items-center justify-center"
          >
            <Icon className={cn("h-4 w-4", state === "loading" && "animate-spin")} />
          </motion.span>
        ) : null}
      </AnimatePresence>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(label)}
          initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          transition={{ duration: 0.18, ease: EASE }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}

/* ------------------------------------------------------------------------------------------------
 * NumberTicker: re-mounts on every new value and slides it up into place
 * ----------------------------------------------------------------------------------------------*/

export interface NumberTickerProps {
  value: number
  /** seconds */
  duration?: number
  className?: string
  format?: (value: number) => ReactNode
  /** passed by the original call site, not read by this build of the ticker */
  startOnView?: boolean
  /** passed by the original call site, not read by this build of the ticker */
  stagger?: number
  /** passed by the original call site, not read by this build of the ticker */
  blur?: boolean
}

export function NumberTicker({
  value,
  duration = 0.35,
  className,
  format = (n) => n.toLocaleString(),
}: NumberTickerProps) {
  const reduce = useReducedMotion()
  return (
    <motion.span
      key={value}
      initial={reduce ? { opacity: 1 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, ease: EASE }}
      className={cn("inline-flex", className)}
    >
      {format(value)}
    </motion.span>
  )
}

/* ------------------------------------------------------------------------------------------------
 * Tabs: controlled segmented control with a shared sliding indicator
 * ----------------------------------------------------------------------------------------------*/

interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
  variant: "pill" | "underline"
  layoutId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

export interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  variant?: "pill" | "underline"
  className?: string
  children?: ReactNode
}

export function Tabs({ value, onValueChange, variant = "pill", className, children }: TabsProps) {
  const layoutId = useId()
  return (
    <TabsContext.Provider value={{ value, onValueChange, variant, layoutId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn("relative flex items-center rounded-full bg-muted p-1", className)}>{children}</div>
}

export interface TabsTriggerProps {
  value: string
  className?: string
  indicatorClassName?: string
  children?: ReactNode
}

export function TabsTrigger({ value, className, indicatorClassName, children }: TabsTriggerProps) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error("TabsTrigger must be used inside Tabs")
  const active = ctx.value === value

  return (
    <button
      type="button"
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "relative isolate inline-flex items-center justify-center rounded-full outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {active ? (
        <motion.span
          layoutId={`${ctx.layoutId}-indicator`}
          className={cn(
            "absolute -z-10",
            ctx.variant === "underline"
              ? "bottom-0 left-0 right-0 h-0.5 rounded-full bg-foreground"
              : "inset-0 rounded-[inherit] bg-background",
            indicatorClassName,
          )}
          transition={INDICATOR_SPRING}
        />
      ) : null}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------------------------------------
 * Data shapes
 * ----------------------------------------------------------------------------------------------*/

export type TradeMode = "buy" | "sell"

/** One side of a binary market. */
export interface PredictionOutcome {
  /** key into `positions`, also the value of `order.outcomeId` */
  id: string
  /** "Yes"/"No" or "Up"/"Down"; a label of "no" or "down" (any case) gets the red styling */
  label: string
  /** price of one share in dollars, 0..1 (0.167 renders as "16.7¢"); clamped to 0.01..0.99 for quotes */
  price: number
}

/** The ticket's editable state. `amount` is the raw input text: dollars when buying, shares when selling. */
export interface PredictionOrder {
  mode: TradeMode
  outcomeId: string
  amount: string
}

/** What the ticket computes for the current order. */
export interface PredictionQuote {
  valid: boolean
  /** parsed `order.amount` */
  amount: number
  /** clamped outcome price */
  price: number
  /** buy: amount / price; sell: the amount itself */
  shares: number
  /** buy: shares paid out at $1 if the outcome wins; sell: amount * price received now */
  payout: number
  error?: string
}

export interface PredictionMarketClassNames {
  root?: string
  header?: string
  tabs?: string
  outcomes?: string
  amount?: string
  chips?: string
  footer?: string
  action?: string
}

export interface PredictionMarketProps {
  outcomes?: PredictionOutcome[]
  /** controlled order */
  value?: PredictionOrder
  /** initial order when uncontrolled; missing fields fall back to buy / first outcome / "" */
  defaultValue?: Partial<PredictionOrder>
  onValueChange?: (order: PredictionOrder) => void
  /** called 650 ms after Trade is pressed with a valid quote (the ticket shows "Trading", then "Trade filled") */
  onTrade?: (order: PredictionOrder, quote: PredictionQuote) => void
  /** called by the "Connect" button when `authenticated` is false */
  onSignIn?: () => void
  authenticated?: boolean
  /** text of the order type button in the header (the original wires no menu to it) */
  orderTypeLabel?: ReactNode
  /** cash in dollars; buys above it fail with "Insufficient balance", Max sets it (floored) */
  balance?: number
  /** shares held per outcome id; sells above it fail with "Not enough shares", Max sets it */
  positions?: Record<string, number>
  /** quick "+" chips: dollars when buying, shares when selling */
  quickAmounts?: number[]
  /** smallest buy in dollars */
  minTrade?: number
  className?: string
  classNames?: PredictionMarketClassNames
}

const DEFAULT_OUTCOMES: PredictionOutcome[] = [
  { id: "up", label: "Up", price: 0.09 },
  { id: "down", label: "Down", price: 0.91 },
]

const MODES: { id: TradeMode; label: string }[] = [
  { id: "buy", label: "Buy" },
  { id: "sell", label: "Sell" },
]

const DEFAULT_QUICK_AMOUNTS = [10, 50, 100, 500]

const DIGIT_TRANSITION = { duration: 0.18, ease: EASE }

type TradeStatus = "idle" | "placing" | "filled"

/* ------------------------------------------------------------------------------------------------
 * Helpers
 * ----------------------------------------------------------------------------------------------*/

function useControllableOrder({
  value,
  defaultValue,
  outcomes,
  onValueChange,
}: {
  value?: PredictionOrder
  defaultValue?: Partial<PredictionOrder>
  outcomes: PredictionOutcome[]
  onValueChange?: (order: PredictionOrder) => void
}): [PredictionOrder, (order: PredictionOrder) => void] {
  const initial: PredictionOrder = {
    mode: defaultValue?.mode ?? "buy",
    outcomeId: defaultValue?.outcomeId ?? outcomes[0]?.id ?? "",
    amount: defaultValue?.amount ?? "",
  }
  const [internal, setInternal] = useState(initial)
  const controlled = value !== undefined
  const order = value ?? internal

  const setOrder = useCallback(
    (next: PredictionOrder) => {
      if (!controlled) setInternal(next)
      onValueChange?.(next)
    },
    [controlled, onValueChange],
  )

  return [order, setOrder]
}

/** keeps digits and one dot, at most two decimals */
export function sanitizeAmount(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "")
  const [whole, ...rest] = cleaned.split(".")
  const decimals = rest.join("")
  return rest.length === 0 ? whole : `${whole}.${decimals.slice(0, 2)}`
}

function parseAmount(amount: string) {
  return Number(amount) || 0
}

export function formatCurrency(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value)
}

export function formatCompactCurrency(value: number) {
  return value >= 100 ? formatCurrency(value, 0) : formatCurrency(value, value % 1 === 0 ? 0 : 2)
}

/** 0.167 -> "16.7¢", 0.09 -> "9¢" */
export function formatCents(price: number) {
  const cents = price * 100
  const digits = Number.isInteger(cents) ? 0 : 1
  return `${cents.toFixed(digits)}¢`
}

export function buildQuote({
  order,
  outcome,
  balance,
  position,
  minTrade,
}: {
  order: PredictionOrder
  outcome: PredictionOutcome
  balance: number
  position: number
  minTrade: number
}): PredictionQuote {
  const amount = parseAmount(order.amount)
  const price = Math.max(0.01, Math.min(0.99, outcome.price))
  const shares = order.mode === "buy" ? amount / price : amount
  const payout = order.mode === "buy" ? shares : amount * price

  if (amount <= 0) return { valid: false, amount, price, shares: 0, payout: 0, error: "Enter an amount" }
  if (order.mode === "buy" && amount < minTrade)
    return { valid: false, amount, price, shares, payout, error: `Minimum ${formatCompactCurrency(minTrade)}` }
  if (order.mode === "buy" && amount > balance)
    return { valid: false, amount, price, shares, payout, error: "Insufficient balance" }
  if (order.mode === "sell" && amount > position)
    return { valid: false, amount, price, shares, payout, error: "Not enough shares" }
  return { valid: true, amount, price, shares, payout }
}

/** stable keys per character ("1-0", "1-1", "5-0") so only changed digits animate */
function keyedAmountChars(text: string) {
  const seen = new Map<string, number>()
  return text.split("").map((char) => {
    const count = seen.get(char) ?? 0
    seen.set(char, count + 1)
    return { id: `${char}-${count}`, char }
  })
}

function amountInputSize(amount: string) {
  const digits = amount.replace(/\D/g, "").length
  return digits >= 10
    ? "text-3xl sm:text-4xl"
    : digits >= 8
      ? "text-4xl sm:text-5xl"
      : digits >= 6
        ? "text-[44px] sm:text-[56px]"
        : "text-5xl sm:text-6xl"
}

function payoutTickerSize(payout: number) {
  const length = formatCurrency(payout).length
  return length >= 16 ? "text-xl sm:text-2xl" : length >= 13 ? "text-2xl" : length >= 10 ? "text-3xl" : "text-4xl"
}

/* ------------------------------------------------------------------------------------------------
 * AnimatedAmountInput: a transparent input over per-character animated digits
 * ----------------------------------------------------------------------------------------------*/

interface AnimatedAmountInputProps {
  id: string
  value: string
  mode: TradeMode
  inputSize: string
  disabled?: boolean
  reduce: boolean
  onChange: (value: string) => void
}

function AnimatedAmountInput({ id, value, mode, inputSize, disabled, reduce, onChange }: AnimatedAmountInputProps) {
  const chars = keyedAmountChars(value || "0")
  const style = { "--amount-chars": String(chars.length) } as CSSProperties
  const label = mode === "buy" ? "Amount" : "Shares"

  return (
    <div className="flex min-w-0 items-center justify-center overflow-hidden">
      {mode === "buy" ? (
        <span
          aria-hidden
          className={cn(
            "shrink-0 font-semibold leading-none tracking-normal text-muted-foreground/65 tabular-nums transition-[font-size] duration-200",
            inputSize,
          )}
        >
          $
        </span>
      ) : null}
      <div className="relative min-w-0 shrink">
        <input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(sanitizeAmount(event.target.value))}
          placeholder="0"
          inputMode="decimal"
          aria-label={label}
          autoComplete="off"
          className={cn(
            "w-[calc((var(--amount-chars)+1)*0.62em)] min-w-[0.8em] max-w-[260px] bg-transparent text-left font-semibold leading-none tracking-normal text-transparent outline-none tabular-nums",
            "caret-foreground transition-[font-size] duration-200 placeholder:text-transparent selection:bg-foreground/10 disabled:cursor-not-allowed",
            inputSize,
          )}
          style={style}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex min-w-0 items-center justify-start overflow-hidden font-semibold leading-none tracking-normal text-foreground tabular-nums transition-[font-size] duration-200",
            !value && "text-muted-foreground/55",
            inputSize,
          )}
          style={style}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {chars.map(({ id: charId, char }) => (
              <motion.span
                key={charId}
                layout={reduce ? false : "position"}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, filter: "blur(10px)" }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14, filter: "blur(10px)" }}
                transition={DIGIT_TRANSITION}
                className="inline-block min-w-[0.55em] text-center will-change-[transform,opacity,filter]"
              >
                {char}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * PredictionMarket
 * ----------------------------------------------------------------------------------------------*/

export function PredictionMarket({
  outcomes = DEFAULT_OUTCOMES,
  value,
  defaultValue,
  onValueChange,
  onTrade,
  onSignIn,
  authenticated = true,
  orderTypeLabel = "Market",
  balance = 500,
  positions = { up: 24, down: 16 },
  quickAmounts = DEFAULT_QUICK_AMOUNTS,
  minTrade = 1,
  className,
  classNames,
}: PredictionMarketProps) {
  const inputId = useId()
  const reduce = useReducedMotion() ?? false
  const amountRef = useRef<HTMLDivElement>(null)
  const fillTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<TradeStatus>("idle")
  const [shakeCount, setShakeCount] = useState(0)
  const [order, setOrder] = useControllableOrder({ value, defaultValue, outcomes, onValueChange })

  const outcome = outcomes.find((o) => o.id === order.outcomeId) ?? outcomes[0]
  const position = positions[outcome.id] ?? 0
  const quote = useMemo(
    () => buildQuote({ order, outcome, balance, position, minTrade }),
    [balance, minTrade, order, position, outcome],
  )

  const updateOrder = useCallback(
    (patch: Partial<PredictionOrder>) => {
      if (fillTimer.current) {
        clearTimeout(fillTimer.current)
        fillTimer.current = null
      }
      setStatus("idle")
      setOrder({ ...order, ...patch })
    },
    [order, setOrder],
  )

  useEffect(
    () => () => {
      if (fillTimer.current) clearTimeout(fillTimer.current)
    },
    [],
  )

  // invalid Trade press: shake the amount card
  useEffect(() => {
    if (shakeCount === 0 || reduce || !amountRef.current) return
    animate(amountRef.current, { x: [0, -5, 5, -3, 3, -1, 0] }, { duration: 0.38, ease: EASE })
  }, [reduce, shakeCount])

  const addAmount = (delta: number) => {
    const next = parseAmount(order.amount) + delta
    updateOrder({ amount: String(next) })
  }

  const setMax = () => {
    if (order.mode === "buy") {
      updateOrder({ amount: String(Math.floor(balance)) })
      return
    }
    updateOrder({ amount: position.toFixed(position % 1 === 0 ? 0 : 2) })
  }

  const submit = () => {
    if (!authenticated) {
      onSignIn?.()
      return
    }
    if (!quote.valid) {
      setShakeCount((n) => n + 1)
      return
    }
    setStatus("placing")
    fillTimer.current = setTimeout(() => {
      setStatus("filled")
      onTrade?.(order, quote)
    }, 650)
  }

  const inputSize = amountInputSize(order.amount)
  const payoutSize = payoutTickerSize(quote.payout)
  const buttonState: StatefulButtonState =
    status === "placing" ? "loading" : status === "filled" ? "success" : quote.valid ? "idle" : "error"

  return (
    <div
      className={cn(
        "w-full max-w-[400px] overflow-hidden rounded-3xl border border-border bg-background",
        className,
        classNames?.root,
      )}
    >
      <div className={cn("border-b border-border/80 px-4 pt-4", classNames?.header)}>
        <div className="flex items-end justify-between gap-4">
          <Tabs
            value={order.mode}
            onValueChange={(mode) => updateOrder({ mode: mode as TradeMode, amount: "" })}
            variant="underline"
            className={cn("shrink-0", classNames?.tabs)}
          >
            <TabsList className="gap-5 border-b-0 bg-transparent p-0">
              {MODES.map((m) => (
                <TabsTrigger
                  key={m.id}
                  value={m.id}
                  className="px-0 pb-3 pt-0 text-2xl font-semibold"
                  indicatorClassName="h-0.5 bg-foreground"
                >
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {/* Order type: the original renders this button with no handler (no menu behind it). */}
          <button
            type="button"
            disabled={status === "placing"}
            className="mb-3 inline-flex items-center gap-2 text-xl font-semibold text-foreground transition-opacity disabled:opacity-50"
          >
            {orderTypeLabel}
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="space-y-4 p-3">
        <Tabs
          value={outcome.id}
          onValueChange={(outcomeId) => updateOrder({ outcomeId })}
          variant="pill"
          className={classNames?.outcomes}
        >
          <TabsList className="grid w-full grid-cols-2 gap-2 p-1.5">
            {outcomes.map((o) => {
              const active = o.id === outcome.id
              const negative = o.label.toLowerCase() === "no" || o.label.toLowerCase() === "down"
              return (
                <TabsTrigger
                  key={o.id}
                  value={o.id}
                  indicatorClassName={negative ? "bg-red-500/10 dark:bg-red-500/15" : "bg-emerald-500/20"}
                  className={cn(
                    "h-14 w-full rounded-[1.35rem] px-0 py-0 text-base font-semibold active:scale-[0.99]",
                    negative
                      ? active
                        ? "text-red-300 dark:text-red-300"
                        : "text-red-300/55 dark:text-red-300/50"
                      : active
                        ? "text-emerald-400 dark:text-emerald-300"
                        : "text-muted-foreground",
                  )}
                >
                  {o.label} {formatCents(o.price)}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        <div ref={amountRef} className={cn("rounded-3xl bg-card p-4", classNames?.amount)}>
          <div className="flex min-h-24 flex-col items-center justify-center gap-5 text-center">
            <label htmlFor={inputId} className="mr-6 text-xl font-medium text-foreground">
              {order.mode === "buy" ? "Amount" : "Shares"}
            </label>
            <div className="w-full min-w-0">
              <AnimatedAmountInput
                id={inputId}
                mode={order.mode}
                value={order.amount}
                disabled={status === "placing"}
                inputSize={inputSize}
                reduce={reduce}
                onChange={(amount) => updateOrder({ amount })}
              />
            </div>
          </div>
          <div className={cn("mt-8 flex flex-wrap justify-center gap-2", classNames?.chips)}>
            {quickAmounts.map((step) => (
              <button
                key={step}
                type="button"
                disabled={status === "placing"}
                onClick={() => addAmount(step)}
                className="h-9 rounded-xl bg-background px-3.5 text-sm font-semibold text-foreground transition-[background-color,transform] duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                +{order.mode === "buy" ? formatCompactCurrency(step) : step}
              </button>
            ))}
            <button
              type="button"
              disabled={status === "placing"}
              onClick={setMax}
              className="h-9 rounded-xl bg-background px-3.5 text-sm font-semibold text-foreground transition-[background-color,transform] duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              Max
            </button>
          </div>
        </div>
      </div>

      {authenticated ? (
        <div className={cn("border-t border-border/80 px-4 py-4", classNames?.footer)}>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div className="min-w-0 shrink">
              <div className="flex items-center gap-2 text-xl font-semibold text-foreground">
                {order.mode === "buy" ? "To win" : "To receive"}
                <Banknote className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Avg. Price {formatCents(quote.price)}</p>
            </div>
            <NumberTicker
              value={quote.payout * 100}
              startOnView={false}
              duration={0.45}
              stagger={0}
              blur
              className={cn(
                "ml-auto min-w-0 shrink-0 justify-end whitespace-nowrap text-right font-semibold leading-none tracking-tight text-emerald-500 tabular-nums transition-[font-size] duration-200",
                payoutSize,
              )}
              format={(cents) => formatCurrency(cents / 100)}
            />
          </div>
          <StatefulButton
            state={buttonState}
            variant="primary"
            size="lg"
            pressScale={0.98}
            onClick={submit}
            loadingText="Trading"
            successText="Trade filled"
            errorText={quote.error ?? "Enter an amount"}
            className={cn("h-12 w-full rounded-2xl text-base font-semibold", classNames?.action)}
          >
            Trade
          </StatefulButton>
        </div>
      ) : (
        <div className="px-4 pb-5">
          <StatefulButton
            state="idle"
            variant="primary"
            size="lg"
            pressScale={0.98}
            onClick={submit}
            className={cn("h-14 w-full rounded-2xl text-base font-semibold", classNames?.action)}
          >
            Connect
          </StatefulButton>
        </div>
      )}
    </div>
  )
}

export default PredictionMarket
