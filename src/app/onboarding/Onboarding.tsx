/**
 * EXM's own keys: create a wallet (24 words, a check of three, a password), import one (12 or 24
 * words, a password), restore one from its copy in iCloud (Face ID, a password), unlock it on return
 * (Face ID or the password). Full-screen steps in Keeper's manner: a centred title, a back button, one
 * primary action at the bottom. Keys live in ../vault; this file is only the UI.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { shortAddress } from "@/lib/format"
import { useAccounts } from "../accounts"
import { Moon, Sun } from "@phosphor-icons/react"
import "@fontsource-variable/literata"
import { saveAppearance } from "../appearance"
import { ExmKeyMark } from "../art/ExmKeyMark"
import { checkMnemonic, cleanWords, MIN_PASSWORD, mnemonicWordHint, PasskeyError, useVault } from "../vault"
import { IconChevronDown, IconPaste } from "../glyph"
import { IconButton, Notice, PasswordField, PrimaryButton, Screen, ScreenHeader, SecondaryButton, Sheet } from "../ui"
import { restoreLabel, useBiometryUnlock, useWords } from "./Biometry"
import welcomeGem from "../art/exm-gem-paper.webp"
import "./entry.css"

export { PasswordField } from "../ui"

export type Flow = "create" | "import" | "restore"
/** starts a flow from anywhere (Welcome, the unlock screen) */
export const FlowContext = createContext<(flow: Flow) => void>(() => {})
export const useStartFlow = () => useContext(FlowContext)

/** the product's name as a wordmark: text only, no drawn logo */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={"t-h1 tracking-[.04em] " + className}>EXM</span>
}

function EntryArtwork() {
  return <div className="wallet-entry-art" aria-hidden="true">
    <img src={welcomeGem} alt="" width={1254} height={1254} fetchPriority="high" decoding="sync" />
  </div>
}

function EntryHeader() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))
  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setDark(root.classList.contains("dark")))
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  return <header className="wallet-entry-header">
    <div className="wallet-entry-brand"><ExmKeyMark size={30} /><span><strong>EXM</strong> Wallet</span></div>
    <IconButton label={dark ? "Включить светлую тему" : "Включить тёмную тему"} className="wallet-entry-theme" onClick={() => saveAppearance(dark ? "light" : "dark")}>
      {dark ? <Sun size={21} aria-hidden="true" /> : <Moon size={21} aria-hidden="true" />}
    </IconButton>
  </header>
}

function EntryOptions({ label, id, triggerId, children }: { label: string; id: string; triggerId?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <div className="wallet-entry-options" data-open={open}>
    <button id={triggerId} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="wallet-entry-disclosure">
      {label} <IconChevronDown size={16} className="wallet-entry-options-chevron" />
    </button>
    <div id={id} className="wallet-entry-options-panel" inert={!open} aria-hidden={!open}>
      <div className="wallet-entry-options-content">{children}</div>
    </div>
  </div>
}

/* ------------------------------------------------------------------ pieces */

type StepDirection = "forward" | "backward"

function useOnboardingStep<T extends string>(initial: T) {
  const [{ step, direction }, setPosition] = useState<{ step: T; direction: StepDirection }>({ step: initial, direction: "forward" })
  const setStep = (next: T, direction: StepDirection = "forward") => setPosition({ step: next, direction })
  return [step, direction, setStep] as const
}

/** a step: header with back, body, the one action pinned to the bottom of the column */
function Step({ title, direction, onBack, children, action }: { title: string; direction: StepDirection; onBack: () => void; children: ReactNode; action: ReactNode }) {
  const body = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    const active = document.activeElement
    if (active && body.current?.contains(active) && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return
    window.scrollTo({ top: 0, behavior: "instant" })
    heading.current?.focus({ preventScroll: true })
  }, [title])
  return (
    <Screen className="wallet-setup min-h-svh pb-[max(16px,env(safe-area-inset-bottom))]">
      <ScreenHeader onBack={onBack} right={<Wordmark className="wallet-setup-mark" />} />
      <div key={title} ref={body} data-direction={direction} className="wallet-setup-body wallet-step-enter flex flex-1 flex-col gap-5 pb-6">
        <h1 ref={heading} tabIndex={-1} className="wallet-setup-title">{title}</h1>
        {children}
      </div>
      <div className="wallet-setup-action">{action}</div>
    </Screen>
  )
}

/** the recovery phrase: numbered, two columns, as Keeper shows it */
export function WordsGrid({ words, focusOnMount = false }: { words: string[]; focusOnMount?: boolean }) {
  const list = useRef<HTMLOListElement>(null)
  useLayoutEffect(() => {
    if (!focusOnMount) return
    list.current?.focus({ preventScroll: true })
    list.current?.scrollIntoView({ block: "start", behavior: "instant" })
  }, [focusOnMount])
  return (
    <ol ref={list} tabIndex={focusOnMount ? -1 : undefined} className="card recovery-words-grid p-4" aria-label="Секретная фраза">
      {words.map((w, i) => (
        <li key={i} className="flex min-h-9 items-baseline gap-2">
          <span className="t-body2 c-2 w-6 shrink-0 text-right tabular-nums">{i + 1}.</span>
          <span className="t-label1">{w}</span>
        </li>
      ))}
    </ol>
  )
}

function PasswordStep({
  title,
  direction,
  onBack,
  submitLabel,
  onSubmit,
  intro = "Пароль открывает кошелёк на этом устройстве. Если забудете его, кошелёк можно вернуть только по секретной фразе.",
}: {
  title: string
  direction: StepDirection
  onBack: () => void
  submitLabel: string
  onSubmit: (password: string) => Promise<void>
  intro?: ReactNode
}) {
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mismatch = repeat.length > 0 && repeat !== password
  const ready = Array.from(password).length >= MIN_PASSWORD && repeat === password && !busy
  const submit = async () => {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(password)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось, попробуйте ещё раз")
      setBusy(false)
    }
  }
  return (
    <Step
      title={title}
      direction={direction}
      onBack={onBack}
      action={
        <PrimaryButton onClick={submit} disabled={!ready}>
          {busy ? "Шифруем ключи…" : submitLabel}
        </PrimaryButton>
      }
    >
      <p className="t-body1 c-2 px-1">{intro}</p>
      <form
        className="wallet-password-form flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex flex-col gap-2">
          <PasswordField id="pw" label="Пароль" value={password} onChange={setPassword} autoFocus describedBy="pw-hint" />
          <p id="pw-hint" className="t-body2 c-2 px-1">
            От {MIN_PASSWORD} символов
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <PasswordField id="pw2" label="Ещё раз" value={repeat} onChange={setRepeat} invalid={mismatch} describedBy="pw2-hint" />
          <p id="pw2-hint" aria-live="polite" className="t-body2 min-h-5 px-1" style={{ color: "var(--red)" }}>
            {mismatch ? "Пароли не совпадают" : ""}
          </p>
        </div>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
      {error ? (
        <p role="alert" className="t-body2 px-1 text-[var(--red)]">
          {error}
        </p>
      ) : null}
    </Step>
  )
}

/* ------------------------------------------------------------------ create */

/** three different word positions to check, in order */
function pickThree(total: number) {
  const third = Math.floor(total / 3)
  return [0, 1, 2].map((part) => part * third + Math.floor(Math.random() * (part === 2 ? total - part * third : third)))
}

export function CreateFlow({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const vault = useVault()
  const words = useMemo(() => vault.newMnemonic(), []) // eslint-disable-line react-hooks/exhaustive-deps
  const check = useMemo(() => pickThree(words.length), [words])
  const [step, direction, setStep] = useOnboardingStep<"phrase" | "check" | "password">("phrase")
  const [revealed, setRevealed] = useState(false)
  const [answers, setAnswers] = useState(["", "", ""])
  const [checked, setChecked] = useState(false)
  const wrong = check.map((i, k) => answers[k].trim().toLowerCase() !== words[i])
  const verify = () => {
    setChecked(true)
    if (answers.every((answer) => answer.trim()) && !wrong.some(Boolean)) setStep("password")
  }
  useEffect(() => {
    // Hide synchronously before iOS takes an app-switcher snapshot. The same phrase stays in
    // memory for this creation attempt, but it must be deliberately revealed again on return.
    const hide = () => flushSync(() => setRevealed(false))
    const onVisibility = () => { if (document.visibilityState === "hidden") hide() }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", hide)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", hide)
    }
  }, [])

  if (step === "phrase")
    return (
      <Step title="Новая фраза" direction={direction} onBack={onCancel} action={revealed ? <PrimaryButton onClick={() => { setRevealed(false); setStep("check") }}>Фраза записана</PrimaryButton> : <PrimaryButton onClick={() => setRevealed(true)}>Показать 24 слова</PrimaryButton>}>
        <p className="t-body1 c-2 px-1">{revealed ? "Запишите 24 слова по порядку. Они восстановят кошелёк, если вы забудете пароль." : "Эти 24 слова восстановят кошелёк, если потеряете устройство или пароль."}</p>
        {revealed ? <WordsGrid words={words} focusOnMount /> : null}
        <Notice>24 слова дают доступ к монетам. Запишите их на бумаге. Не делайте снимок экрана и никому не показывайте.</Notice>
      </Step>
    )

  if (step === "check")
    return (
      <Step
        title="Проверка"
        direction={direction}
        onBack={() => setStep("phrase", "backward")}
        action={
          <PrimaryButton
            disabled={answers.some((a) => !a.trim())}
            onClick={verify}
          >
            Далее
          </PrimaryButton>
        }
      >
        <p className="t-body1 c-2 px-1">
          Введите слова с номерами {check[0] + 1}, {check[1] + 1} и {check[2] + 1}, чтобы убедиться, что фраза записана верно.
        </p>
        <div className="wallet-word-check flex flex-col gap-5">
          {check.map((i, k) => {
            const bad = checked && wrong[k]
            return (
              <div key={i} className="flex flex-col gap-2">
                <label htmlFor={`w${i}`} className="t-label2 c-2 px-1">
                  Слово {i + 1}
                </label>
                <input
                  id={`w${i}`}
                  value={answers[k]}
                  onChange={(e) => setAnswers((a) => a.map((v, j) => (j === k ? e.target.value : v)))}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus={k === 0}
                  enterKeyHint={k === 2 ? "done" : "next"}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return
                    e.preventDefault()
                    if (k < 2) document.getElementById(`w${check[k + 1]}`)?.focus()
                    else verify()
                  }}
                  aria-invalid={bad}
                  aria-describedby={`w${i}-hint`}
                  className="t-body1 min-h-14 rounded-[var(--radius-group)] bg-[var(--grouped)] px-4 text-[var(--label)] transition-shadow"
                  style={bad ? { boxShadow: "inset 0 0 0 1.5px var(--red)", background: "color-mix(in srgb, var(--red) 8%, var(--grouped))" } : undefined}
                />
                {bad ? (
                  <p id={`w${i}-hint`} className="t-body2 px-1 text-[var(--red)]">
                    Не совпадает со словом {i + 1}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </Step>
    )

  return (
    <PasswordStep
      title="Пароль"
      direction={direction}
      onBack={() => setStep("check", "backward")}
      submitLabel="Создать кошелёк"
      onSubmit={async (password) => {
        await vault.create(words, password)
        onDone()
      }}
    />
  )
}

/* ------------------------------------------------------------------ import */

export function ImportFlow({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const vault = useVault()
  const { accounts } = useAccounts()
  const [text, setText] = useState("")
  const [step, direction, setStep] = useOnboardingStep<"words" | "replace" | "password">("words")
  const [error, setError] = useState<string | null>(null)
  const [pasteFailed, setPasteFailed] = useState(false)
  const phraseField = useRef<HTMLTextAreaElement>(null)
  const start = useStartFlow()
  const words = cleanWords(text)
  const countOk = words.length === 12 || words.length === 24
  const wordHint = words.map(mnemonicWordHint).find((hint) => hint !== null)
  // forgot the password: importing replaces the wallet stored on this device
  const replacing = vault.status !== "empty"
  const oldCopy = vault.backup.state === "saved" || vault.backup.state === "verified" || vault.backup.state === "file"
  const oldAddress = Object.values(accounts).find((account) => account?.source === "wallet")?.address
  const oldName = oldAddress ? `«Мой кошелёк» · ${shortAddress(oldAddress, 4, 4)}` : "«Мой кошелёк»"
  const backupStatus = vault.backup.state === "verified"
    ? "Копия проверена. Убедитесь, что сможете открыть её после замены."
    : vault.backup.state === "saved"
      ? "Копия создана, но её восстановление ещё не проверено."
      : vault.backup.state === "file"
        ? "Файл копии был предложен для сохранения. Проверьте, что он у вас есть."
        : vault.backup.state === "missing"
          ? "Копия на этом устройстве не найдена."
          : "Копии для восстановления на этом устройстве нет."

  if (step === "words")
    return (
      <Step
        title="Импорт"
        direction={direction}
        onBack={onCancel}
        action={
          <PrimaryButton
            disabled={!countOk}
            onClick={() => {
              // the phrase is checked here, before a password is invented for it
              const problem = checkMnemonic(words)
              setError(problem)
              if (problem) requestAnimationFrame(() => phraseField.current?.focus())
              else setStep(replacing ? "replace" : "password")
            }}
          >
            Далее
          </PrimaryButton>
        }
      >
        {replacing ? <Notice>После проверки фразы вы подтвердите замену кошелька на этом устройстве.</Notice> : null}
        <Notice>Фраза даёт доступ к монетам. Вводите только свою.</Notice>
        <div className="wallet-import-field flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2 px-1">
            <label htmlFor="phrase" className="t-label2 c-2 min-w-0">
              Секретная фраза, 12 или 24 слова
            </label>
            {!pasteFailed && !text ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    setText(await navigator.clipboard.readText())
                  } catch {
                    setPasteFailed(true)
                  }
                }}
                className="t-label2 -my-3 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-btn)] px-2 text-[var(--blue)] transition-colors hover:bg-[var(--fill)]"
              >
                <IconPaste size={18} />
                Вставить
              </button>
            ) : null}
          </div>
          <textarea
            id="phrase"
            ref={phraseField}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            rows={5}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby="phrase-hint"
            placeholder="слова через пробел"
            className="t-body1 resize-none rounded-[var(--radius-group)] bg-[var(--grouped)] p-4 text-[var(--label)] transition-shadow"
            style={error ? { boxShadow: "inset 0 0 0 1.5px var(--red)", background: "color-mix(in srgb, var(--red) 8%, var(--grouped))" } : undefined}
          />
          <p id="phrase-hint" className="t-body2 px-1" style={{ color: error ? "var(--red)" : "var(--label-2)" }}>
            {error ?? (wordHint ? `Слов: ${words.length}. Проверьте «${wordHint.word}». ${wordHint.suggestions.length ? `Возможно: ${wordHint.suggestions.join(", ")}.` : "Такого слова нет в BIP-39."}` : words.length ? `Слов: ${words.length}${countOk ? "" : ". Нужно 12 или 24"}` : pasteFailed ? "Браузер не дал прочитать буфер обмена: введите слова вручную." : "Слова через пробел, в том порядке, в каком они записаны.")}
          </p>
        </div>
        {vault.biometry.available && !text ? (
          <button type="button" onClick={() => start("restore")} className="t-label1 -mt-2 min-h-12 self-start rounded-[var(--radius-group)] px-1 text-[var(--blue)] transition-colors hover:bg-[var(--fill)]">
            Фразы нет под рукой? {restoreLabel(vault.backup)}
          </button>
        ) : null}
      </Step>
    )

  if (step === "replace")
    return (
      <Step
        title="Замена кошелька"
        direction={direction}
        onBack={() => setStep("words", "backward")}
        action={<div className="flex flex-col gap-2"><PrimaryButton onClick={() => setStep("password")}>Продолжить замену</PrimaryButton><SecondaryButton onClick={onCancel}>Отменить импорт</SecondaryButton></div>}
      >
        <p className="t-body1 px-1">Сейчас на этом устройстве сохранён {oldName}. После импорта его заменит новый кошелёк.</p>
        <Notice>{backupStatus} Для возврата к прежнему кошельку потребуется его секретная фраза{oldCopy ? " или доступная копия" : ""}.</Notice>
        <p className="t-body2 c-2 px-1">Новая фраза проверена. Старый кошелёк останется доступен, если вы отмените импорт или сохранение нового кошелька не удастся.</p>
      </Step>
    )

  return (
    <PasswordStep
      title="Пароль"
      direction={direction}
      onBack={() => setStep(replacing ? "replace" : "words", "backward")}
      submitLabel="Импортировать"
      onSubmit={async (password) => {
        await vault.importWallet(words, password)
        onDone()
      }}
    />
  )
}

/* ------------------------------------------------------------------ restore */

type Problem = { kind: "cancelled" | "no-copy" | "unopened" | "bad-file" | "domain" | "failed"; text: string }

/**
 * The wallet back from its copy: the tap on "Восстановить из iCloud" opens the system sheet at once
 * (one Face ID reads the passkey and its copy), then a password for this device. Every failure says
 * what happened and gives the next step; the phrase is always one tap away. Leaving the screen
 * aborts the prompt and forgets an opened copy.
 */
export function RestoreFlow({ onDone, onCancel, onPhrase }: { onDone: () => void; onCancel: () => void; onPhrase: () => void }) {
  const vault = useVault()
  const w = useWords()
  const { backup } = vault
  const fileFirst = backup.supported === "file"
  const replacing = vault.status !== "empty"
  const [step, direction, setStep] = useOnboardingStep<"find" | "password">("find")
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [address, setAddress] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const where = backup.icloud ? "в Связке ключей iCloud" : "в менеджере паролей"

  const find = async (file?: File) => {
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    setBusy(true)
    setProblem(null)
    try {
      const found = await vault.readBackup(file, ctl.signal)
      if (ctl.signal.aborted) return
      setAddress(found.address)
      setStep("password")
    } catch (e) {
      if (ctl.signal.aborted) return
      const kind = e instanceof PasskeyError ? e.kind : "failed"
      setProblem(
        kind === "cancelled"
          ? {
              kind,
              text: backup.icloud
                ? "Ключ не выбран или ещё не появился на этом устройстве. Проверьте, что Связка ключей iCloud включена с тем же Apple Account: на новом устройстве ключу может понадобиться время."
                : `${w.keyTerm[0].toUpperCase() + w.keyTerm.slice(1)} не выбран или ещё не появился на этом устройстве: на новом устройстве ему может понадобиться время.`,
            }
          : kind === "no-copy"
            ? { kind, text: "В выбранном ключе нет копии кошелька. Если ключей EXM несколько, выберите другой. Если сохраняли файл копии, выберите его." }
            : kind === "unsupported"
              ? { kind: "no-copy", text: "На этом устройстве копию из ключа не прочитать. Если сохраняли файл копии, выберите его." }
              : kind === "mismatch" || kind === "no-prf"
                ? { kind: "unopened", text: "Копия нашлась, но на этом устройстве не открывается. Верните кошелёк по секретной фразе." }
                : kind === "bad-file"
                  ? { kind, text: "Это не файл копии EXM. Выберите файл exm-wallet-copy." }
                  : kind === "domain"
                    ? { kind, text: e instanceof Error && e.message === "file" ? "Файл сохранён на другом адресе EXM: ключ к нему здесь не работает." : "Ключ работает только на том адресе EXM, где его создали." }
                    : { kind: "failed", text: "Не получилось открыть копию. Попробуйте ещё раз или верните кошелёк по секретной фразе." },
      )
    } finally {
      if (!ctl.signal.aborted) setBusy(false)
    }
  }

  // the tap on the welcome screen asked for this: open the system sheet right away. A timer, so that
  // StrictMode's trial unmount cancels it before any request; leaving stops the prompt, forgets the copy
  useEffect(() => {
    const t = fileFirst ? 0 : window.setTimeout(() => find(), 0)
    return () => {
      window.clearTimeout(t)
      abort.current?.abort()
      vault.cancelRestore()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (step === "password")
    return (
      <PasswordStep
        title="Пароль"
        direction={direction}
        onBack={() => {
          vault.cancelRestore()
          setStep("find", "backward")
        }}
        submitLabel="Открыть кошелёк"
        intro={`Найден кошелёк ${shortAddress(address, 6, 4)}. Задайте пароль для этого устройства: он понадобится, если не сработает ${w.method}.`}
        onSubmit={async (password) => {
          await vault.restoreFromPasskey(password)
          onDone()
        }}
      />
    )

  const pickFile = () => fileInput.current?.click()
  const link = "t-label1 min-h-12 rounded-[var(--radius-group)] text-[var(--blue)] transition-colors hover:bg-[var(--fill)] disabled:text-[var(--label-3)]"
  // one primary per state; the phrase stays one tap away in every state
  let primary: ReactNode
  let more: ReactNode[] = []
  if (busy) primary = <PrimaryButton disabled>{w.waiting}</PrimaryButton>
  else if (problem?.kind === "unopened") {
    primary = <PrimaryButton onClick={onPhrase}>Ввести секретную фразу</PrimaryButton>
    more = [
      <button key="retry" type="button" onClick={() => find()} className={link}>
        Попробовать ещё раз
      </button>,
    ]
  } else {
    const fileButton = (
      <button key="file" type="button" onClick={pickFile} className={link}>
        Выбрать файл копии
      </button>
    )
    const phraseButton = (
      <button key="phrase" type="button" onClick={onPhrase} className={link}>
        Ввести секретную фразу
      </button>
    )
    if (fileFirst || problem?.kind === "bad-file") {
      primary = <PrimaryButton onClick={pickFile}>Выбрать файл копии</PrimaryButton>
      more = [phraseButton]
    } else if (problem?.kind === "no-copy") {
      primary = <PrimaryButton onClick={() => find()}>Выбрать другой ключ</PrimaryButton>
      more = [fileButton, phraseButton]
    } else {
      primary = <PrimaryButton onClick={() => find()}>{problem ? "Попробовать ещё раз" : "Найти копию"}</PrimaryButton>
      more = [phraseButton]
    }
  }
  return (
    <Step
      title="Восстановление"
      direction={direction}
      onBack={onCancel}
      action={
        <div className="flex flex-col gap-2">
          {primary}
          {busy ? (
            <button type="button" onClick={onPhrase} disabled className={link}>
              Ввести секретную фразу
            </button>
          ) : (
            more
          )}
        </div>
      }
    >
      {replacing ? <Notice>Кошелёк, сохранённый на этом устройстве, заменится найденным.</Notice> : null}
      {problem ? <Notice>{problem.text}</Notice> : null}
      <p className="t-body1 c-2 px-1">
        {fileFirst
          ? "Выберите файл копии EXM, потом подтвердите вход в окне системы: файл открывается только ключом, которым его зашифровали."
          : `Ищем копию кошелька в ${w.keyTerm.replace("ключ", "ключе")} EXM ${where}. Выберите ключ и подтвердите вход в окне системы, потом задайте новый пароль.`}
      </p>
      {busy ? (
        <p role="status" className="t-body2 c-2 px-1">
          Выберите ключ EXM и подтвердите вход в окне системы.
        </p>
      ) : null}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) find(f)
        }}
      />
    </Step>
  )
}

/* ------------------------------------------------------------------ unlock */

/**
 * Locked: with Face ID on, one button (as Google Photos' "Open with Face ID") and the password one tap
 * away; it comes forward by itself when Face ID does not open the wallet. Without Face ID, the
 * password field. Forgot the password: the phrase, or the copy in iCloud where this device can read it.
 */
export function UnlockScreen({ onRestore }: { onRestore: () => void }) {
  const vault = useVault()
  const start = useStartFlow()
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [unlockError, setUnlockError] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [focusField, setFocusField] = useState(0)
  const bio = useBiometryUnlock(() => {
    setShowPassword(true)
    setFocusField((n) => n + 1)
  })
  useEffect(() => {
    if (focusField) document.getElementById("unlock")?.focus()
  }, [focusField])
  const submit = async () => {
    if (!password || busy) return
    setBusy(true)
    setUnlockError(false)
    try {
      const ok = await vault.unlock(password)
      if (!ok) setWrong(true)
    } catch {
      setUnlockError(true)
    } finally {
      setBusy(false)
    }
  }
  const withField = !bio.enabled || showPassword
  const Submit = bio.enabled ? SecondaryButton : PrimaryButton
  return (
    <main className="wallet-entry wallet-unlock">
      <EntryHeader />
      <EntryArtwork />
      <div className="wallet-entry-content">
      <div className="wallet-entry-copy">
        <h1 tabIndex={-1}>Открыть кошелёк</h1>
        {bio.enabled ? <p>{bio.words.unlockHint}</p> : null}
      </div>
      {bio.enabled ? (
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={bio.run} disabled={bio.busy}>
            {bio.busy ? bio.words.waiting : bio.words.open}
          </PrimaryButton>
          {withField ? null : (
            <button
              type="button"
              onClick={() => {
                setShowPassword(true)
                setFocusField((n) => n + 1)
              }}
              className="t-label1 min-h-12 rounded-[var(--radius-group)] text-[var(--blue)] transition-colors hover:bg-[var(--fill)]"
            >
              Ввести пароль
            </button>
          )}
        </div>
      ) : null}
      {/* outside the Face ID block: a record that stopped fitting turns Face ID off and still explains why */}
      {bio.error ? (
        <p role="alert" className="t-body2 px-1 text-[var(--orange)]">
          {bio.error}
        </p>
      ) : null}
      {withField ? (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <PasswordField
          id="unlock"
          label="Пароль"
          value={password}
          onChange={(v) => {
            setPassword(v)
            setWrong(false)
            setUnlockError(false)
          }}
          invalid={wrong || unlockError}
          autoFocus={!bio.enabled && window.matchMedia("(pointer: fine)").matches}
          describedBy={wrong || unlockError ? "unlock-hint" : undefined}
          autoComplete="current-password"
        />
        {wrong || unlockError ? <p id="unlock-hint" role="alert" className="t-body2 text-[var(--red)]">
          {wrong ? "Неверный пароль" : "Не получилось открыть кошелёк. Попробуйте ещё раз."}
        </p> : null}
        <Submit className="wallet-entry-primary" type="submit" disabled={!password || busy}>
          {busy ? "Открываем…" : "Открыть"}
        </Submit>
      </form>
      ) : null}
      <div className="wallet-unlock-recovery">
        <EntryOptions label="Не получается войти?" id="unlock-recovery">
          <button type="button" onClick={onRestore} className="t-label2 min-h-11 rounded-[var(--radius-btn)] px-3 text-[var(--blue)] hover:bg-[var(--fill)]">
            Восстановить по фразе
          </button>
          {vault.biometry.available ? (
            <button type="button" onClick={() => start("restore")} className="t-label2 min-h-11 rounded-[var(--radius-btn)] px-3 text-[var(--blue)] hover:bg-[var(--fill)]">
              {restoreLabel(vault.backup)}
            </button>
          ) : null}
          <p className="t-body3 c-2 px-2 text-center">Восстановление заменит кошелёк на этом устройстве. Понадобится его секретная фраза или резервная копия.</p>
        </EntryOptions>
      </div>
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ welcome */

export function Welcome({ onWatch }: { onWatch: (trigger: HTMLButtonElement) => void }) {
  const start = useStartFlow()
  const { biometry, backup } = useVault()
  return (
    <section className="wallet-entry wallet-welcome" aria-label="EXM">
      <EntryHeader />
      <EntryArtwork />
      <div className="wallet-entry-content">
        <div className="wallet-entry-copy">
          <h1 tabIndex={-1}>Крипто<wbr />кошелёк</h1>
          <p>Ключи хранятся на этом устройстве.</p>
        </div>
        <div className="wallet-entry-actions">
        <PrimaryButton id="wallet-entry-create" className="wallet-entry-primary" onClick={() => start("create")}>Создать кошелёк</PrimaryButton>
        <SecondaryButton id="wallet-entry-import" className="wallet-entry-secondary" aria-label="Импортировать существующий кошелёк" onClick={() => start("import")}>Импортировать кошелёк</SecondaryButton>
        <EntryOptions label="Другие способы" id="welcome-more" triggerId="wallet-entry-restore">
          {biometry.available ? <button type="button" onClick={() => start("restore")} className="wallet-entry-disclosure">{restoreLabel(backup)}</button> : null}
          <button type="button" onClick={(event) => onWatch(event.currentTarget)} className="wallet-entry-disclosure">Добавить адрес для просмотра</button>
        </EntryOptions>
        </div>
      </div>
    </section>
  )
}

/**
 * Watch-only addresses cannot sign operations.
 */
export function NeedWalletSheet({ open, onOpenChange, action }: { open: boolean; onOpenChange: (o: boolean) => void; action: "send" | "swap" }) {
  const start = useStartFlow()
  const go = (flow: Flow) => {
    onOpenChange(false)
    start(flow)
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={action === "send" ? "Отправка" : "Обмен"}>
      <div className="flex flex-col gap-4 pb-2">
        <p className="t-body1 c-2 px-1 text-center">{`Этот адрес добавлен только для просмотра. Чтобы ${action === "send" ? "отправлять монеты" : "обменивать монеты"}, создайте или импортируйте свой кошелёк.`}</p>
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={() => go("create")}>Создать кошелёк</PrimaryButton>
          <SecondaryButton onClick={() => go("import")}>У меня есть кошелёк</SecondaryButton>
        </div>
      </div>
    </Sheet>
  )
}
