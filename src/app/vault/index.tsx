/**
 * EXM wallet vault: create / import / unlock / lock / reveal / remove, and the signers screens use.
 * The phrase lives encrypted in this browser (store.ts); unlocked keys live only in memory and are
 * dropped on lock, on tab close, and after 15 minutes without activity.
 *
 * Face ID unlock and the copy in iCloud ride on one passkey per wallet (passkey.ts, docs/PASSKEY.md).
 * While the wallet is open the phrase's entropy stays in memory next to the keys (the array is zeroed
 * on lock), so turning Face ID on needs only the device's own prompt. The phrase leaves the wallet
 * (shown, put into the copy, saved as a file) only after the wallet password: Face ID alone may be the
 * device passcode, and that must not be enough to export the 24 words.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { Network } from "@/lib/chains"
import { shortAddress } from "@/lib/format"
import { addressesOf, checkMnemonic, cleanWords, deriveKeys, newMnemonic, type DerivedKeys } from "./keys"
import { evmFee, evmSend, SigningSessionExpiredError, type SendResult, type SigningGuard } from "./signers"
import { hasVault, openVault, removeVault, saveVault, vaultSnapshot, vaultStamp, VAULT_STORAGE_KEY } from "./store"
import * as pk from "./passkey"
import type { Device, PasskeyRecord, Provider, Sealed, Support } from "./passkey"

export { checkMnemonic, cleanWords, mnemonicWordHint } from "./keys"
export { PasskeyError } from "./passkey"
export type { Device, ErrorKind, Provider } from "./passkey"
export type VaultStatus = "empty" | "locked" | "unlocked"
export type Addresses = { evm: string; solana: string; ton: string; bitcoin: string; bitcoinMainnet: string; bitcoinMainnetXpub: string }
/** why the wallet is locked: the unlock screen offers Face ID by itself only after a start or an idle lock */
export type LockedBy = "start" | "idle" | "manual"

const IDLE_MS = 15 * 60_000
export const MIN_PASSWORD = 15

export type Biometry = {
  /** this device can try it: a platform authenticator, PRF not ruled out, no failure remembered */
  available: boolean
  /** the Face ID unlock record exists */
  enabled: boolean
  device: Device
  /** "Face ID" | "Touch ID" | "Windows Hello"; null when the words must stay neutral (iPad, Android) */
  label: string | null
  /** show the opt-in step now */
  offer: boolean
  /** the chosen password manager gave no PRF once: one honest line and a retry instead of the controls */
  blocked: boolean
  /** opened over plain http (not localhost): passkeys are off, the sheet says why */
  insecure: boolean
  /** this device holds an EXM passkey record (with or without Face ID on) */
  keyed: boolean
}
export type Backup = {
  /** where a copy can live on this device; null hides the feature */
  supported: "passkey" | "file" | null
  state: "none" | "saved" | "verified" | "missing" | "file"
  savedAt?: number
  checkedAt?: number
  provider?: Provider
  /** the copy lives (or would live) in iCloud Keychain */
  icloud: boolean
}

type Ticket = { words: string[]; entropy: Uint8Array; keys: DerivedKeys; credId: string; prf: Uint8Array; sealed: Sealed; fromBlob: boolean; vaultBefore: string | null }

type Ctx = {
  status: VaultStatus
  lockedBy: LockedBy
  addresses?: Addresses
  keys: DerivedKeys | null
  createSigningGuard: (expectedKeys: DerivedKeys) => SigningGuard
  newMnemonic: () => string[]
  create: (words: string[], password: string) => Promise<void>
  importWallet: (words: string[] | string, password: string) => Promise<void>
  unlock: (password: string) => Promise<boolean>
  lock: () => void
  reveal: (password: string) => Promise<string[]>
  remove: () => void

  biometry: Biometry
  backup: Backup
  enableBiometry: () => Promise<void>
  dismissBiometryOffer: () => void
  unlockWithBiometry: () => Promise<void>
  disableBiometry: () => void
  /** after a password manager without PRF: let the person pick another one */
  retryBiometry: () => void
  /** the passkey was deleted in the password manager: forget it here, the next action creates a new one */
  forgetPasskey: () => void
  /** saves the copy (the wallet password first): into the passkey where it can hold one, else the file mode */
  saveBackup: (password: string) => Promise<"passkey" | "file">
  /** reads the copy back and compares it with the open wallet */
  checkBackup: () => Promise<boolean>
  /** erases the copy from the passkey (the key itself stays for Face ID) */
  deleteBackup: () => Promise<void>
  /** the copy as a file (the wallet password first) for devices whose passkeys cannot hold it */
  backupFile: (password: string) => Promise<{ name: string; text: string }>
  /** restore, step 1: one verification, then the copy is opened; returns the wallet it holds */
  readBackup: (file?: File, signal?: AbortSignal) => Promise<{ address: string }>
  /** restore, step 2: a password for this device; Face ID unlock comes on with the same passkey */
  restoreFromPasskey: (password: string) => Promise<void>
  cancelRestore: () => void
}

const VaultContext = createContext<Ctx | null>(null)

export function useVault() {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error("useVault outside VaultProvider")
  return ctx
}

function checkPassword(password: string) {
  if (Array.from(password).length < MIN_PASSWORD) throw new Error(`Пароль должен содержать не менее ${MIN_PASSWORD} символов`)
}

const LABEL: Record<Device, string | null> = {
  "iphone-face": "Face ID",
  "iphone-touch": "Touch ID",
  mac: "Touch ID",
  windows: "Windows Hello",
  ipad: null,
  android: null,
  other: null,
}

function same(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

async function backupMatches(prf: Uint8Array, credId: string, sealed: Sealed, expected: Uint8Array) {
  const decoded = await pk.open(prf, "backup", credId, sealed)
  try { return same(decoded, expected) }
  finally { decoded.fill(0) }
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>(() => (hasVault() ? "locked" : "empty"))
  const [lockedBy, setLockedBy] = useState<LockedBy>("start")
  const [keys, setKeys] = useState<DerivedKeys | null>(null)
  const signingEpoch = useRef(0)
  const liveSigningKeys = useRef<DerivedKeys | null>(null)
  const liveVaultSnapshot = useRef<string | null>(null)
  const idleDeadline = useRef(0)
  const [record, setRecord] = useState<PasskeyRecord | null>(() => (hasVault() ? pk.loadRecord() : null))
  const [support, setSupport] = useState<Support | null>(null)
  const [noPrf, setNoPrf] = useState(() => pk.hasNoPrf())
  const [offerPending, setOfferPending] = useState(false)
  /** the offer just met a password manager without PRF: it stays up to say so */
  const [justRefused, setJustRefused] = useState(false)
  const idle = useRef(0)
  const entropy = useRef<Uint8Array | null>(null)
  const ticket = useRef<Ticket | null>(null)
  const restoreEpoch = useRef(0)
  const device = useMemo(() => pk.detectDevice(), [])

  useEffect(() => {
    let live = true
    pk.detectSupport().then((s) => live && setSupport(s))
    return () => {
      live = false
    }
  }, [])

  const persist = useCallback((r: PasskeyRecord | null) => {
    if (r) pk.saveRecord(r)
    else pk.clearRecord()
    setRecord(r)
  }, [])

  const forgetEntropy = () => {
    entropy.current?.fill(0)
    entropy.current = null
  }

  /** the wallet is open: keys for signing, entropy for Face ID and the copy */
  const opened = useCallback((words: string[], snapshot: string, derived?: DerivedKeys, ent?: Uint8Array) => {
    forgetEntropy()
    const k = derived ?? deriveKeys(words)
    entropy.current = ent ?? pk.wordsToEntropy(words)
    signingEpoch.current++
    liveSigningKeys.current = k
    liveVaultSnapshot.current = snapshot
    idleDeadline.current = Date.now() + IDLE_MS
    setKeys(k)
    setStatus("unlocked")
  }, [])

  const cancelRestore = useCallback(() => {
    restoreEpoch.current++
    ticket.current?.words.fill("")
    ticket.current?.prf.fill(0)
    ticket.current?.entropy.fill(0)
    ticket.current = null
  }, [])

  const lockAs = useCallback((by: LockedBy) => {
    signingEpoch.current++
    liveSigningKeys.current = null
    liveVaultSnapshot.current = null
    idleDeadline.current = 0
    forgetEntropy()
    cancelRestore()
    setKeys(null)
    setLockedBy(by)
    setStatus(hasVault() ? "locked" : "empty")
  }, [cancelRestore])
  const lock = useCallback(() => lockAs("manual"), [lockAs])

  const captureVault = useCallback(() => {
    const epoch = signingEpoch.current
    const snapshot = vaultSnapshot()
    return { snapshot, current: () => signingEpoch.current === epoch && vaultSnapshot() === snapshot }
  }, [])

  const createSigningGuard = useCallback((expectedKeys: DerivedKeys) => {
    const { snapshot, current } = captureVault()
    const check = () => {
      if (!snapshot || snapshot !== liveVaultSnapshot.current || !current() ||
          liveSigningKeys.current !== expectedKeys || Date.now() >= idleDeadline.current)
        throw new SigningSessionExpiredError()
    }
    check()
    return check
  }, [captureVault])

  // A second tab can import or remove the stored wallet while this tab still holds its old keys.
  // Storage events fire only in the other documents, so local create/import is unaffected.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== VAULT_STORAGE_KEY && event.key !== null)) return
      lockAs("manual")
      setRecord(pk.loadRecord())
      setOfferPending(false)
    }
    const onPageHide = () => lockAs("manual")
    window.addEventListener("storage", onStorage)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("pagehide", onPageHide)
    }
  }, [lockAs])

  useEffect(() => {
    if (status !== "unlocked") return
    const checkDeadline = () => {
      window.clearTimeout(idle.current)
      if (!liveSigningKeys.current) return
      const remaining = idleDeadline.current - Date.now()
      if (remaining <= 0) lockAs("idle")
      else idle.current = window.setTimeout(checkDeadline, remaining)
    }
    const onActivity = (event: Event) => {
      if (!event.isTrusted || document.hidden || !liveSigningKeys.current) return
      if (Date.now() < idleDeadline.current) idleDeadline.current = Date.now() + IDLE_MS
      checkDeadline()
    }
    checkDeadline()
    window.addEventListener("pointerdown", onActivity, true)
    window.addEventListener("keydown", onActivity, true)
    document.addEventListener("visibilitychange", checkDeadline)
    window.addEventListener("pageshow", checkDeadline)
    return () => {
      window.clearTimeout(idle.current)
      window.removeEventListener("pointerdown", onActivity, true)
      window.removeEventListener("keydown", onActivity, true)
      document.removeEventListener("visibilitychange", checkDeadline)
      window.removeEventListener("pageshow", checkDeadline)
    }
  }, [status, lockAs])

  const create = useCallback(
    async (words: string[], password: string) => {
      const { current } = captureVault()
      checkPassword(password)
      const error = checkMnemonic(words)
      if (error) throw new Error(error)
      const derived = deriveKeys(words)
      const snapshot = await saveVault(words, password, () => {
        if (!current() || document.hidden) throw new SigningSessionExpiredError()
      })
      // a new wallet here: the old record goes; its passkey stays (a copy or another device may need it)
      persist(null)
      cancelRestore()
      opened(words, snapshot, derived)
      setOfferPending(true)
    },
    [cancelRestore, captureVault, opened, persist],
  )

  const importWallet = useCallback(
    (input: string[] | string, password: string) => create(cleanWords(input), password),
    [create],
  )

  const unlock = useCallback(
    async (password: string) => {
      const { snapshot, current } = captureVault()
      if (!snapshot) return false
      const words = await openVault(password, snapshot)
      if (!words) return false
      try {
        if (!current() || document.hidden) return false
        cancelRestore()
        opened(words, snapshot)
        if (!pk.offerDismissed()) setOfferPending(true)
        return true
      } finally { words.fill("") }
    },
    [cancelRestore, captureVault, opened],
  )

  const reveal = useCallback(async (password: string) => {
    const activeKeys = liveSigningKeys.current
    if (!activeKeys) throw new SigningSessionExpiredError()
    const check = createSigningGuard(activeKeys)
    const words = await openVault(password, liveVaultSnapshot.current)
    try {
      check()
      if (document.hidden) throw new SigningSessionExpiredError()
    } catch (error) {
      words?.fill("")
      throw error
    }
    if (!words) throw new Error("Неверный пароль")
    return words
  }, [createSigningGuard])

  const remove = useCallback(() => {
    removeVault()
    // the passkey is never signalled away here: it is synced, and a copy or another device may rely on it
    persist(null)
    lockAs("manual")
  }, [lockAs, persist])

  /* ------------------------------------------------------------ passkey */

  const canTry = !!support && support.platform && support.prf && !noPrf

  const capturePasskey = useCallback(() => {
    const { snapshot, current } = captureVault()
    const recordBefore = pk.recordSnapshot()
    const check = () => {
      if (!current() || pk.recordSnapshot() !== recordBefore) throw new pk.PasskeyError("cancelled")
    }
    return { snapshot, check }
  }, [captureVault])

  const needOpen = () => {
    const e = entropy.current
    if (!e || !keys) throw new pk.PasskeyError("failed", "Кошелёк заблокирован: введите пароль")
    const checkSession = createSigningGuard(keys)
    const { snapshot, check: checkPasskey } = capturePasskey()
    return { e: e.slice(), addr: keys.evm.address, snapshot, check: () => { checkSession(); checkPasskey() } }
  }
  const bind = (r: PasskeyRecord, addr: string): PasskeyRecord => ({ ...r, vault: vaultStamp() ?? undefined, addr })
  const checkPasswordOf = async (password: string, snapshot: string | null, check: () => void) => {
    const words = await openVault(password, snapshot)
    words?.fill("")
    check()
    if (!words) throw new pk.PasskeyError("password")
  }

  const refuseNoPrf = useCallback(
    (credId: string, rpId: string) => {
      // a key without PRF is useless to EXM on every device: the one case where hiding it is safe
      pk.signalUnknown(credId, rpId)
      pk.markNoPrf()
      setNoPrf(true)
      setJustRefused(true)
      persist(null)
    },
    [persist],
  )

  /** the wallet's passkey and a PRF output from it: reuses the record's key, else creates one */
  const passkeyWithPrf = useCallback(
    async (addr: string, check: () => void): Promise<{ rec: PasskeyRecord; prf: Uint8Array }> => {
      const existing = pk.loadRecord()
      if (existing) {
        const a = await pk.assertPasskey({ credId: existing.credId, transports: existing.transports })
        return { rec: existing, prf: a.prf }
      }
      const c = await pk.createPasskey({ userName: `EXM ${shortAddress(addr, 6, 4)}`, displayName: "Кошелёк EXM" })
      try { check() }
      catch (err) { c.prf?.fill(0); throw err }
      if (!c.prfEnabled) {
        refuseNoPrf(c.credId, c.rpId)
        throw new pk.PasskeyError("no-prf")
      }
      const rec = bind({ v: 1, credId: c.credId, rpId: c.rpId, transports: c.transports, provider: c.provider, largeBlob: c.largeBlob, created: Date.now() }, addr)
      if (c.prf) return { rec, prf: c.prf }
      try {
        const a = await pk.assertPasskey({ credId: c.credId, transports: c.transports })
        return { rec, prf: a.prf }
      } catch (e) {
        if (e instanceof pk.PasskeyError && e.kind === "no-prf") {
          check()
          refuseNoPrf(c.credId, c.rpId)
        }
        throw e
      }
    },
    [refuseNoPrf],
  )

  const enableBiometry = useCallback(async () => {
    const { e, addr, check } = needOpen()
    let prf: Uint8Array | undefined
    try {
      const result = await passkeyWithPrf(addr, check)
      const { rec } = result
      prf = result.prf
      check()
      const unlockSealed = await pk.seal(prf, "unlock", rec.credId, e)
      const copy = rec.copy ?? (await pk.seal(prf, "backup", rec.credId, e))
      check()
      persist({ ...bind(rec, addr), unlock: unlockSealed, copy })
      setOfferPending(false)
    } finally {
      prf?.fill(0)
      e.fill(0)
    }
  }, [keys, capturePasskey, createSigningGuard, passkeyWithPrf, persist])

  const dismissBiometryOffer = useCallback(() => {
    pk.dismissOffer()
    setOfferPending(false)
    setJustRefused(false)
  }, [])

  const unlockWithBiometry = useCallback(async () => {
    const { snapshot, check } = capturePasskey()
    const rec = pk.loadRecord()
    if (!snapshot || !rec?.unlock) throw new pk.PasskeyError("failed", "Вход по Face ID не включён")
    // a record left from another vault (another tab imported a wallet) must not open this one
    if (!rec.addr || rec.vault === undefined || rec.vault !== vaultStamp()) {
      check()
      persist({ ...rec, unlock: undefined })
      throw new pk.PasskeyError("mismatch")
    }
    const read = rec.backup?.where === "passkey"
    const a = await pk.assertPasskey({ credId: rec.credId, transports: rec.transports, read })
    let e: Uint8Array | undefined
    try {
      check()
      try {
        e = await pk.open(a.prf, "unlock", rec.credId, rec.unlock)
      } catch (err) {
        check()
        persist({ ...rec, unlock: undefined })
        throw err
      }
      const words = pk.entropyToWords(e)
      const derived = deriveKeys(words)
      if (rec.addr !== derived.evm.address) {
        check()
        persist({ ...rec, unlock: undefined })
        throw new pk.PasskeyError("mismatch")
      }
      let next = rec
      if (read && rec.backup && a.readAnswered) {
        // the same prompt checks the copy: it must open and hold this very wallet
        const sealed = a.blob ? pk.decodeBlob(a.blob) : null
        let ok = false
        if (sealed) ok = await backupMatches(a.prf, rec.credId, sealed, e).catch(() => false)
        next = { ...rec, backup: ok ? { ...rec.backup, checkedAt: Date.now(), missing: false } : { ...rec.backup, missing: true } }
      }
      check()
      if (document.hidden) throw new pk.PasskeyError("cancelled")
      persist(next)
      cancelRestore()
      opened(words, snapshot, derived, e)
      e = undefined
    } finally {
      e?.fill(0)
      a.prf.fill(0)
    }
  }, [cancelRestore, capturePasskey, opened, persist])

  const disableBiometry = useCallback(() => {
    const rec = pk.loadRecord()
    if (!rec) return
    // the key itself stays: turning Face ID back on reuses it instead of adding another
    persist({ ...rec, unlock: undefined, copy: rec.backup ? rec.copy : undefined })
  }, [persist])

  const retryBiometry = useCallback(() => {
    pk.clearNoPrf()
    setNoPrf(false)
  }, [])

  const forgetPasskey = useCallback(() => persist(null), [persist])

  const saveBackup = useCallback(
    async (password: string): Promise<"passkey" | "file"> => {
      const { e, addr, snapshot, check } = needOpen()
      try {
        await checkPasswordOf(password, snapshot, check)
        const known = pk.loadRecord()
        if (known && pk.deviceBound(known.provider)) throw new pk.PasskeyError("device-bound")
        let rec = known
        let prf: Uint8Array | undefined
        if (!rec || !rec.copy) {
          const got = await passkeyWithPrf(addr, check)
          rec = got.rec
          prf = got.prf
        }
        try {
          if (pk.deviceBound(rec.provider)) throw new pk.PasskeyError("device-bound")
          check()
          const copy = rec.copy ?? (await pk.seal(prf!, "backup", rec.credId, e))
          check()
          if (!rec.largeBlob) {
            persist({ ...bind(rec, addr), copy })
            return "file"
          }
          const a = await pk.assertPasskey({ credId: rec.credId, transports: rec.transports, write: pk.encodeBlob(copy) })
          try {
            if (!a.written) throw new pk.PasskeyError("not-written")
            // the key that will open the copy on another device must open it here, now
            if (!await backupMatches(a.prf, rec.credId, copy, e)) throw new pk.PasskeyError("mismatch")
          } finally {
            a.prf.fill(0)
          }
          check()
          persist({ ...bind(rec, addr), copy, backup: { where: "passkey", savedAt: Date.now() } })
          return "passkey"
        } finally {
          prf?.fill(0)
        }
      } finally {
        e.fill(0)
      }
    },
    [keys, capturePasskey, createSigningGuard, passkeyWithPrf, persist],
  )

  const checkBackup = useCallback(async () => {
    const { e, check } = needOpen()
    try {
      const rec = pk.loadRecord()
      if (!rec?.backup) throw new pk.PasskeyError("no-copy")
      const a = await pk.assertPasskey({ credId: rec.credId, transports: rec.transports, read: true })
      try {
        if (!a.readAnswered) throw new pk.PasskeyError("unsupported")
        const sealed = a.blob ? pk.decodeBlob(a.blob) : null
        const ok = sealed ? await backupMatches(a.prf, rec.credId, sealed, e).catch(() => false) : false
        check()
        persist({ ...rec, backup: ok ? { ...rec.backup, checkedAt: Date.now(), missing: false } : { ...rec.backup, missing: true } })
        return ok
      } finally {
        a.prf.fill(0)
      }
    } finally {
      e.fill(0)
    }
  }, [keys, capturePasskey, createSigningGuard, persist])

  const deleteBackup = useCallback(async () => {
    const { check } = capturePasskey()
    const rec = pk.loadRecord()
    if (!rec?.backup) return
    if (rec.backup.where === "passkey") {
      // an empty write erases the blob; a one-byte marker is the fallback where empty is refused
      for (const blob of [new Uint8Array(0), new Uint8Array([0])]) {
        check()
        const a = await pk.assertPasskey({ credId: rec.credId, transports: rec.transports, write: blob })
        a.prf.fill(0)
        if (a.written) break
        if (blob.length) throw new pk.PasskeyError("not-written")
      }
    }
    check()
    persist({ ...rec, backup: undefined, copy: rec.unlock ? rec.copy : undefined })
  }, [capturePasskey, persist])

  const backupFile = useCallback(
    async (password: string) => {
      const { e, addr, snapshot, check } = needOpen()
      try {
        await checkPasswordOf(password, snapshot, check)
        let rec = pk.loadRecord()
        if (rec && pk.deviceBound(rec.provider)) throw new pk.PasskeyError("device-bound")
        let copy = rec?.copy
        if (!rec || !copy) {
          const got = await passkeyWithPrf(addr, check)
          rec = got.rec
          try {
            if (pk.deviceBound(rec.provider)) throw new pk.PasskeyError("device-bound")
            copy = got.rec.copy ?? (await pk.seal(got.prf, "backup", got.rec.credId, e))
          } finally {
            got.prf.fill(0)
          }
        }
        check()
        persist({ ...bind(rec, addr), copy, backup: { where: "file", savedAt: Date.now() } })
        const day = new Date().toISOString().slice(0, 10)
        return { name: `exm-wallet-copy-${day}.json`, text: JSON.stringify(pk.copyFile(rec, copy), null, 2) }
      } finally {
        e.fill(0)
      }
    },
    [keys, capturePasskey, createSigningGuard, passkeyWithPrf, persist],
  )

  const readBackup = useCallback(
    async (file?: File, signal?: AbortSignal) => {
      cancelRestore()
      const generation = restoreEpoch.current
      const { snapshot: vaultBefore, current } = captureVault()
      let credId: string
      let sealed: Sealed
      let a: pk.Assertion
      if (file) {
        if (file.size > pk.MAX_COPY_FILE_BYTES) throw new pk.PasskeyError("bad-file")
        const f = pk.parseCopyFile(await file.text())
        if (f.rpId !== location.hostname) throw new pk.PasskeyError("domain", "file")
        credId = f.credId
        sealed = { salt: f.salt, iv: f.iv, ct: f.ct }
        a = await pk.assertPasskey({ credId, signal })
      } else {
        a = await pk.assertPasskey({ read: true, signal })
        credId = a.credId
        const s = a.blob ? pk.decodeBlob(a.blob) : null
        if (!s) {
          a.prf.fill(0)
          throw new pk.PasskeyError(a.readAnswered ? "no-copy" : "unsupported")
        }
        sealed = s
      }
      let ent: Uint8Array | undefined
      try {
        ent = await pk.open(a.prf, "backup", credId, sealed)
        if (signal?.aborted || generation !== restoreEpoch.current || !current() || document.hidden) throw new pk.PasskeyError("cancelled")
        const words = pk.entropyToWords(ent)
        const derived = deriveKeys(words)
        ticket.current = { words, entropy: ent, keys: derived, credId, prf: a.prf, sealed, fromBlob: !file, vaultBefore }
        return { address: derived.evm.address }
      } catch (err) {
        a.prf.fill(0)
        ent?.fill(0)
        throw err
      }
    },
    [cancelRestore, captureVault],
  )

  const restoreFromPasskey = useCallback(
    async (password: string) => {
      const t = ticket.current
      if (!t) throw new pk.PasskeyError("failed", "Копия не открыта: начните восстановление заново")
      if (t.vaultBefore !== vaultSnapshot()) {
        cancelRestore()
        throw new pk.PasskeyError("mismatch", "Кошелёк изменился в другой вкладке")
      }
      checkPassword(password)
      const unlockSealed = await pk.seal(t.prf, "unlock", t.credId, t.entropy)
      const snapshot = await saveVault(t.words, password, () => {
        if (ticket.current !== t || t.vaultBefore !== vaultSnapshot() || document.hidden) throw new pk.PasskeyError("cancelled")
      })
      const now = Date.now()
      persist({
        v: 1,
        credId: t.credId,
        rpId: location.hostname,
        largeBlob: t.fromBlob,
        created: now,
        vault: vaultStamp() ?? undefined,
        addr: t.keys.evm.address,
        unlock: unlockSealed,
        copy: t.sealed,
        backup: t.fromBlob ? { where: "passkey", checkedAt: now } : { where: "file", savedAt: now },
      })
      t.prf.fill(0)
      ticket.current = null
      setOfferPending(false)
      opened(t.words, snapshot, t.keys, t.entropy)
      t.words.fill("")
    },
    [cancelRestore, opened, persist],
  )

  const biometry = useMemo<Biometry>(
    () => ({
      available: canTry,
      enabled: !!record?.unlock,
      device,
      label: LABEL[device],
      offer: offerPending && (canTry || justRefused) && status === "unlocked" && !record?.unlock,
      blocked: noPrf && !!support?.platform,
      insecure: !!support?.insecure,
      keyed: !!record,
    }),
    [canTry, record, device, offerPending, justRefused, status, noPrf, support],
  )

  const backup = useMemo<Backup>(() => {
    const b = record?.backup
    const provider = record?.provider
    const supported: Backup["supported"] = record
      ? pk.deviceBound(provider)
        ? null
        : record.largeBlob
          ? "passkey"
          : "file"
      : canTry
        ? support?.largeBlob
          ? "passkey"
          : pk.likelyICloud(device)
            ? "passkey"
            : "file"
        : null
    const state: Backup["state"] = !b ? "none" : b.where === "file" ? "file" : b.missing ? "missing" : b.checkedAt ? "verified" : "saved"
    return { supported, state, savedAt: b?.savedAt, checkedAt: b?.checkedAt, provider, icloud: provider ? provider === "icloud" : pk.likelyICloud(device) }
  }, [record, canTry, support, device])

  const value = useMemo<Ctx>(
    () => ({
      status,
      lockedBy,
      keys,
      createSigningGuard,
      addresses: keys ? addressesOf(keys) : undefined,
      newMnemonic,
      create,
      importWallet,
      unlock,
      lock,
      reveal,
      remove,
      biometry,
      backup,
      enableBiometry,
      dismissBiometryOffer,
      unlockWithBiometry,
      disableBiometry,
      retryBiometry,
      forgetPasskey,
      saveBackup,
      checkBackup,
      deleteBackup,
      backupFile,
      readBackup,
      restoreFromPasskey,
      cancelRestore,
    }),
    [status, lockedBy, keys, createSigningGuard, create, importWallet, unlock, lock, reveal, remove, biometry, backup, enableBiometry, dismissBiometryOffer, unlockWithBiometry, disableBiometry, retryBiometry, forgetPasskey, saveBackup, checkBackup, deleteBackup, backupFile, readBackup, restoreFromPasskey, cancelRestore],
  )
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

/** signing for one network; throws a readable error when the wallet is locked */
export function useSigner(network: Network) {
  const { keys, createSigningGuard } = useVault()
  return useMemo(() => {
    const need = () => {
      if (!keys) throw new Error("Кошелёк заблокирован: введите пароль")
      return keys
    }
    const family = network.family
    return {
      ready: !!keys && family === "evm",
      async fee(to?: string, amount?: bigint): Promise<bigint> {
        const k = need()
        if (family === "evm") return evmFee(k, network, to, amount)
        throw new Error("Эта сеть не поддерживается")
      },
      async minFor(_to: string): Promise<bigint | null> {
        return null
      },
      async send(to: string, amount: bigint, maxNetworkFee?: bigint): Promise<SendResult> {
        const k = need()
        const guard = createSigningGuard(k)
        if (family === "evm") return evmSend(k, network, to, amount, maxNetworkFee, guard)
        throw new Error("Эта сеть не поддерживается")
      },
    }
  }, [keys, network, createSigningGuard])
}
