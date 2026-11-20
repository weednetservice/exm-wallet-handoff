/** Keeper-style building blocks for the wallet: screen, header, sheet, buttons, list card, rows, states, toast. */
import { Component, createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from "react"
import { Drawer } from "vaul"
import { createPortal } from "react-dom"
import { SwipeToConfirm } from "@/components/ui/swipe-to-confirm"
import { cn } from "@/lib/utils"
import { IconBack, IconChevronRight, IconClose, IconEye, IconEyeOff, IconWarning } from "./glyph"

/** one phone-width column, centred on wide screens like Keeper's web wallet; room at the bottom for the tab bar */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("wallet-screen mx-auto flex w-full max-w-[480px] flex-col px-[20px] pt-[env(safe-area-inset-top)] pb-[calc(6rem+env(safe-area-inset-bottom))]", className)}>{children}</div>
  )
}

/** the top bar: a centred title, an optional back button on the left and one action on the right */
export function ScreenHeader({ title, onBack, backLabel = "Назад", left, right, children }: { title?: ReactNode; onBack?: () => void; backLabel?: string; left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return (
    <header className="grid min-h-16 grid-cols-[48px_1fr_48px] items-center">
      <span className="justify-self-start">
        {onBack ? (
          <IconButton label={backLabel} onClick={onBack} className="-ml-2">
            <IconBack size={24} />
          </IconButton>
        ) : left}
      </span>
      <span className="flex min-w-0 justify-center">{children ?? (title ? <h1 className="t-h3 min-w-0 max-w-full break-words text-center leading-tight">{title}</h1> : null)}</span>
      <span className="justify-self-end">{right}</span>
    </header>
  )
}

export function SectionHeading({ title, detail }: { title: string; detail?: ReactNode }) {
  return <header className="wallet-section-heading">
    <h1>{title}</h1>
    {detail ? <p>{detail}</p> : null}
  </header>
}

/**
 * A modal sheet in Keeper's manner: page-coloured surface, centred title, round close button, an
 * optional back button for multi-step flows. Swipe down, Escape or the close button dismiss it.
 */
export const SheetReturnFocus = createContext<RefObject<HTMLElement | null> | null>(null)

export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  headerAction,
  onBack,
  children,
  footer,
  expanded = false,
  fullscreen = false,
  fitDesktop = false,
  minimumBodyRem = 5,
  returnFocusLabel,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: ReactNode
  headerAction?: ReactNode
  onBack?: () => void
  children: ReactNode
  footer?: ReactNode
  /** A focused, multi-step task needs room for its form and fixed action. */
  expanded?: boolean
  fullscreen?: boolean
  fitDesktop?: boolean
  minimumBodyRem?: number
  returnFocusLabel?: string
  className?: string
}) {
  // sheets open from state, not from a Radix trigger: remember who opened it and give focus back on close
  // (captured while rendering the opening: by the time effects run, focus has already moved into the sheet)
  const focusScope = useContext(SheetReturnFocus)
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  const content = useRef<HTMLDivElement | null>(null)
  const scrollBody = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => ({ height: typeof window === "undefined" ? 760 : fullscreen ? window.innerHeight : Math.min(window.innerHeight * .92, 760), bottom: 0, scrollWholeSheet: false }))
  const { scrollWholeSheet } = viewport
  useLayoutEffect(() => {
    if (!open) return
    if (scrollBody.current) scrollBody.current.scrollTop = 0
    if (content.current) content.current.scrollTop = 0
  }, [open, title])
  const revealFocusedField = useCallback(() => {
    const active = document.activeElement
    const scrollArea = scrollWholeSheet ? content.current : scrollBody.current
    if (!scrollArea || !(active instanceof HTMLElement) || !scrollBody.current?.contains(active)) return
    const visible = scrollArea.getBoundingClientRect()
    const field = active.getBoundingClientRect()
    const inset = 12
    if (field.top < visible.top + inset) scrollArea.scrollTop += field.top - visible.top - inset
    else if (field.bottom > visible.bottom - inset) scrollArea.scrollTop += field.bottom - visible.bottom + inset
  }, [scrollWholeSheet])
  useLayoutEffect(() => { if (open) revealFocusedField() }, [open, viewport.height, viewport.bottom, revealFocusedField])
  useEffect(() => {
    if (!open) return
    const update = () => {
      const visual = window.visualViewport
      const visibleHeight = visual?.height ?? window.innerHeight
      const focused = content.current?.contains(document.activeElement)
      const hiddenBelow = Math.max(0, window.innerHeight - (visual?.offsetTop ?? 0) - visibleHeight)
      // iOS keeps the layout viewport tall while the keyboard shrinks the visual viewport.
      const bottom = focused && hiddenBelow > 120 ? hiddenBelow : 0
      const height = Math.max(0, fullscreen ? Math.min(visibleHeight, window.innerHeight) : Math.min(visibleHeight - 12, window.innerHeight * .92, 760))
      const sheet = content.current
      const body = scrollBody.current
      let scrollWholeSheet = height < 380
      if (!scrollWholeSheet && sheet && body) {
        const cappedHeight = Number.parseFloat(getComputedStyle(sheet).maxHeight)
        const availableHeight = Number.isFinite(cappedHeight) ? Math.min(height, cappedHeight) : height
        const chromeHeight = Array.from(sheet.children).reduce((sum, element) => {
          if (!(element instanceof HTMLElement) || element === body || !element.getClientRects().length) return sum
          const style = getComputedStyle(element)
          return sum + element.offsetHeight + (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0)
        }, sheet.offsetHeight - sheet.clientHeight)
        const readableBodyHeight = Math.min(body.scrollHeight, minimumBodyRem * Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
        scrollWholeSheet = availableHeight - chromeHeight < readableBodyHeight
      }
      setViewport(previous => previous.height === height && previous.bottom === bottom && previous.scrollWholeSheet === scrollWholeSheet
        ? previous : { height, bottom, scrollWholeSheet })
    }
    let frame = 0
    let observedField: HTMLElement | null = null
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const active = document.activeElement
        const field = active instanceof HTMLElement && scrollBody.current?.contains(active) ? active : null
        if (observedField !== field) {
          if (observedField) observer.unobserve(observedField)
          if (field) observer.observe(field)
          observedField = field
        }
        update()
        revealFocusedField()
      })
    }
    const observer = new ResizeObserver(scheduleUpdate)
    update()
    window.addEventListener("resize", update)
    document.addEventListener("focusin", scheduleUpdate)
    document.addEventListener("focusout", scheduleUpdate)
    window.visualViewport?.addEventListener("resize", update)
    window.visualViewport?.addEventListener("scroll", update)
    if (content.current) observer.observe(content.current)
    if (scrollBody.current) observer.observe(scrollBody.current)
    return () => {
      window.removeEventListener("resize", update)
      document.removeEventListener("focusin", scheduleUpdate)
      document.removeEventListener("focusout", scheduleUpdate)
      window.visualViewport?.removeEventListener("resize", update)
      window.visualViewport?.removeEventListener("scroll", update)
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [open, expanded, fullscreen, minimumBodyRem, revealFocusedField])
  if (open && !wasOpen.current) {
    const el = document.activeElement
    opener.current = el instanceof HTMLElement && el !== document.body ? el : null
  }
  wasOpen.current = open
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} autoFocus repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="wallet-overlay fixed inset-0 z-[2000] bg-[var(--overlay)]" />
        <Drawer.Content
          ref={content}
          data-fit-desktop={fitDesktop || undefined}
          data-scroll-whole={scrollWholeSheet || undefined}
          className={cn("wallet wallet-sheet fixed inset-x-0 bottom-0 z-[2001] mx-auto flex w-full max-w-[480px] flex-col outline-none", fullscreen ? "wallet-sheet-fullscreen max-h-[100dvh] rounded-none" : "wallet-sheet-compact max-h-[92svh] rounded-t-[var(--radius-card)]", className)}
          style={{ minHeight: 0, height: fullscreen || expanded ? fitDesktop ? `var(--wallet-sheet-fitted-height, ${viewport.height}px)` : viewport.height : undefined, maxHeight: viewport.bottom ? viewport.height : undefined, bottom: viewport.bottom, background: fullscreen ? "var(--bg)" : "var(--elevated)" }}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            const el = opener.current
            const fallback = returnFocusLabel ? [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === returnFocusLabel && !content.current?.contains(button) && button.getClientRects().length > 0) : null
            const available = el?.isConnected && !el.closest('[role="dialog"][data-state="closed"]')
            const target = available ? el : fallback ?? focusScope?.current
            if (!target?.isConnected) return
            const openDialog = Array.from(document.querySelectorAll('.wallet-sheet[data-state="open"]')).at(-1)
            e.preventDefault()
            if (!openDialog || openDialog.contains(target)) target.focus({ preventScroll: true })
          }}
        >
          {!fullscreen ? <div aria-hidden="true" className="wallet-sheet-grip mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--separator)]" /> : null}
          <div className={cn("wallet-sheet-header grid shrink-0 grid-cols-[minmax(44px,1fr)_minmax(0,2fr)_minmax(44px,1fr)] items-center pb-3", fullscreen ? "px-[20px] pt-[max(12px,env(safe-area-inset-top))]" : "px-2 pt-1")}>
            <span className="justify-self-start">
              {onBack ? (
                <IconButton label="Назад" onClick={onBack} round>
                  <IconBack size={20} />
                </IconButton>
              ) : null}
            </span>
            <div className="wallet-sheet-title flex min-w-0 flex-col items-center text-center">
              <Drawer.Title className="t-label1 min-w-0 max-w-full text-center leading-tight font-semibold [overflow-wrap:break-word]">{title}</Drawer.Title>
              {subtitle ? <p className="t-body2 c-2 min-w-0 max-w-full break-words text-center">{subtitle}</p> : null}
            </div>
            {headerAction ? <div className="wallet-sheet-header-action justify-self-end">{headerAction}</div> : fullscreen && onBack ? <span /> : <Drawer.Close asChild>
              <IconButton label="Закрыть" round className="justify-self-end">
                <IconClose size={20} />
              </IconButton>
            </Drawer.Close>}
          </div>
          <div ref={scrollBody} className={cn("wallet-sheet-body min-h-0 flex-auto overflow-y-auto pb-4", fullscreen ? "px-[20px]" : "px-4")}>{children}</div>
          {footer ? <div className={cn("wallet-sheet-footer shrink-0 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]", fullscreen ? "px-[20px]" : "px-4")}>{footer}</div> : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/** 44 × 44 hit area for an icon-only action; `round` draws Keeper's 32 px circle inside it */
export function IconButton({ label, round = false, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; round?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("wallet-icon-button group inline-grid size-[44px] shrink-0 place-items-center rounded-full text-[var(--label)] transition-colors", round ? "" : "hover:bg-[var(--fill)] active:bg-[var(--fill-press)]", className)}
      {...rest}
    >
      {round ? (
        <span className="grid size-[32px] place-items-center rounded-full bg-[var(--fill)] transition-colors group-hover:bg-[var(--fill-press)] group-active:bg-[var(--attention)]">{children}</span>
      ) : (
        children
      )}
    </button>
  )
}

/** an icon action on a filled circle (header actions over content) */
export function RoundButton(props: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <IconButton round {...props} />
}

/** a round 44 px action with a caption under it (Keeper's Send / Receive / Swap) */
export function ActionButton({ label, icon, onClick, primary = false }: { label: string; icon: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} data-primary={primary || undefined} className="wallet-action group flex min-w-[76px] flex-col items-center gap-2 rounded-[var(--radius-btn)] px-1 pt-1 pb-0.5">
      <span className="wallet-action-disc grid size-11 place-items-center rounded-full bg-[var(--fill)] transition-colors group-hover:bg-[var(--fill-press)] group-active:bg-[var(--tint)]">{icon}</span>
      <span className="t-label2 c-2 transition-colors group-hover:text-[var(--label)]">{label}</span>
    </button>
  )
}

/** the one prominent action of a view */
export function PrimaryButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "wallet-pressable t-label1 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-primary)] bg-[var(--blue-fill)] px-5 py-2.5 text-center text-white transition-colors hover:bg-[var(--blue-fill-hover)] active:bg-[var(--blue-fill-press)] disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "wallet-pressable t-label1 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-[var(--radius-group)] bg-[var(--fill)] px-6 text-[var(--label)] transition-colors hover:bg-[var(--fill-press)] active:bg-[var(--attention)] disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** a small button inside a card or row: white on the tint (secondary grey on the tint would be 3.85:1) */
export function ChipButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "t-label2 inline-flex min-h-11 shrink-0 items-center justify-center rounded-full text-[var(--label)] disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--fill)] px-3.5 transition-colors hover:bg-[var(--fill-press)]">{children}</span>
    </button>
  )
}

/** a section of rows on one card; an optional Keeper header ("Монеты ›") and a footnote */
export function Group({
  header,
  onHeader,
  headerLabel,
  footer,
  children,
  className,
}: {
  header?: ReactNode
  /** makes the header a link ("Монеты ›" opens the list) */
  onHeader?: () => void
  headerLabel?: string
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      {header ? (
        onHeader ? (
          <button type="button" onClick={onHeader} aria-label={headerLabel} className="t-label1 -mx-1 inline-flex min-h-11 items-center gap-1 self-start rounded-[var(--radius-btn)] px-1 hover:text-[var(--blue)]">
            {header}
            <IconChevronRight size={18} className="c-2" />
          </button>
        ) : (
          <h2 className="t-label1 flex min-h-8 items-center">{header}</h2>
        )
      ) : null}
      <div className="card list overflow-hidden">{children}</div>
      {footer ? <p className="t-body3 c-2 px-1">{footer}</p> : null}
    </section>
  )
}

/** a label and its value on one line: confirmation sheets, swap details, settings */
export function Row({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("wallet-fact-row flex min-h-[52px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3", className)}>
      <span className="t-body2 c-2 min-w-0 max-w-full break-words">{label}</span>
      <span className="t-label2 ml-auto min-w-0 max-w-full break-words text-right">{children}</span>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("skeleton inline-block h-[1em] align-middle", className)} />
}

/** a failed load: what went wrong and the one way to retry */
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="wallet-feedback wallet-feedback-error flex flex-col items-start">
      <p className="t-body2 c-2">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="wallet-feedback-retry t-label2 min-h-11">
          <span>Повторить</span>
        </button>
      ) : null}
    </div>
  )
}

/** a short confirmation over the tab bar ("Скопировано"); one at a time */
export function useToast() {
  const [text, setText] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = useCallback((t: string) => {
    clearTimeout(timer.current)
    setText(t)
    timer.current = setTimeout(() => setText(null), 1800)
  }, [])
  const node = createPortal(
    <div role="status" aria-live="polite" className="wallet pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[3000] mx-auto flex w-full max-w-[480px] justify-center px-[20px]" style={{ minHeight: 0, background: "transparent" }}>
      {text ? (
        <span className="toast t-label2 inline-flex min-h-10 max-w-full items-center rounded-[20px] bg-[var(--label)] px-4 py-2 text-center break-words text-[var(--bg)] shadow-[0_8px_24px_rgba(0,0,0,.16)]">{text}</span>
      ) : null}
    </div>, document.body
  )
  return [node, show] as const
}

/**
 * The swipe that confirms a send, a swap or an approval: the restored SwipeToConfirm in our blue,
 * and a done state in our green with dark ink (8.8:1; the original's white on #22C55E is 2.3:1).
 * The colours are set from wallet.css through data-done; the original component stays untouched.
 */
export function ConfirmSwipe({
  label,
  doneLabel,
  errorLabel,
  onConfirm,
  onDone,
  resetAfter = 0,
}: {
  label: string
  doneLabel: string
  errorLabel: string
  onConfirm: () => Promise<unknown>
  onDone?: () => void
  resetAfter?: number
}) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <div className="swipe-done-scope" data-done={done || undefined}>
      <SwipeToConfirm
        className="swipe"
        label={label}
        doneLabel={doneLabel}
        errorLabel={errorLabel}
        color="#0671EB"
        onConfirm={onConfirm}
        resetAfter={resetAfter}
        onDone={() => {
          setDone(true)
          if (resetAfter > 0) timer.current = setTimeout(() => setDone(false), resetAfter)
          onDone?.()
        }}
      />
    </div>
  )
}

/** one tab failing to render shows this instead of blanking the app; the tab bar keeps working */
export class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn("Экран не загрузился", error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Screen>
        <div role="alert" className="flex flex-col items-center gap-3 pt-24 text-center">
          <h1 className="t-h3">Экран не загрузился</h1>
          <p className="t-body2 c-2 max-w-[300px]">Остальные разделы работают. Попробуйте открыть этот ещё раз.</p>
          <SecondaryButton onClick={() => this.setState({ failed: false })} className="mt-2 w-auto px-8">
            Повторить
          </SecondaryButton>
        </div>
      </Screen>
    )
  }
}

/** a password field with a show/hide toggle; the border turns blue in focus and red on error */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  invalid = false,
  autoFocus = false,
  describedBy,
  autoComplete = "new-password",
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  autoFocus?: boolean
  describedBy?: string
  autoComplete?: string
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="wallet-field flex flex-col gap-2">
      <label htmlFor={id} className="t-label2">
        {label}
      </label>
      <div
        className="wallet-field-surface flex min-h-14 items-center pr-1 pl-4"
        data-invalid={invalid ? "true" : undefined}
      >
        <input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="t-body1 min-w-0 flex-1 bg-transparent py-4 text-[var(--label)] outline-none!"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
          aria-pressed={shown}
          className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-btn)] text-[var(--label-2)] transition-colors hover:text-[var(--label)]"
        >
          {shown ? <IconEyeOff size={22} /> : <IconEye size={22} />}
        </button>
      </div>
    </div>
  )
}

/** a warning or a note on a card: the one caveat of a screen (the phrase, the copy in iCloud) */
export function Notice({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "info" }) {
  return (
    <div className="wallet-feedback wallet-notice" data-tone={tone}>
      {tone === "warn" ? <IconWarning size={22} className="mt-px shrink-0 text-[var(--orange)]" /> : null}
      <p className="t-body2 min-w-0 [overflow-wrap:anywhere]">{children}</p>
    </div>
  )
}

/** copies text; resolves false when the browser refuses (then the caller selects the text instead) */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
