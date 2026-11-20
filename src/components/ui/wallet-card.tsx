/**
 * Wallet Card
 *
 * Original author: sidiora-labs (21st.dev @sidiora-labs)
 * Component page: https://21st.dev/@sidiora-labs/components/wallet-card
 * License: MIT, see licenses/wallet-card.LICENSE
 *
 * Source restored from the public 21st.dev preview bundle: names, types and
 * comments are ours, behaviour, numbers and CSS unchanged.
 *
 * A crypto wallet overview card: account switcher, hideable balance with a
 * change indicator, a morphing search bar and send/deposit/swap/buy actions.
 */
import * as React from "react"
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Transition,
  type Variants,
} from "motion/react"
import {
  ArrowDownToLine,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  Copy,
  createLucideIcon,
  Eye,
  EyeOff,
  History,
  Repeat,
  Search,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

// lucide-react 1.x added a third stroke ("M6 14h2") to credit-card; the bundle
// shipped lucide-react 0.577.0, so the old two-shape glyph is kept here.
const CreditCard = createLucideIcon("credit-card", [
  ["rect", { width: "20", height: "14", x: "2", y: "5", rx: "2", key: "ynyp8z" }],
  ["line", { x1: "2", x2: "22", y1: "10", y2: "10", key: "1b3vmo" }],
])

/* -------------------------------------------------------------------------- */
/* Motion presets                                                             */
/* -------------------------------------------------------------------------- */

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1]
const PRESS_SPRING: Transition = { type: "spring", stiffness: 600, damping: 30, mass: 0.6 }
const ROLL_SPRING: Transition = { type: "spring", stiffness: 520, damping: 36, mass: 0.7 }

const BLUR_TRANSITION: Transition = { duration: 0.2, ease: "easeInOut" }
const ROLL_IN: Transition = ROLL_SPRING
const ROLL_OUT: Transition = { duration: 0.14, ease: EASE_OUT }
const BLUR_STRONG = "blur(8px)"
const BLUR_SOFT = "blur(3px)"
const CASCADE_STAGGER = 0.025

/** Per-character roll used by the "cascade" text swap; `custom` is the delay. */
const cascadeCharVariants: Variants = {
  initial: { opacity: 0, y: "105%", filter: BLUR_SOFT },
  animate: (delay: number = 0) => ({
    opacity: 1,
    y: "0%",
    filter: "blur(0px)",
    transition: { ...ROLL_SPRING, delay },
  }),
  exit: (delay: number = 0) => ({
    opacity: 0,
    y: "-105%",
    filter: BLUR_SOFT,
    transition: { duration: 0.16, ease: EASE_OUT, delay: delay * 0.5 },
  }),
}

const textSwapVariants: Record<"blur" | "roll", Variants> = {
  blur: {
    initial: { opacity: 0, scale: 0.94, filter: BLUR_STRONG },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: BLUR_TRANSITION },
    exit: { opacity: 0, scale: 0.94, filter: BLUR_STRONG, transition: BLUR_TRANSITION },
  },
  roll: {
    initial: { opacity: 0, y: "90%", filter: BLUR_SOFT },
    animate: { opacity: 1, y: "0%", filter: "blur(0px)", transition: ROLL_IN },
    exit: { opacity: 0, y: "-90%", filter: BLUR_SOFT, transition: ROLL_OUT },
  },
}

const iconSwapVariants: Record<"blur" | "roll", Variants> = {
  blur: {
    initial: { opacity: 0, scale: 0.25, filter: BLUR_STRONG },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: BLUR_TRANSITION },
    exit: { opacity: 0, scale: 0.25, filter: BLUR_STRONG, transition: BLUR_TRANSITION },
  },
  roll: {
    initial: { opacity: 0, y: 12, filter: BLUR_SOFT },
    animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: ROLL_IN },
    exit: { opacity: 0, y: -12, filter: BLUR_SOFT, transition: ROLL_OUT },
  },
}

/* -------------------------------------------------------------------------- */
/* Action swap: animated text / icon replacement                              */
/* -------------------------------------------------------------------------- */

type SwapAnimation = "blur" | "roll" | "cascade"

interface ActionSwapProps {
  /** Changing this key triggers the swap animation. */
  value: string
  children: React.ReactNode
  animation?: SwapAnimation
  className?: string
}

function ActionSwapText({ value, children, animation = "blur", className }: ActionSwapProps) {
  const reduceMotion = useReducedMotion()
  const text = typeof children === "string" ? children : null
  const cascade = animation === "cascade" && text !== null && !reduceMotion
  const variantKey = animation === "cascade" ? "roll" : animation

  return (
    <span
      className={cn(
        "relative -my-[0.08em] inline-block max-w-full whitespace-nowrap py-[0.08em] align-bottom",
        className,
      )}
      style={{ clipPath: "inset(0 -999px)", WebkitClipPath: "inset(0 -999px)" }}
    >
      {/* invisible copy keeps the box sized to the current content */}
      <span aria-hidden className="invisible inline-block whitespace-nowrap">
        {cascade
          ? text.split("").map((char, index) => (
              <span key={index} className="inline-block whitespace-pre">
                {char}
              </span>
            ))
          : children}
      </span>
      {cascade ? (
        <>
          <span className="sr-only">{text}</span>
          <AnimatePresence initial={false}>
            <motion.span
              key={`cascade-${value}`}
              aria-hidden
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute left-0 top-[0.08em] inline-block whitespace-pre"
            >
              {text.split("").map((char, index) => (
                <motion.span
                  key={index}
                  custom={index * CASCADE_STAGGER}
                  variants={cascadeCharVariants}
                  className="inline-block whitespace-pre will-change-[opacity,filter,transform]"
                >
                  {char}
                </motion.span>
              ))}
            </motion.span>
          </AnimatePresence>
        </>
      ) : (
        <AnimatePresence initial={false}>
          <motion.span
            key={`${animation}-${value}`}
            variants={textSwapVariants[variantKey]}
            initial={reduceMotion ? false : "initial"}
            animate={reduceMotion ? { opacity: 1, filter: "blur(0px)", scale: 1, y: 0 } : "animate"}
            exit={reduceMotion ? undefined : "exit"}
            className="absolute left-0 top-[0.08em] inline-block max-w-full truncate will-change-[opacity,filter,transform]"
          >
            {children}
          </motion.span>
        </AnimatePresence>
      )}
    </span>
  )
}

function ActionSwapIcon({ value, children, animation = "blur", className }: ActionSwapProps) {
  const reduceMotion = useReducedMotion()
  const variantKey = animation === "cascade" ? "roll" : animation

  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`${animation}-${value}`}
          aria-hidden
          variants={iconSwapVariants[variantKey]}
          initial={reduceMotion ? false : "initial"}
          animate={reduceMotion ? { opacity: 1, filter: "blur(0px)", scale: 1, y: 0 } : "animate"}
          exit={reduceMotion ? undefined : "exit"}
          className="col-start-1 row-start-1 inline-flex items-center justify-center will-change-[opacity,filter,transform]"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

function useMediaQuery(query: string, serverFallback = false) {
  return React.useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => serverFallback,
  )
}

/** True on devices with a real hover pointer (no hover scale on touch). */
function useHoverCapable() {
  return useMediaQuery("(hover: hover) and (pointer: fine)", true)
}

interface DismissOptions {
  /** "consume" also swallows the click that follows the outside pointerdown. */
  behavior?: "pass" | "consume"
  /** Return true for outside targets that must not dismiss. */
  ignore?: (target: Element) => boolean
  /** Dismiss on Escape. */
  escape?: boolean
}

/** Calls `onDismiss` on pointerdown outside `ref` and on Escape while `active`. */
function useDismiss(
  active: boolean,
  onDismiss: () => void,
  ref?: React.RefObject<HTMLElement | null>,
  { behavior = "pass", ignore, escape = true }: DismissOptions = {},
) {
  const onDismissRef = React.useRef(onDismiss)
  onDismissRef.current = onDismiss
  const ignoreRef = React.useRef(ignore)
  ignoreRef.current = ignore

  React.useEffect(() => {
    if (!active) return
    const onDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        !ref?.current?.contains(target) &&
        !ignoreRef.current?.(target)
      ) {
        if (behavior === "consume") {
          const swallow = (click: MouseEvent) => {
            click.preventDefault()
            click.stopPropagation()
          }
          window.addEventListener("click", swallow, { capture: true, once: true })
          window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 400)
        }
        onDismissRef.current()
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (escape && event.key === "Escape") onDismissRef.current()
    }
    document.addEventListener("pointerdown", onDown, true)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown, true)
      document.removeEventListener("keydown", onKey)
    }
  }, [active, behavior, escape, ref])
}

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

const buttonVariants = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-border bg-card text-foreground hover:border-border",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-muted/60",
  outline: "border border-border bg-transparent text-foreground hover:bg-muted/60",
} as const

const buttonSizes = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-full",
  md: "h-10 px-5 text-sm gap-2 rounded-full",
  lg: "h-12 px-6 text-base gap-2 rounded-full",
  icon: "h-8 w-8 rounded-lg",
} as const

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref" | "children"> {
  children?: React.ReactNode
  variant?: keyof typeof buttonVariants
  size?: keyof typeof buttonSizes
  /** Scale while pressed. */
  pressScale?: number
  /** Material-like ripple from the press point. */
  ripple?: boolean
}

interface Ripple {
  id: number
  x: number
  y: number
  size: number
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    pressScale = 0.93,
    ripple = false,
    className,
    children,
    onPointerDown,
    ...props
  },
  ref,
) {
  const reduceMotion = useReducedMotion()
  const canHover = useHoverCapable()
  const [ripples, setRipples] = React.useState<Ripple[]>([])
  const nextRippleId = React.useRef(0)

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (ripple && !reduceMotion) {
        const rect = event.currentTarget.getBoundingClientRect()
        const rippleSize = Math.max(rect.width, rect.height) * 2
        const id = nextRippleId.current++
        setRipples((list) => [
          ...list,
          { id, x: event.clientX - rect.left, y: event.clientY - rect.top, size: rippleSize },
        ])
      }
      onPointerDown?.(event)
    },
    [ripple, reduceMotion, onPointerDown],
  )

  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={reduceMotion ? undefined : { scale: pressScale }}
      whileHover={reduceMotion || !canHover ? undefined : { scale: 1.02 }}
      transition={PRESS_SPRING}
      onPointerDown={handlePointerDown}
      className={cn(
        "inline-flex items-center justify-center font-medium select-none",
        "transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        ripple && "relative overflow-hidden",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {ripple && !reduceMotion ? (
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <AnimatePresence>
            {ripples.map((item) => (
              <motion.span
                key={item.id}
                className="absolute rounded-full bg-current"
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.size,
                  height: item.size,
                  x: "-50%",
                  y: "-50%",
                }}
                initial={{ scale: 0.05, opacity: 0.3 }}
                animate={{ scale: 1, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.6, ease: EASE_OUT }}
                onAnimationComplete={() => setRipples((list) => list.filter((r) => r.id !== item.id))}
              />
            ))}
          </AnimatePresence>
        </span>
      ) : null}
      {children}
    </motion.button>
  )
})

/* -------------------------------------------------------------------------- */
/* Accounts                                                                   */
/* -------------------------------------------------------------------------- */

export interface WalletAccount {
  id: string
  name: string
  address: string
  /** Custom avatar; defaults to a DiceBear "glass" avatar seeded by id/address. */
  avatar?: React.ReactNode
}

function diceBearGlassUrl(seed: string) {
  return `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed)}`
}

function truncateAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

function AccountAvatar({ account, className }: { account: WalletAccount; className?: string }) {
  return account.avatar ? (
    <>{account.avatar}</>
  ) : (
    <img
      src={diceBearGlassUrl(account.id || account.address)}
      alt={account.name}
      className={cn("h-7 w-7 shrink-0 rounded-full bg-muted", className)}
    />
  )
}

const MORPH_SPRING: Transition = { type: "spring", duration: 0.5, bounce: 0.22 }

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.12 } },
}

const listItemVariants: Variants = {
  hidden: { opacity: 0, y: -6, filter: "blur(3px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
}

/** Shared row layout of the closed trigger and the open panel header. */
const triggerRowClass = "flex items-center gap-2 px-2 py-1.5 text-left"

function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = React.useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // clipboard may be unavailable (permissions, insecure context)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy address"}
      onClick={(event) => {
        event.stopPropagation()
        copy()
      }}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <ActionSwapIcon value={copied ? "check" : "copy"} animation="cascade" className="h-3.5 w-3.5">
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </ActionSwapIcon>
    </button>
  )
}

interface AccountSwitcherProps {
  accounts: WalletAccount[]
  activeAccount?: WalletAccount
  onSelect: (id: string) => void
}

/** Trigger that morphs (shared layoutId) into a listbox panel of accounts. */
function AccountSwitcher({ accounts, activeAccount, onSelect }: AccountSwitcherProps) {
  const reduceMotion = useReducedMotion() ?? false
  const layoutId = `${React.useId()}-account`
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [open, setOpen] = React.useState(false)
  // rows become interactive only after the morph has settled
  const [interactive, setInteractive] = React.useState(false)
  const close = React.useCallback(() => setOpen(false), [])

  useDismiss(open, close, rootRef)

  React.useEffect(() => {
    if (!open) {
      setInteractive(false)
      return
    }
    const timer = window.setTimeout(() => setInteractive(true), reduceMotion ? 0 : 280)
    return () => window.clearTimeout(timer)
  }, [open, reduceMotion])

  const transition: Transition = reduceMotion ? { duration: 0 } : MORPH_SPRING

  return (
    <div ref={rootRef} className="min-w-0">
      {/* invisible sizer: reserves the width of the longest account name */}
      <div aria-hidden className={cn(triggerRowClass, "pointer-events-none opacity-0")}>
        <AccountAvatar account={activeAccount ?? accounts[0]} />
        <span className="grid">
          {accounts.map((account) => (
            <span key={account.id} className="col-start-1 row-start-1 whitespace-nowrap text-sm font-medium">
              {account.name}
            </span>
          ))}
        </span>
        <ChevronDown className="h-4 w-4" />
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {open ? null : (
          <motion.button
            key="trigger"
            layoutId={layoutId}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={false}
            onClick={() => setOpen(true)}
            transition={transition}
            style={{ borderRadius: 16 }}
            className={cn(
              triggerRowClass,
              "absolute top-0 -left-2 z-20 max-w-full outline-none transition-colors hover:bg-muted/60",
            )}
          >
            {activeAccount ? (
              <>
                <AccountAvatar account={activeAccount} />
                <motion.span layout="position" className="truncate text-sm font-medium text-foreground">
                  {activeAccount.name}
                </motion.span>
                <motion.span layout="position" className="text-muted-foreground">
                  <ChevronDown className="h-4 w-4" />
                </motion.span>
              </>
            ) : null}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.div
            key="panel"
            layoutId={layoutId}
            role="listbox"
            transition={transition}
            style={{ borderRadius: 16 }}
            className="absolute top-0 -right-2 -left-2 z-30 overflow-hidden border border-border/30 bg-background backdrop-blur-md"
          >
            <button type="button" onClick={() => setOpen(false)} className={cn(triggerRowClass, "w-full outline-none")}>
              {activeAccount ? <AccountAvatar account={activeAccount} /> : null}
              <motion.span
                layout="position"
                className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
              >
                {activeAccount?.name ?? "Select account"}
              </motion.span>
              <motion.span
                layout="position"
                animate={{ rotate: 180 }}
                transition={transition}
                className="text-muted-foreground"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </button>
            <motion.ul
              initial="hidden"
              animate="show"
              variants={reduceMotion ? undefined : listVariants}
              className={cn("max-h-64 overflow-y-auto p-1.5", interactive ? "" : "pointer-events-none")}
            >
              {accounts.map((account) => {
                const selected = account.id === activeAccount?.id
                return (
                  <motion.li
                    key={account.id}
                    variants={reduceMotion ? undefined : listItemVariants}
                    className={cn(
                      "flex items-center rounded-xl pr-1 text-sm transition-colors",
                      selected
                        ? "bg-muted text-foreground"
                        : cn("text-muted-foreground", interactive && "hover:bg-muted hover:text-foreground"),
                    )}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onSelect(account.id)
                        setOpen(false)
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 text-left outline-none"
                    >
                      <AccountAvatar account={account} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{account.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {truncateAddress(account.address)}
                        </span>
                      </span>
                      {selected ? <Check className="h-4 w-4 shrink-0 text-foreground" /> : null}
                    </button>
                    <CopyButton value={account.address} />
                  </motion.li>
                )
              })}
            </motion.ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Actions, balance delta, search                                             */
/* -------------------------------------------------------------------------- */

interface WalletActionsProps {
  onSend?: () => void
  onDeposit?: () => void
  onSwap?: () => void
  onBuy?: () => void
}

function WalletActions({ onSend, onDeposit, onSwap, onBuy }: WalletActionsProps) {
  const reduceMotion = useReducedMotion()
  const actions: { key: string; label: string; icon: LucideIcon; onClick?: () => void }[] = [
    { key: "send", label: "Send", icon: ArrowUp, onClick: onSend },
    { key: "deposit", label: "Deposit", icon: ArrowDownToLine, onClick: onDeposit },
    { key: "swap", label: "Swap", icon: Repeat, onClick: onSwap },
    { key: "buy", label: "Buy", icon: CreditCard, onClick: onBuy },
  ]

  return (
    <div className="flex items-start justify-between gap-2">
      {actions.map(({ key, label, icon: Icon, onClick }) => (
        <motion.button
          key={key}
          type="button"
          onClick={onClick}
          whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          transition={PRESS_SPRING}
          className="flex flex-1 flex-col items-center gap-2 outline-none"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground">
            <Icon className="h-5 w-5" />
          </span>
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </motion.button>
      ))}
    </div>
  )
}

interface BalanceDeltaProps {
  balance: number
  /** Change shown before the balance has changed for the first time. */
  initialChange?: number
}

/** Pill with the last balance change; re-animates on every change. */
function BalanceDelta({ balance, initialChange }: BalanceDeltaProps) {
  const reduceMotion = useReducedMotion()
  const previousBalance = React.useRef(balance)
  const [delta, setDelta] = React.useState<{ id: number; amount: number } | null>(
    initialChange ? { id: 0, amount: initialChange } : null,
  )

  React.useEffect(() => {
    const amount = balance - previousBalance.current
    previousBalance.current = balance
    if (amount !== 0) setDelta({ id: Date.now(), amount })
  }, [balance])

  const positive = (delta?.amount ?? 0) > 0

  return (
    <div className="mt-2 flex h-7 items-center justify-center">
      <AnimatePresence mode="wait">
        {delta ? (
          <motion.span
            key={delta.id}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6, scale: reduceMotion ? 1 : 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -6, scale: reduceMotion ? 1 : 0.9 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
              positive
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/15 text-red-600 dark:text-red-400",
            )}
          >
            {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {positive ? "+" : "-"}$
            {Math.abs(delta.amount).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

interface SearchBarProps {
  placeholder?: string
  /** Suggestions shown under the field, filtered by the query. */
  recent?: string[]
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
}

/** Icon button that morphs (shared layoutId) into a search field with recents. */
function SearchBar({ placeholder = "Search", recent = [], onChange, onSubmit }: SearchBarProps) {
  const reduceMotion = useReducedMotion() ?? false
  const layoutId = `${React.useId()}-search`
  const rootRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  // rows become interactive only after the morph has settled
  const [interactive, setInteractive] = React.useState(false)
  const close = React.useCallback(() => setOpen(false), [])

  useDismiss(open, close, rootRef)

  React.useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  React.useEffect(() => {
    if (!open) {
      setInteractive(false)
      return
    }
    const timer = window.setTimeout(() => setInteractive(true), reduceMotion ? 0 : 260)
    return () => window.clearTimeout(timer)
  }, [open, reduceMotion])

  const morphTransition: Transition = reduceMotion ? { duration: 0 } : MORPH_SPRING
  const contentTransition: Transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring", duration: 0.5, bounce: 0 }
  const normalized = query.trim().toLowerCase()
  const results = normalized ? recent.filter((item) => item.toLowerCase().includes(normalized)) : recent

  const submit = (value: string) => {
    onSubmit?.(value)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="shrink-0">
      {open ? <div aria-hidden className="h-8 w-8" /> : null}

      <AnimatePresence initial={false} mode="popLayout">
        {open ? null : (
          <motion.button
            key="icon"
            layoutId={layoutId}
            type="button"
            aria-label="Search"
            onClick={() => setOpen(true)}
            transition={morphTransition}
            style={{ borderRadius: 12 }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.div
            key="panel"
            layoutId={layoutId}
            transition={morphTransition}
            style={{ borderRadius: 16 }}
            className="absolute top-0 -right-2 -left-2 z-40 overflow-hidden border border-border/30 bg-background backdrop-blur-md"
          >
            <div className="flex h-9 items-center gap-2 px-3">
              <motion.span layout="position" transition={contentTransition} className="shrink-0">
                <Search className="h-4 w-4 text-muted-foreground" />
              </motion.span>
              <motion.input
                ref={inputRef}
                layout="position"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  opacity: { duration: 0.15, delay: 0.12, ease: EASE_OUT },
                  layout: contentTransition,
                }}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  onChange?.(event.target.value)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && query.trim()) submit(query.trim())
                  if (event.key === "Escape") close()
                }}
                placeholder={placeholder}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="h-px bg-border/40" />
            {results.length > 0 ? (
              <motion.ul
                initial="hidden"
                animate="show"
                variants={reduceMotion ? undefined : listVariants}
                className={cn("max-h-56 overflow-y-auto p-1.5", interactive ? "" : "pointer-events-none")}
              >
                {results.map((item) => (
                  <motion.li key={item} layout="position" variants={reduceMotion ? undefined : listItemVariants}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(item)
                        onChange?.(item)
                        submit(item)
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-muted-foreground outline-none transition-colors",
                        interactive && "hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <History className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item}</span>
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            ) : (
              <motion.div layout="position" className="flex flex-col items-center gap-1 px-4 py-8 text-center">
                <Search className="h-5 w-5 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">{normalized ? "No matches" : "No recent searches"}</p>
              </motion.div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Wallet card                                                                */
/* -------------------------------------------------------------------------- */

export interface WalletCardProps {
  accounts: WalletAccount[]
  /** Controlled active account id. */
  accountId?: string
  /** Initial active account id when uncontrolled (defaults to the first account). */
  defaultAccountId?: string
  onAccountChange?: (id: string) => void
  balance: number
  /** Currency prefix in front of the formatted balance. */
  balancePrefix?: string
  /** Change shown in the delta pill before the balance changes for the first time. */
  defaultChange?: number
  defaultBalanceHidden?: boolean
  onSend?: () => void
  onDeposit?: () => void
  onSwap?: () => void
  onBuy?: () => void
  searchPlaceholder?: string
  searchRecent?: string[]
  onSearchChange?: (value: string) => void
  onSearchSubmit?: (value: string) => void
  /** Shows the pinging dot on the bell. */
  hasNotifications?: boolean
  onNotifications?: () => void
  className?: string
}

export function WalletCard({
  accounts,
  accountId,
  defaultAccountId,
  onAccountChange,
  balance,
  balancePrefix = "$",
  defaultChange,
  defaultBalanceHidden = false,
  onSend,
  onDeposit,
  onSwap,
  onBuy,
  searchPlaceholder,
  searchRecent,
  onSearchChange,
  onSearchSubmit,
  hasNotifications = false,
  onNotifications,
  className,
}: WalletCardProps) {
  const controlled = accountId !== undefined
  const [internalAccountId, setInternalAccountId] = React.useState(defaultAccountId ?? accounts[0]?.id)
  const [hidden, setHidden] = React.useState(defaultBalanceHidden)

  const formattedBalance = `${balancePrefix}${balance.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  const mask = "*".repeat(7)
  const activeId = controlled ? accountId : internalAccountId
  const activeAccount = accounts.find((account) => account.id === activeId) ?? accounts[0]

  const handleAccountChange = (id: string) => {
    if (!controlled) setInternalAccountId(id)
    onAccountChange?.(id)
  }

  return (
    <div className={cn("relative w-full max-w-xs overflow-hidden rounded-4xl border border-border p-6", className)}>
      <div className="relative flex items-center justify-between gap-2">
        <AccountSwitcher accounts={accounts} activeAccount={activeAccount} onSelect={handleAccountChange} />
        <div className="flex shrink-0 items-center gap-1">
          <SearchBar
            placeholder={searchPlaceholder}
            recent={searchRecent}
            onChange={onSearchChange}
            onSubmit={onSearchSubmit}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onNotifications}
            aria-label="Notifications"
            className="relative"
          >
            <Bell className="h-4 w-4" />
            {hasNotifications ? (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
            ) : null}
          </Button>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center text-center">
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-muted-foreground">Balance</p>
          <button
            type="button"
            onClick={() => setHidden((value) => !value)}
            aria-label={hidden ? "Show balance" : "Hide balance"}
            aria-pressed={hidden}
            className="text-muted-foreground outline-none transition-colors hover:text-foreground"
          >
            {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <ActionSwapText
          value={hidden ? "hidden" : formattedBalance}
          animation="cascade"
          className="text-3xl font-semibold text-foreground"
        >
          {hidden ? mask : formattedBalance}
        </ActionSwapText>
        {hidden ? (
          <div className="mt-2 flex h-7 items-center justify-center">
            <span className="translate-y-[3px] text-sm font-semibold text-muted-foreground leading-none tracking-[0.3em]">
              *****
            </span>
          </div>
        ) : (
          <BalanceDelta balance={balance} initialChange={defaultChange} />
        )}
      </div>

      <div className="mt-8">
        <WalletActions onSend={onSend} onDeposit={onDeposit} onSwap={onSwap} onBuy={onBuy} />
      </div>
    </div>
  )
}

export default WalletCard
