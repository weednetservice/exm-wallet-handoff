/**
 * Auth Drawer
 *
 * Original author: sidiora-labs (21st.dev @sidiora-labs)
 * Component page: https://21st.dev/@sidiora-labs/components/auth-drawer
 * License: MIT, see licenses/auth-drawer.LICENSE
 *
 * Source restored from the public 21st.dev preview bundle: names, types and
 * comments are ours, behaviour, numbers and CSS unchanged.
 *
 * A bottom sheet for signing in with social providers, email or phone one-time
 * codes, passkeys and crypto wallets; the sheet height morphs between steps.
 *
 * Dependencies (bundle shipped): @base-ui/react 1.8.0 (Drawer; project has 1.9.0),
 * input-otp 1.5.0 (via ./auth-drawer/input-otp), react-use-measure 2.1.7, motion.
 */
import * as React from "react"
import { Drawer } from "@base-ui/react/drawer"
import useMeasure from "react-use-measure"
import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react"
import { ArrowRight, ChevronLeft, FingerprintPattern, Wallet, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { InputOTP, InputOTPSlot } from "@/components/ui/auth-drawer/input-otp"
import "./auth-drawer.css"

/* -------------------------------------------------------------------------- */
/* MovingBorder: a glow that travels along a rounded-rect path                */
/* -------------------------------------------------------------------------- */

interface MovingBorderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Milliseconds per lap. */
  duration?: number
  radius?: string
  /** Visible border thickness (padding around the content). */
  gap?: string
  /** Glow colour (any CSS colour). */
  color?: string
  /** Glow diameter in px. */
  size?: number
  contentClassName?: string
}

function MovingBorder({
  duration = 3000,
  radius = "1.75rem",
  gap = "1px",
  color = "var(--dx-blue-3)",
  size = 80,
  className,
  contentClassName,
  style,
  children,
  ...props
}: MovingBorderProps) {
  const pathRef = React.useRef<SVGRectElement>(null)
  const progress = useMotionValue(0)
  const reduceMotion = useReducedMotion()

  useAnimationFrame((time) => {
    if (reduceMotion) return
    const length = pathRef.current?.getTotalLength()
    if (length) progress.set(((time / duration) * length) % length)
  })

  const x = useTransform(progress, (value) => pathRef.current?.getPointAtLength(value).x ?? 0)
  const y = useTransform(progress, (value) => pathRef.current?.getPointAtLength(value).y ?? 0)
  const transform = useMotionTemplate`translate(${x}px, ${y}px) translate(-50%, -50%)`

  return (
    <div
      data-slot="moving-border"
      className={cn("relative overflow-hidden", className)}
      style={{ borderRadius: radius, padding: gap, ...style }}
      {...props}
    >
      <div aria-hidden className="absolute inset-0" style={{ borderRadius: radius }}>
        <svg className="absolute size-full" preserveAspectRatio="none" width="100%" height="100%">
          <rect ref={pathRef} fill="none" width="100%" height="100%" rx="30%" ry="30%" />
        </svg>
        <motion.div
          className="absolute top-0 left-0 rounded-full opacity-80"
          style={{
            transform,
            width: size,
            height: size,
            background: `radial-gradient(${color} 40%, transparent 60%)`,
          }}
        />
      </div>
      <div
        className={cn("relative flex size-full items-center justify-center bg-card", contentClassName)}
        style={{ borderRadius: `calc(${radius} - ${gap})` }}
      >
        {children}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Auth drawer                                                                */
/* -------------------------------------------------------------------------- */

export type AuthMethod = "email" | "phone" | "passkey"
type CodeMethod = Exclude<AuthMethod, "passkey">
type Step = "signin" | "otp" | "passkey" | "wallet"
type Status = "idle" | "busy" | "error"

export interface AuthProvider {
  id: string
  /** Accessible name and tooltip of the icon-only button. */
  label: string
  icon: React.ReactNode
}

export interface AuthWallet {
  id: string
  label: string
  icon: React.ReactNode
  /** Small pill after the label, e.g. "350+". */
  badge?: React.ReactNode
}

export interface AuthSuccess {
  method: AuthMethod
  /** The email or phone number; undefined for passkeys. */
  value?: string
}

export interface AuthDrawerProps {
  /** Controlled open state. */
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Element rendered as the Drawer trigger (e.g. a button). */
  trigger?: React.ReactElement
  title?: React.ReactNode
  /** Icon-only social sign-in buttons on the first step. */
  providers?: AuthProvider[]
  /** Wallets on the "Connect wallet" step; the step is hidden when empty. */
  wallets?: AuthWallet[]
  /** Tabs of the sign-in field; the tab bar is hidden for a single method. */
  methods?: AuthMethod[]
  onProvider?: (id: string) => void
  onWallet?: (id: string) => void
  /** Send the one-time code; throw (reject) to show the error state. */
  onSendCode?: (input: { method: CodeMethod; value: string }) => void | Promise<void>
  /** Check the code; resolve false to show "That code didn't work". */
  onVerify?: (input: { method: CodeMethod; value: string; code: string }) => boolean | Promise<boolean>
  /** Run the passkey ceremony; resolve false to show "Passkey failed". */
  onPasskey?: () => boolean | Promise<boolean>
  onSuccess?: (result: AuthSuccess) => void
  /** Extra classes for the sheet (Drawer.Popup). */
  className?: string
}

const METHOD_LABEL: Record<AuthMethod, string> = { email: "Email", phone: "Phone", passkey: "Passkey" }

const VALUE_PATTERN: Record<CodeMethod, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  phone: /^\+?[\d\s\-()]{10,}$/,
}

const HEIGHT_EASE: [number, number, number, number] = [0.25, 1, 0.5, 1]

function IconButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "state-layer focus-ring flex size-8 shrink-0 items-center justify-center rounded-full bg-container-high text-muted-foreground transition-transform active:scale-90 [&_svg]:size-4.5",
        className,
      )}
      {...props}
    />
  )
}

function Header({ title, onBack }: { title: React.ReactNode; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-6 py-6">
      {onBack ? (
        <IconButton aria-label="Back" onClick={onBack}>
          <ChevronLeft />
        </IconButton>
      ) : null}
      <Drawer.Title
        className={cn("flex-1 text-xl font-semibold tracking-tight select-none", onBack && "text-center")}
      >
        {title}
      </Drawer.Title>
      {/* balances the back button so the title stays centred */}
      {onBack && <span className="size-8" />}
    </div>
  )
}

/** Shared full-width pill button (Connect wallet, Verify code, Cancel / Try again). */
const pillButtonClass =
  "focus-ring flex h-12 w-full items-center justify-center gap-2 rounded-full text-base font-semibold transition-[transform,background-color,opacity] duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"

export function AuthDrawer({
  open,
  defaultOpen = false,
  onOpenChange,
  trigger,
  title = "Sign in",
  providers = [],
  wallets = [],
  methods = ["email", "phone", "passkey"],
  onProvider,
  onWallet,
  onSendCode,
  onVerify,
  onPasskey,
  onSuccess,
  className,
}: AuthDrawerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const isOpen = open ?? uncontrolledOpen
  const [step, setStep] = React.useState<Step>("signin")
  const [method, setMethod] = React.useState<AuthMethod>(methods[0] ?? "email")
  const [value, setValue] = React.useState("")
  const [code, setCode] = React.useState("")
  const [status, setStatus] = React.useState<Status>("idle")
  const [measureRef, bounds] = useMeasure()
  const id = React.useId()

  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
    // reset after the close transition has finished
    if (!next)
      window.setTimeout(() => {
        setStep("signin")
        setCode("")
        setStatus("idle")
      }, 300)
  }

  const go = (next: Step) => {
    setStatus("idle")
    setCode("")
    setStep(next)
  }

  const valid = method === "passkey" || VALUE_PATTERN[method].test(value.trim())

  const succeed = (successMethod: AuthMethod, successValue?: string) => {
    onSuccess?.({ method: successMethod, value: successValue })
    setOpen(false)
  }

  const submit = async () => {
    if (!valid || status === "busy") return
    if (method === "passkey") {
      go("passkey")
      setStatus("busy")
      if (onPasskey ? await onPasskey() : true) succeed("passkey")
      else setStatus("error")
      return
    }
    setStatus("busy")
    try {
      await onSendCode?.({ method, value: value.trim() })
      go("otp")
    } catch {
      setStatus("error")
    }
  }

  const verify = async (input: string) => {
    if (method === "passkey" || input.length < 6) return
    setStatus("busy")
    if (onVerify ? await onVerify({ method, value: value.trim(), code: input }) : true) {
      succeed(method, value.trim())
    } else {
      setStatus("error")
      setCode("")
    }
  }

  let content: React.ReactNode
  if (step === "signin") {
    content = (
      <div>
        <Header title={title} />
        <div className="flex flex-col gap-2 px-6">
          {providers.length > 0 && (
            <div className="flex gap-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  aria-label={provider.label}
                  title={provider.label}
                  onClick={() => onProvider?.(provider.id)}
                  className="state-layer focus-ring flex h-12 flex-1 items-center justify-center rounded-xl bg-container-high transition-transform active:scale-95 [&_svg]:size-4.5"
                >
                  {provider.icon}
                </button>
              ))}
            </div>
          )}
          {methods.length > 1 && (
            <div role="tablist" aria-label="Sign-in method" className="flex h-12 gap-1 rounded-2xl bg-container-high p-1">
              {methods.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={method === item}
                  onClick={() => {
                    setMethod(item)
                    setValue("")
                    setStatus("idle")
                  }}
                  className={cn(
                    "focus-ring relative flex flex-1 items-center justify-center rounded-xl text-sm font-semibold transition-colors",
                    method === item ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {method === item && (
                    <motion.span
                      layoutId={`${id}-method`}
                      className="absolute inset-0 rounded-xl bg-card shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className="relative">{METHOD_LABEL[item]}</span>
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
            className={cn(
              "flex h-12 items-center gap-3 overflow-hidden rounded-2xl bg-container-high pr-1 pl-4 ring-inset transition-shadow focus-within:ring-1 focus-within:ring-foreground/25",
              status === "error" && "ring-1 ring-destructive",
            )}
          >
            {method === "passkey" ? (
              <span className="flex flex-1 items-center gap-3 text-muted-foreground">
                <FingerprintPattern className="size-5" />
                Continue with a passkey
              </span>
            ) : (
              <input
                type={method === "email" ? "email" : "tel"}
                inputMode={method === "email" ? "email" : "tel"}
                autoComplete={method === "email" ? "email" : "tel"}
                aria-label={METHOD_LABEL[method]}
                placeholder={method === "email" ? "you@company.com" : "+1 (555) 123-4567"}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value)
                  if (status === "error") setStatus("idle")
                }}
                className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/70"
              />
            )}
            <button
              type="submit"
              aria-label="Continue"
              disabled={!valid || status === "busy"}
              className="focus-ring flex h-10 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-[transform,opacity] active:scale-95 disabled:bg-container-highest disabled:text-muted-foreground"
            >
              <ArrowRight className="size-5" />
            </button>
          </form>
        </div>
        {wallets.length > 0 ? (
          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="flex h-10 items-center gap-3 text-xs font-medium text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-outline-variant" />
              Or
              <span className="h-px flex-1 bg-outline-variant" />
            </div>
            <button
              type="button"
              onClick={() => go("wallet")}
              className={cn(pillButtonClass, "bg-primary text-primary-foreground")}
            >
              <Wallet className="size-5" />
              Connect wallet
            </button>
          </div>
        ) : (
          <div className="h-6" />
        )}
      </div>
    )
  } else if (step === "otp") {
    content = (
      <div>
        <Header title={`Confirm ${METHOD_LABEL[method].toLowerCase()}`} onBack={() => go("signin")} />
        <div className="flex flex-col gap-6 px-6 pb-6 text-center">
          <div>
            <p className="text-muted-foreground">Enter the code sent to</p>
            <p className="font-medium tracking-tight">{value}</p>
          </div>
          <motion.div
            animate={status === "error" ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.4 }}
          >
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(next) => {
                setCode(next)
                if (status === "error") setStatus("idle")
              }}
              onComplete={(next: string) => void verify(next)}
              aria-label="One-time code"
              containerClassName="flex justify-between gap-2"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className={cn(
                    "h-12 flex-1 rounded-xl border-0 bg-container-high",
                    status === "error" && "ring-1 ring-destructive",
                  )}
                />
              ))}
            </InputOTP>
          </motion.div>
          <p
            aria-live="polite"
            className={cn("-mt-3 h-4 text-sm", status === "error" ? "text-destructive" : "text-muted-foreground")}
          >
            {status === "error" ? "That code didn't work. Try again." : status === "busy" ? "Verifying…" : ""}
          </p>
          <button
            type="button"
            disabled={code.length < 6 || status === "busy"}
            onClick={() => void verify(code)}
            className={cn(pillButtonClass, "bg-success text-white")}
          >
            Verify code
          </button>
        </div>
      </div>
    )
  } else if (step === "passkey") {
    content = (
      <div>
        <Header title="Passkey" onBack={() => go("signin")} />
        <div className="flex flex-col items-center gap-6 px-6 pb-6 text-center">
          <MovingBorder
            duration={1500}
            radius="30px"
            gap="6px"
            className="size-[92px] bg-container-high"
            contentClassName="bg-container"
          >
            <FingerprintPattern className="size-8 text-muted-foreground" />
          </MovingBorder>
          <div>
            <p className="text-xl font-medium tracking-tight">
              {status === "error" ? "Passkey failed" : "Waiting for passkey"}
            </p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-pretty text-muted-foreground">
              {status === "error"
                ? "The prompt was dismissed or timed out."
                : "Follow the prompts from your device to continue."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => (status === "error" ? void submit() : go("signin"))}
            className={cn(
              pillButtonClass,
              status === "error" ? "bg-primary text-primary-foreground" : "bg-container-high",
            )}
          >
            {status === "error" ? "Try again" : "Cancel"}
          </button>
        </div>
      </div>
    )
  } else {
    content = (
      <div>
        <Header title="Connect wallet" onBack={() => go("signin")} />
        <ul className="flex flex-col gap-2 px-6 pb-6">
          {wallets.map((wallet) => (
            <li key={wallet.id}>
              <button
                type="button"
                onClick={() => onWallet?.(wallet.id)}
                className="state-layer focus-ring flex h-15 w-full items-center justify-between gap-3 rounded-2xl bg-container-high px-4 text-left"
              >
                <span className="flex items-center gap-3 text-lg font-medium tracking-tight">
                  {wallet.label}
                  {wallet.badge && (
                    <span className="rounded-full border border-outline-variant bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {wallet.badge}
                    </span>
                  )}
                </span>
                <span className="flex size-9 items-center justify-center rounded-lg [&_svg]:size-6">{wallet.icon}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <Drawer.Root open={isOpen} onOpenChange={setOpen}>
      {trigger && <Drawer.Trigger render={trigger} />}
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center p-4">
          <Drawer.Popup
            data-slot="auth-drawer"
            className={cn(
              "relative w-full max-w-[380px] overflow-hidden rounded-[36px] bg-card text-card-foreground shadow-float outline-none",
              "[transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-starting-style:[transform:translateY(calc(100%+2rem))] data-ending-style:[transform:translateY(calc(100%+2rem))]",
              className,
            )}
          >
            <Drawer.Close
              aria-label="Close"
              className="state-layer focus-ring absolute top-6 right-6 z-10 flex size-8 items-center justify-center rounded-full bg-container-high text-muted-foreground transition-transform active:scale-90"
            >
              <X className="size-4.5" />
            </Drawer.Close>
            {/* animates the sheet height to the measured height of the current step */}
            <motion.div animate={{ height: bounds.height || "auto" }} transition={{ duration: 0.27, ease: HEIGHT_EASE }}>
              <div ref={measureRef}>
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.27, ease: [0.26, 0.08, 0.25, 1] }}
                  >
                    {content}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

export default AuthDrawer
