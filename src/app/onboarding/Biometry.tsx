/**
 * Face ID unlock and the copy in iCloud, the screens and rows (docs/PASSKEY.md 3.7): the opt-in step
 * after a password, the unlock button with its automatic offer, the two rows of the wallet sheet and
 * the copy's own view. Words follow the device: "Face ID" only where it surely is Face ID (3.6).
 * No new icons on purpose: the project's drawn set has no face, fingerprint, lock or cloud.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { PasskeyError, useVault, type Backup, type Device, type Provider } from "../vault"
import { IconCheck, IconChevronRight } from "../glyph"
import { Group, Notice, PasswordField, PrimaryButton, Screen, SecondaryButton } from "../ui"

/* ------------------------------------------------------------------ words */

export type Words = {
  /** "Face ID", "Touch ID", "Windows Hello"; null keeps the words neutral */
  name: string | null
  /** what the device asks, inside "если не сработает …": "Face ID", "разблокировка экрана" */
  method: string
  /** sentence subject: "iPhone", "Mac", "Телефон" */
  device: string
  /** Apple says "ключ входа", Google and Microsoft "ключ доступа" */
  keyTerm: string
  /** everything that opens the key, the device passcode included: "по Face ID или коду-паролю iPhone" */
  opensWith: string
  switchLabel: string
  offerTitle: string
  enable: string
  open: string
  waiting: string
  unlockHint: string
}

const DEVICE: Record<Device, { device: string; method: string; opensWith: string }> = {
  "iphone-face": { device: "iPhone", method: "Face ID", opensWith: "по Face ID или коду-паролю iPhone" },
  "iphone-touch": { device: "iPhone", method: "Touch ID", opensWith: "по Touch ID или коду-паролю iPhone" },
  ipad: { device: "iPad", method: "Face ID или Touch ID", opensWith: "по Face ID, Touch ID или коду-паролю iPad" },
  mac: { device: "Mac", method: "Touch ID", opensWith: "по Touch ID или паролю Mac" },
  windows: { device: "Windows", method: "Windows Hello", opensWith: "через Windows Hello" },
  android: { device: "Телефон", method: "разблокировка экрана", opensWith: "так же, как экран телефона" },
  other: { device: "Устройство", method: "разблокировка устройства", opensWith: "тем же способом, что и устройство" },
}

/** icloud: the key lives (or would live) in iCloud Keychain, so Apple's word for it */
export function wordsFor(device: Device, name: string | null, icloud: boolean): Words {
  const d = DEVICE[device]
  const base = { name, method: d.method, device: d.device, opensWith: d.opensWith, keyTerm: icloud ? "ключ входа" : "ключ доступа" }
  if (name === "Windows Hello")
    return {
      ...base,
      switchLabel: "Вход через Windows Hello",
      offerTitle: "Входить через Windows Hello?",
      enable: "Включить Windows Hello",
      open: "Открыть через Windows Hello",
      waiting: "Ждём Windows Hello…",
      unlockHint: "Откройте кошелёк через Windows Hello или по паролю",
    }
  if (name)
    return {
      ...base,
      switchLabel: `Вход по ${name}`,
      offerTitle: `Входить по ${name}?`,
      enable: `Включить ${name}`,
      open: `Открыть по ${name}`,
      waiting: `Ждём ${name}…`,
      unlockHint: `Откройте кошелёк по ${name} или по паролю`,
    }
  return {
    ...base,
    name: null,
    switchLabel: "Вход без пароля",
    offerTitle: "Входить без пароля?",
    enable: "Включить вход без пароля",
    open: "Открыть без пароля",
    waiting: "Ждём подтверждения…",
    unlockHint: "Подтвердите вход на устройстве или введите пароль",
  }
}

export function useWords() {
  const { biometry, backup } = useVault()
  return wordsFor(biometry.device, biometry.label, backup.icloud)
}

const PROVIDER: Record<Provider, string> = {
  icloud: "Связка ключей iCloud",
  google: "Менеджер паролей Google",
  windows: "Windows Hello",
  "1password": "1Password",
  bitwarden: "Bitwarden",
  dashlane: "Dashlane",
  samsung: "Samsung Pass",
  proton: "Proton Pass",
  chrome: "профиль Chrome",
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
/** "ключ входа" → "ключе входа" / "ключом входа" */
const keyIn = (w: Words) => w.keyTerm.replace("ключ", "ключе")
const keyBy = (w: Words) => w.keyTerm.replace("ключ", "ключом")

/** the copy's name: "Копия в iCloud" where it lives there, otherwise neutral */
export const backupTitle = (b: Backup) => (b.icloud ? "Копия в iCloud" : "Копия кошелька")
/** the restore entry on the welcome and lock screens */
export const restoreLabel = (b: Backup) => (b.icloud ? "Восстановить из iCloud" : "Восстановить из копии")

const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" })
const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" })
/** "сегодня", "вчера", "15 ноября"; with the time: "сегодня в 14:20" */
export function when(ts: number, withTime = false) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = ts >= start ? "сегодня" : ts >= start - 86_400_000 ? "вчера" : dayFmt.format(ts)
  return withTime ? `${day} в ${timeFmt.format(ts)}` : day
}

const kindOf = (e: unknown) => (e instanceof PasskeyError ? e.kind : "failed")

const textButton = "t-label1 min-h-12 rounded-[var(--radius-group)] transition-colors hover:bg-[var(--fill)] disabled:text-[var(--label-3)]"

/* ------------------------------------------------------------------ the offer */

/**
 * Right after a new wallet or a password unlock: one question, one sentence, the system sheet on
 * "Включить". The sentence says what really opens the key (the device passcode too). "Не сейчас" is
 * remembered; the switch in "Мой кошелёк" stays for later.
 */
export function BiometryOffer() {
  const vault = useVault()
  const w = useWords()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const enable = async () => {
    setBusy(true)
    setError(null)
    try {
      await vault.enableBiometry()
    } catch (e) {
      const kind = kindOf(e)
      if (kind === "no-prf") {
        setRefused(true)
        setError("Выбранный менеджер паролей не поддерживает вход в EXM. Вход останется по паролю, другой менеджер можно выбрать в «Мой кошелёк».")
      } else
        setError(
          kind === "cancelled"
            ? `${w.switchLabel} не включён. Включить можно позже: «Мой кошелёк» на главной.`
            : kind === "domain"
              ? "Ключ входа работает только на защищённом адресе (https). Вход останется по паролю."
              : "Не получилось включить. Пароль работает как прежде, попробовать снова можно в «Мой кошелёк».",
        )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Screen className="wallet-biometry-offer min-h-svh pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="wallet-biometry-brand" aria-hidden="true">EXM</div>
      <div className="wallet-biometry-body flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
        <h1 className="t-h2">{w.offerTitle}</h1>
        <p className="t-body1 c-2 max-w-[340px] text-balance">
          {w.device} сохранит {w.keyTerm} для EXM: кошелёк будет открываться {w.opensWith}, а пароль EXM останется запасным.
        </p>
      </div>
      <p role="alert" className="t-body2 min-h-5 px-1 pb-3 text-center text-[var(--orange)]">
        {error ?? ""}
      </p>
      {refused ? (
        <PrimaryButton onClick={vault.dismissBiometryOffer} autoFocus>
          Продолжить
        </PrimaryButton>
      ) : (
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={enable} disabled={busy} autoFocus>
            {busy ? w.waiting : w.enable}
          </PrimaryButton>
          <button type="button" onClick={vault.dismissBiometryOffer} disabled={busy} className={textButton + " text-[var(--blue)]"}>
            Не сейчас
          </button>
        </div>
      )}
    </Screen>
  )
}

/* ------------------------------------------------------------------ unlock */

/**
 * The unlock screen's Face ID: a button, and one automatic offer when the page is on screen and in
 * focus, after a page load or an idle lock (not after "Заблокировать": the person just closed it).
 * A failure never locks anyone out: onFallback brings the password field.
 */
export function useBiometryUnlock(onFallback: () => void) {
  const vault = useVault()
  const w = useWords()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enabled = vault.status === "locked" && vault.biometry.enabled
  const running = useRef(false)

  const run = useCallback(
    async (auto = false) => {
      if (running.current) return
      running.current = true
      setBusy(true)
      setError(null)
      try {
        await vault.unlockWithBiometry()
      } catch (e) {
        const kind = kindOf(e)
        // an automatic offer that was dismissed says nothing: the button is right there
        if (!(auto && kind === "cancelled"))
          setError(
            kind === "cancelled"
              ? "Подтверждение не прошло. Введите пароль или попробуйте ещё раз."
              : kind === "uv"
                ? "Устройство не подтвердило, что это вы. Введите пароль."
                : kind === "mismatch"
                  ? `${w.switchLabel} больше не подходит к этому кошельку и выключен. Введите пароль; включить снова можно в «Мой кошелёк».`
                  : "Не получилось открыть без пароля. Введите пароль.",
          )
        if (!(auto && kind === "cancelled")) onFallback()
      } finally {
        running.current = false
        setBusy(false)
      }
    },
    [vault, w, onFallback],
  )

  const offered = useRef(false)
  useEffect(() => {
    if (!enabled || vault.lockedBy === "manual" || offered.current) return
    const go = () => {
      if (offered.current || document.visibilityState !== "visible" || !document.hasFocus()) return
      offered.current = true
      run(true)
    }
    go()
    window.addEventListener("focus", go)
    document.addEventListener("visibilitychange", go)
    return () => {
      window.removeEventListener("focus", go)
      document.removeEventListener("visibilitychange", go)
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return { enabled, busy, error, words: w, run: () => run(false) }
}

/* ------------------------------------------------------------------ the wallet sheet */

/** Keeper's switch (tonkeeper-web Switch: 51 × 31, blue when on) as a whole row; the row is the control */
function SwitchRow({ label, checked, busy, onChange }: { label: string; checked: boolean; busy: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className="t-label1 flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left disabled:cursor-progress"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200" style={{ background: checked ? "var(--blue-fill)" : "var(--tint)", opacity: busy ? 0.64 : 1 }}>
        <span className="inline-block size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.15),0_3px_1px_rgba(0,0,0,.06)] transition-transform duration-200" style={{ transform: `translateX(${checked ? 22 : 2}px)` }} />
      </span>
    </button>
  )
}

function backupStateText(b: Backup): { text: string; tone?: string; good?: boolean } {
  // the one green of the sheet: the copy was read back and holds this wallet (Uniswap's "Backed up ✓")
  if (b.state === "verified" && b.checkedAt) return { text: `Проверена ${when(b.checkedAt)}`, tone: "var(--green)", good: true }
  if (b.state === "saved") return { text: "Сохранена · не проверена" }
  if (b.state === "missing") return { text: "Не найдена", tone: "var(--orange)" }
  if (b.state === "file") return { text: `Копия подготовлена${b.savedAt ? ` ${dayFmt.format(b.savedAt)}` : ""} · проверьте файл` }
  return { text: "Не сохранена" }
}

/**
 * "Вход по Face ID" and "Копия в iCloud" for the open wallet. Hidden where the device cannot do it;
 * one honest line where it cannot be used here (plain http) or the chosen manager gave no PRF.
 */
export function SecurityGroup({ onBackup }: { onBackup: () => void }) {
  const vault = useVault()
  const w = useWords()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const { biometry, backup } = vault
  if (vault.status !== "unlocked") return null
  if (biometry.insecure)
    return <p className="t-body2 c-2 px-1">{w.switchLabel} и {backup.icloud ? "копия в iCloud" : "копия кошелька"} работают только по защищённому адресу (https), а EXM сейчас открыт без него.</p>
  if (biometry.blocked && !biometry.enabled && backup.state === "none")
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="t-body2 c-2 px-1">Выбранный менеджер паролей не поддерживает вход в EXM. Вход по паролю работает.</p>
        <button type="button" onClick={vault.retryBiometry} className={textButton + " px-1 text-[var(--blue)]"}>
          Попробовать другой менеджер
        </button>
      </div>
    )
  if (!biometry.available && !biometry.enabled && backup.state === "none") return null

  const toggle = async (on: boolean) => {
    setError(null)
    setStale(false)
    if (!on) return vault.disableBiometry()
    setBusy(true)
    try {
      await vault.enableBiometry()
    } catch (e) {
      const kind = kindOf(e)
      if (kind === "no-prf") return
      setError(kind === "cancelled" ? `Подтверждение не прошло. ${w.switchLabel} не включён.` : "Не получилось включить. Попробуйте ещё раз.")
      // a key deleted in the password manager answers like a cancel: offer a fresh one
      setStale(kind === "cancelled" && biometry.keyed && backup.state === "none")
    } finally {
      setBusy(false)
    }
  }
  const state = backupStateText(backup)
  return (
    <section className="flex flex-col gap-2">
      <Group>
        {biometry.available || biometry.enabled ? <SwitchRow label={w.switchLabel} checked={biometry.enabled} busy={busy} onChange={toggle} /> : null}
        {backup.supported || backup.state !== "none" ? (
          <button type="button" onClick={onBackup} className="flex min-h-14 w-full items-center gap-3 px-4 text-left">
            <span className="t-label1 flex-1">{backupTitle(backup)}</span>
            <span className="t-body2 inline-flex shrink-0 items-center gap-1" style={{ color: state.tone ?? "var(--label-2)" }}>
              {state.good ? <IconCheck size={16} /> : null}
              {state.text}
            </span>
            <IconChevronRight size={18} className="c-2 shrink-0" />
          </button>
        ) : null}
      </Group>
      {error ? (
        <p role="alert" className="t-body2 px-1 text-[var(--orange)]">
          {error}
        </p>
      ) : null}
      {stale ? (
        <button
          type="button"
          onClick={() => {
            vault.forgetPasskey()
            toggle(true)
          }}
          className={textButton + " self-start px-1 text-[var(--blue)]"}
        >
          Ключ EXM удалён? Создать новый
        </button>
      ) : null}
    </section>
  )
}

/** the copy's own view inside the wallet sheet: what it is, its state, and the one action */
export function BackupView() {
  const vault = useVault()
  const w = useWords()
  const { backup, biometry } = vault
  const [busy, setBusy] = useState<null | "save" | "check" | "file" | "delete">(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [badPassword, setBadPassword] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [stale, setStale] = useState(false)
  const fileMode = backup.supported === "file" || backup.state === "file"
  const where = backup.icloud ? "в Связке ключей iCloud" : backup.provider ? `в ${PROVIDER[backup.provider]}` : "в менеджере паролей"

  const act = async (what: "save" | "check" | "file" | "delete") => {
    setBusy(what)
    setError(null)
    setDone(null)
    setStale(false)
    try {
      if (what === "check") {
        const ok = await vault.checkBackup()
        if (ok) setDone("Копия проверена: она открывается и хранит этот кошелёк.")
        else setError("Копия не нашлась или не открылась. Сохраните её снова.")
      } else if (what === "delete") {
        await vault.deleteBackup()
        setConfirmDelete(false)
        setDone("Копия удалена.")
      } else if (what === "save") {
        const where = await vault.saveBackup(password)
        setPassword("")
        setDone(where === "file" ? `${cap(w.keyTerm)} на этом устройстве не хранит копию сам: скачайте её файлом.` : "Копия сохранена.")
      } else {
        const f = await vault.backupFile(password)
        setPassword("")
        const url = URL.createObjectURL(new Blob([f.text], { type: "application/json" }))
        const a = document.createElement("a")
        a.href = url
        a.download = f.name
        document.body.append(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setDone("Файл предложен для сохранения. Проверьте, что он появился в загрузках.")
      }
    } catch (e) {
      const kind = kindOf(e)
      if (kind === "password") {
        setBadPassword(true)
        setError("Неверный пароль")
        return
      }
      setStale(kind === "cancelled" && (what === "check" || what === "delete"))
      setError(
        kind === "cancelled"
          ? what === "check"
            ? "Подтверждение не прошло, копия не проверена."
            : what === "delete"
              ? "Подтверждение не прошло, копия не удалена."
              : "Подтверждение не прошло, копия не сохранена."
          : kind === "not-written"
            ? what === "delete"
              ? "Копия не стёрлась. Удалите ключ EXM в менеджере паролей."
              : "Копия не записалась. Попробуйте ещё раз."
            : kind === "mismatch"
              ? "Копия записалась, но этот же ключ её не открывает: полагаться на неё нельзя. Храните секретную фразу."
              : kind === "no-prf"
                ? "Выбранный менеджер паролей не поддерживает шифрование копии."
                : kind === "device-bound"
                  ? `Ключ EXM хранится только на этом устройстве (${backup.provider ? PROVIDER[backup.provider] : "без синхронизации"}): копия в нём не поможет, если устройство пропадёт. Храните секретную фразу.`
                  : kind === "unsupported"
                    ? "На этом устройстве копию из ключа не прочитать. Проверьте её на устройстве, где сохраняли."
                    : "Не получилось. Попробуйте ещё раз.",
      )
    } finally {
      setBusy(null)
    }
  }

  const phrase = "Секретную фразу всё равно храните на бумаге: если пропадут и ключ, и фраза, кошелёк не вернуть."
  /** the phrase leaves the wallet only after its password (Face ID alone may be the device passcode) */
  const passwordField = (
    <div className="flex flex-col gap-2">
      <PasswordField
        id="copy-pw"
        label="Пароль кошелька"
        value={password}
        onChange={(v) => {
          setPassword(v)
          setBadPassword(false)
          setError(null)
        }}
        invalid={badPassword}
        autoComplete="current-password"
        describedBy="copy-pw-hint"
      />
      <p id="copy-pw-hint" className="t-body2 c-2 px-1">
        Секретная фраза покидает устройство только по паролю кошелька.
      </p>
    </div>
  )

  let body: ReactNode
  let action: ReactNode
  if (confirmDelete) {
    body = (
      <p className="t-body1 c-2 px-1">
        Копия пропадёт на всех устройствах {backup.icloud ? "с вашим Apple Account" : "с этим менеджером паролей"}. Кошелёк на этом устройстве останется{biometry.enabled ? `, ${w.switchLabel[0].toLowerCase() + w.switchLabel.slice(1)} тоже` : ""}.
      </p>
    )
    action = (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => act("delete")} disabled={!!busy} className="t-label1 min-h-14 rounded-[var(--radius-group)] bg-[var(--grouped)] text-[var(--red)] transition-colors hover:bg-[var(--fill-press)] disabled:text-[var(--label-3)]">
          {busy === "delete" ? w.waiting : "Удалить копию"}
        </button>
        <SecondaryButton onClick={() => setConfirmDelete(false)} disabled={!!busy}>
          Отмена
        </SecondaryButton>
      </div>
    )
  } else if (fileMode) {
    body = (
      <>
        <p className="t-body1 c-2 px-1">
          Менеджер паролей на этом устройстве не хранит копию рядом с ключом, поэтому она сохраняется файлом. Открыть файл можно только {keyBy(w)} EXM.
          {backup.state === "file" && backup.savedAt ? ` Копия подготовлена ${when(backup.savedAt, true)}. Браузер не подтверждает сохранение файла.` : ""}
        </p>
        <Notice>Проверьте, что файл появился в загрузках, затем перенесите его на облачный диск или флешку. Подготовленная копия ещё не подтверждает возможность восстановления. {phrase}</Notice>
        {passwordField}
      </>
    )
    action = (
      <PrimaryButton onClick={() => act("file")} disabled={!!busy || !password}>
        {busy === "file" ? w.waiting : backup.state === "file" ? "Скачать ещё раз" : "Скачать файл копии"}
      </PrimaryButton>
    )
  } else if (backup.state === "none" || backup.state === "missing") {
    body = (
      <>
        <p className="t-body1 c-2 px-1">
          {backup.state === "missing" ? "Копия не нашлась в ключе: возможно, ключ пересоздан или копию удалили на другом устройстве. " : ""}
          Зашифрованная копия кошелька будет храниться в {keyIn(w)} EXM {where}. После сохранения проверьте, что она открывается и хранит этот кошелёк, прежде чем рассчитывать на восстановление без секретной фразы.
        </p>
        <Notice>
          {backup.icloud ? "Ключом к копии станет ваш Apple Account. " : "Ключом к копии станет аккаунт вашего менеджера паролей. "}
          {phrase}
        </Notice>
        {passwordField}
      </>
    )
    action = (
      <PrimaryButton onClick={() => act("save")} disabled={!!busy || !password}>
        {busy === "save" ? w.waiting : backup.state === "missing" ? "Сохранить снова" : "Сохранить копию"}
      </PrimaryButton>
    )
  } else {
    const checked = backup.state === "verified" && backup.checkedAt
    body = (
      <>
        <p className="t-body1 c-2 px-1">
          {checked ? `Копия проверена ${when(backup.checkedAt!, true)}: она открывается и хранит этот кошелёк.` : `Копия сохранена${backup.savedAt ? ` ${when(backup.savedAt, true)}` : ""}.`}{" "}
          {biometry.enabled ? `Проверяем её при каждом входе ${w.name ? `по ${w.name}` : "без пароля"}.` : "Проверить можно в любой момент."}
        </p>
        <p className="t-body2 c-2 px-1">
          Копия лежит в {keyIn(w)} EXM {where}.
        </p>
        <Notice>{phrase}</Notice>
      </>
    )
    action = (
      <div className="flex flex-col gap-2">
        <SecondaryButton onClick={() => act("check")} disabled={!!busy}>
          {busy === "check" ? w.waiting : "Проверить сейчас"}
        </SecondaryButton>
        <button type="button" onClick={() => setConfirmDelete(true)} disabled={!!busy} className={textButton + " text-[var(--red)]"}>
          Удалить копию
        </button>
      </div>
    )
  }
  return (
    <div className="wallet-backup-view flex flex-col gap-4 pb-2">
      {body}
      <p role="alert" className="t-body2 px-1 text-[var(--orange)] empty:hidden">
        {error ?? ""}
      </p>
      {stale ? (
        <button type="button" onClick={() => (vault.forgetPasskey(), setStale(false), setError(null))} className={textButton + " -mt-3 self-start px-1 text-[var(--blue)]"}>
          Ключ EXM удалён в менеджере паролей? Сохранить копию заново
        </button>
      ) : null}
      <p role="status" className="t-body2 px-1 text-[var(--green)] empty:hidden">
        {done ?? ""}
      </p>
      {action}
    </div>
  )
}

/** what deleting the wallet does to the passkey and the copy, in one or two sentences */
export function deleteNote(b: Backup, w: Words, keyed: boolean) {
  if (b.state === "file") return `Перед удалением проверьте, что файл копии есть в загрузках или другом месте хранения. Восстановление через «${restoreLabel(b)}» зависит от наличия и открытия этого файла. Он открывается только ${keyBy(w)} EXM: не удаляйте ключ, пока нужен файл. Секретная фраза остаётся отдельным способом восстановления.`
  if (b.state === "saved") return `${backupTitle(b)} останется, но ещё не проверена. Перед удалением кошелька откройте «${backupTitle(b)}» и проверьте её. Непроверенная копия не подтверждает возможность восстановления.`
  if (b.state === "verified") return `${backupTitle(b)} останется: по ней кошелёк можно вернуть через «${restoreLabel(b)}». Если копия больше не нужна, сначала удалите её в «${backupTitle(b)}».`
  if (keyed) return `Если EXM с этим кошельком не открыт на других устройствах, ${w.keyTerm} EXM ${b.icloud ? "в приложении «Пароли»" : "в менеджере паролей"} можно удалить.`
  return ""
}
