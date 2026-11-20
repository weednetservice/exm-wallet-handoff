/**
 * Face ID unlock and the wallet copy in iCloud, through one passkey per wallet (docs/PASSKEY.md).
 *
 * The passkey's PRF extension gives a 32-byte secret only after the device verifies the person
 * (Face ID, Touch ID, Windows Hello, the screen lock). HKDF turns it into AES-256-GCM keys:
 *   "EXM unlock v1"  wraps the phrase's entropy in this browser (localStorage, next to the vault);
 *   "EXM backup v1"  wraps it for the copy kept in the passkey itself (largeBlob) or in a file.
 * The PRF output and the derived keys are never stored. Every assertion must carry the UV flag.
 * Pure functions: no React, no app state; storage helpers touch only `exm.passkey.v1`.
 */
import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

const RECORD_KEY = "exm.passkey.v1"
export const MAX_COPY_FILE_BYTES = 4096
const NO_PRF_KEY = "exm.passkey.noprf.v1"
const OFFER_KEY = "exm.passkey.offer.v1"
const VERSION = 1
/** one PRF input for the whole site; HKDF info and a random salt separate the keys */
const PRF_INPUT = new TextEncoder().encode("exm.prf.v1")
const INFO = { unlock: "EXM unlock v1", backup: "EXM backup v1" } as const
const BLOB_MAGIC = [0x45, 0x58, 0x4d] // "EXM"
const TIMEOUT = 120_000

export type Purpose = keyof typeof INFO
export type Sealed = { salt: string; iv: string; ct: string }
export type Provider = "icloud" | "google" | "windows" | "1password" | "bitwarden" | "dashlane" | "samsung" | "proton" | "chrome"

export type PasskeyRecord = {
  v: 1
  credId: string
  rpId: string
  transports?: string[]
  provider?: Provider
  /** the credential can hold the copy itself (largeBlob) */
  largeBlob: boolean
  created: number
  /** which vault this record belongs to (the vault's `created`) and its EVM address: checked on every open */
  vault?: number
  addr?: string
  /** Face ID unlock: entropy sealed with the unlock key */
  unlock?: Sealed
  /** entropy sealed with the backup key: what goes into largeBlob or the file */
  copy?: Sealed
  backup?: { where: "passkey" | "file"; savedAt?: number; checkedAt?: number; missing?: boolean }
}

export type ErrorKind =
  | "cancelled" // NotAllowedError / AbortError: the person closed the sheet, timed out, or no key here
  | "exists" // InvalidStateError on create: this device already has our key
  | "domain" // SecurityError: wrong RP ID or not a secure context
  | "unsupported" // no WebAuthn / no platform authenticator
  | "no-prf" // the authenticator did not give a PRF output
  | "uv" // the assertion came without user verification
  | "mismatch" // the sealed data does not open with this key
  | "no-copy" // the passkey holds no copy
  | "not-written" // largeBlob write did not happen
  | "bad-file" // not an EXM copy file
  | "device-bound" // the key never leaves this device (Windows Hello, Chrome profile): a copy in it saves nothing
  | "password" // the wallet password did not match
  | "failed"

export class PasskeyError extends Error {
  kind: ErrorKind
  constructor(kind: ErrorKind, message?: string) {
    super(message ?? kind)
    this.kind = kind
    this.name = "PasskeyError"
  }
}

/* ------------------------------------------------------------------ bytes */

export const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
export function unb64url(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(b + "===".slice((b.length + 3) % 4)), (c) => c.charCodeAt(0))
}
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const utf8 = (s: string) => new TextEncoder().encode(s)
const buf = (u: Uint8Array) => u as BufferSource
const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("")
function equal(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]
  return d === 0
}

/* ------------------------------------------------------------------ phrase ↔ entropy */

/** 24 words → 32 bytes, 12 words → 16 bytes; throws on an invalid phrase */
export const wordsToEntropy = (words: string[]) => mnemonicToEntropy(words.join(" "), wordlist)
export const entropyToWords = (entropy: Uint8Array) => entropyToMnemonic(entropy, wordlist).split(" ")

/* ------------------------------------------------------------------ crypto */

async function aesKey(prf: Uint8Array, salt: Uint8Array, purpose: Purpose) {
  const base = await crypto.subtle.importKey("raw", buf(prf), "HKDF", false, ["deriveKey"])
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(utf8(INFO[purpose])) }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
}

/** AAD: version byte + credential id, so a record moved to another credential does not open */
function aad(credId: string) {
  const id = unb64url(credId)
  const out = new Uint8Array(1 + id.length)
  out[0] = VERSION
  out.set(id, 1)
  return out
}

export async function seal(prf: Uint8Array, purpose: Purpose, credId: string, plain: Uint8Array): Promise<Sealed> {
  const salt = random(32)
  const iv = random(12)
  const key = await aesKey(prf, salt, purpose)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv), additionalData: buf(aad(credId)) }, key, buf(plain)))
  return { salt: b64url(salt), iv: b64url(iv), ct: b64url(ct) }
}

/** the plaintext, or PasskeyError("mismatch") when the key, the credential or the bytes are wrong */
export async function open(prf: Uint8Array, purpose: Purpose, credId: string, sealed: Sealed): Promise<Uint8Array> {
  try {
    const key = await aesKey(prf, unb64url(sealed.salt), purpose)
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(unb64url(sealed.iv)), additionalData: buf(aad(credId)) }, key, buf(unb64url(sealed.ct))))
  } catch {
    throw new PasskeyError("mismatch")
  }
}

/** the copy as it lives in largeBlob: "EXM" · version · salt(32) · iv(12) · ciphertext */
export function encodeBlob(s: Sealed): Uint8Array {
  const salt = unb64url(s.salt)
  const iv = unb64url(s.iv)
  const ct = unb64url(s.ct)
  const out = new Uint8Array(4 + salt.length + iv.length + ct.length)
  out.set(BLOB_MAGIC, 0)
  out[3] = VERSION
  out.set(salt, 4)
  out.set(iv, 36)
  out.set(ct, 48)
  return out
}
export function decodeBlob(b: Uint8Array): Sealed | null {
  if (![80, 84, 88, 92, 96].includes(b.length) || b[0] !== BLOB_MAGIC[0] || b[1] !== BLOB_MAGIC[1] || b[2] !== BLOB_MAGIC[2] || b[3] !== VERSION) return null
  return { salt: b64url(b.slice(4, 36)), iv: b64url(b.slice(36, 48)), ct: b64url(b.slice(48)) }
}

/* ------------------------------------------------------------------ the copy as a file */

export type CopyFile = { format: "exm-wallet-copy"; v: 1; rpId: string; credId: string; created: string } & Sealed

export function copyFile(rec: PasskeyRecord, sealed: Sealed): CopyFile {
  return { format: "exm-wallet-copy", v: 1, rpId: rec.rpId, credId: rec.credId, created: new Date().toISOString(), ...sealed }
}
export function parseCopyFile(text: string): CopyFile {
  if (text.length > MAX_COPY_FILE_BYTES) throw new PasskeyError("bad-file")
  try {
    const f = JSON.parse(text)
    const validBytes = (value: unknown, ...lengths: number[]) =>
      typeof value === "string" && /^[\w-]+$/.test(value) && lengths.includes(unb64url(value).length)
    if (f?.format === "exm-wallet-copy" && f.v === 1 && typeof f.rpId === "string" && f.rpId.length <= 253 &&
        typeof f.credId === "string" && /^[\w-]{2,1364}$/.test(f.credId) && unb64url(f.credId).length > 0 &&
        validBytes(f.salt, 32) && validBytes(f.iv, 12) && validBytes(f.ct, 32, 36, 40, 44, 48)) return f as CopyFile
  } catch {
    /* not JSON */
  }
  throw new PasskeyError("bad-file")
}

/* ------------------------------------------------------------------ authenticator data */

const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_AT = 0x40

/** rpIdHash must be ours, and both presence and verification flags set; returns the AAGUID when present */
export async function checkAuthData(ad: Uint8Array, rpId: string): Promise<{ aaguid?: string }> {
  if (ad.length < 37) throw new PasskeyError("failed", "authenticator data too short")
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf(utf8(rpId))))
  if (!equal(ad.slice(0, 32), hash)) throw new PasskeyError("domain")
  const flags = ad[32]
  if (!(flags & FLAG_UP) || !(flags & FLAG_UV)) throw new PasskeyError("uv")
  return flags & FLAG_AT && ad.length >= 53 ? { aaguid: hex(ad.slice(37, 53)) } : {}
}

/** authData from a CBOR attestation object, for browsers without getAuthenticatorData() */
function authDataFromAttestation(att: Uint8Array): Uint8Array {
  let p = 0
  const head = () => {
    const b = att[p++]
    const major = b >> 5
    let n = b & 31
    if (n === 24) n = att[p++]
    else if (n === 25) n = (att[p++] << 8) | att[p++]
    else if (n === 26) n = ((att[p++] << 24) | (att[p++] << 16) | (att[p++] << 8) | att[p++]) >>> 0
    return { major, n }
  }
  const skip = (): unknown => {
    const { major, n } = head()
    if (major === 2 || major === 3) {
      const v = att.slice(p, p + n)
      p += n
      return major === 3 ? new TextDecoder().decode(v) : v
    }
    if (major === 4) for (let i = 0; i < n; i++) skip()
    if (major === 5) for (let i = 0; i < n * 2; i++) skip()
    return n
  }
  const { major, n } = head()
  if (major !== 5) throw new PasskeyError("failed", "attestation is not a map")
  for (let i = 0; i < n; i++) {
    const k = skip()
    const v = skip()
    if (k === "authData" && v instanceof Uint8Array) return v
  }
  throw new PasskeyError("failed", "no authData")
}

const PROVIDERS: Record<string, Provider> = {
  fbfc3007154e4ecc8c0b6e020557d7bd: "icloud", // Apple Passwords
  dd4ec289e01d41c9bb8970fa845d4bf2: "icloud", // iCloud Keychain (Managed)
  ea9b8d664d011d213ce4b6b48cb575d4: "google",
  "08987058cadc4b81b6e130de50dcbe96": "windows",
  "9ddd1817af5a4672a2b93e3dd95000a9": "windows",
  "6028b017b1d44c02b4b3afcdafc96bb2": "windows",
  bada5566a7aa401fbd9645619a55120d: "1password",
  d548826e79b4db40a3d811116f7e8349: "bitwarden",
  "531126d6e717415c93203d9aa6981239": "dashlane",
  "53414d53554e47000000000000000000": "samsung",
  "50726f746f6e5061737350726f746f6e": "proton",
  adce000235bcc60a648b0b25f1f05503: "chrome",
}

/* ------------------------------------------------------------------ errors */

function classify(e: unknown): PasskeyError {
  if (e instanceof PasskeyError) return e
  const name = e instanceof DOMException || e instanceof Error ? e.name : ""
  const message = e instanceof Error ? e.message : String(e)
  if (name === "NotAllowedError" || name === "AbortError") return new PasskeyError("cancelled", message)
  if (name === "InvalidStateError") return new PasskeyError("exists", message)
  if (name === "SecurityError") return new PasskeyError("domain", message)
  if (name === "NotSupportedError") return new PasskeyError("unsupported", message)
  return new PasskeyError("failed", message)
}

/* ------------------------------------------------------------------ support */

export type Support = {
  /** a platform authenticator that verifies the person exists */
  platform: boolean
  /** PRF is not ruled out: only an explicit `false` from the browser rules it out (Safari may omit the key) */
  prf: boolean
  /** the browser said largeBlob is there (`true`); unknown counts as no, the credential tells for sure */
  largeBlob: boolean
  /** not https and not localhost: WebAuthn is off, the screens say why instead of hiding silently */
  insecure: boolean
}
const NO_SUPPORT: Support = { platform: false, prf: false, largeBlob: false, insecure: false }

export async function detectSupport(): Promise<Support> {
  try {
    if (!window.isSecureContext) return { ...NO_SUPPORT, insecure: true }
    const PKC = window.PublicKeyCredential as (typeof PublicKeyCredential & { getClientCapabilities?: () => Promise<Record<string, boolean>> }) | undefined
    if (!PKC || !navigator.credentials?.create) return NO_SUPPORT
    const platform = await PKC.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false)
    const caps = PKC.getClientCapabilities ? await PKC.getClientCapabilities().catch(() => ({}) as Record<string, boolean>) : {}
    // a capability flag is not a promise (WebAuthn L3): a missing key is unknown, create() decides
    return { platform, prf: caps["extension:prf"] !== false, largeBlob: caps["extension:largeBlob"] === true, insecure: false }
  } catch {
    return NO_SUPPORT
  }
}

/** keys that never leave this device: Face ID works with them, a copy in them protects against nothing */
export const deviceBound = (p?: Provider) => p === "windows" || p === "chrome"

/** what the device is, for the words "Face ID", "Touch ID", "Windows Hello" (docs/PASSKEY.md 3.6) */
export type Device = "iphone-face" | "iphone-touch" | "ipad" | "mac" | "windows" | "android" | "other"

export function detectDevice(): Device {
  const ua = navigator.userAgent
  // every home-button iPhone is 16:9 (1.78); every Face ID iPhone is above 2, Display Zoom included (320 × 693)
  if (/iPhone|iPod/.test(ua)) return Math.max(screen.width, screen.height) / Math.min(screen.width, screen.height) > 2 ? "iphone-face" : "iphone-touch"
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ipad"
  if (/Macintosh|Mac OS X/.test(ua)) return "mac"
  if (/Windows/.test(ua)) return "windows"
  if (/Android/.test(ua)) return "android"
  return "other"
}

/** passkeys on this device most likely sync through iCloud Keychain: any iOS browser, Safari on a Mac */
export function likelyICloud(device: Device = detectDevice()) {
  if (device === "iphone-face" || device === "iphone-touch" || device === "ipad") return true
  const ua = navigator.userAgent
  return device === "mac" && /Version\/[\d.]+.*Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua)
}

/* ------------------------------------------------------------------ ceremonies */

type PrfOutputs = { enabled?: boolean; results?: { first?: BufferSource } }
type ExtOutputs = { prf?: PrfOutputs; largeBlob?: { supported?: boolean; blob?: ArrayBuffer; written?: boolean } }
const view = (b: BufferSource) => (b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice())

export type Created = {
  credId: string
  rpId: string
  transports: string[]
  /** the authenticator supports PRF for this credential */
  prfEnabled: boolean
  /** PRF output if the authenticator gave one at creation (it may not) */
  prf?: Uint8Array
  largeBlob: boolean
  provider?: Provider
}

/** creates the wallet's passkey (one Face ID); throws PasskeyError */
export async function createPasskey(opts: { userName: string; displayName: string; exclude?: string[] }): Promise<Created> {
  const rpId = location.hostname
  let cred: PublicKeyCredential | null
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: "EXM", id: rpId },
        user: { id: buf(random(16)), name: opts.userName, displayName: opts.displayName },
        challenge: buf(random(32)),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", requireResidentKey: true, userVerification: "required" },
        attestation: "none",
        timeout: TIMEOUT,
        excludeCredentials: (opts.exclude ?? []).map((id) => ({ type: "public-key" as const, id: buf(unb64url(id)) })),
        extensions: { prf: { eval: { first: buf(PRF_INPUT) } }, largeBlob: { support: "preferred" }, credProps: true } as AuthenticationExtensionsClientInputs,
        ...{ hints: ["client-device"] },
      },
    })) as PublicKeyCredential | null
  } catch (e) {
    throw classify(e)
  }
  if (!cred) throw new PasskeyError("cancelled")
  const r = cred.response as AuthenticatorAttestationResponse
  const ad = typeof r.getAuthenticatorData === "function" ? new Uint8Array(r.getAuthenticatorData()) : authDataFromAttestation(new Uint8Array(r.attestationObject))
  const { aaguid } = await checkAuthData(ad, rpId)
  const ext = cred.getClientExtensionResults() as ExtOutputs
  const first = ext.prf?.results?.first
  if (first && first.byteLength !== 32) throw new PasskeyError("no-prf")
  return {
    credId: b64url(new Uint8Array(cred.rawId)),
    rpId,
    transports: typeof r.getTransports === "function" ? r.getTransports() : [],
    prfEnabled: ext.prf?.enabled === true || !!first,
    prf: first ? view(first) : undefined,
    largeBlob: ext.largeBlob?.supported === true,
    provider: aaguid ? PROVIDERS[aaguid] : undefined,
  }
}

export type Assertion = {
  credId: string
  prf: Uint8Array
  blob?: Uint8Array
  written?: boolean
  /** a read was asked for and the device answered it (with or without a blob); false: it cannot read here */
  readAnswered: boolean
}

/**
 * One verification (one Face ID). With credId the device asks for that key only; without it the
 * person picks one of the site's keys (restore). Always evaluates PRF; optionally reads or writes
 * the copy. Refuses answers without user verification. Gives up after the timeout even if the
 * browser does not (a rate-limited call can hang), or when `signal` aborts (a screen went away).
 */
export async function assertPasskey(opts: { credId?: string; transports?: string[]; read?: boolean; write?: Uint8Array; signal?: AbortSignal } = {}): Promise<Assertion> {
  const rpId = location.hostname
  const extensions: Record<string, unknown> = { prf: { eval: { first: buf(PRF_INPUT) } } }
  if (opts.write) extensions.largeBlob = { write: buf(opts.write) }
  else if (opts.read) extensions.largeBlob = { read: true }
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), TIMEOUT + 5_000)
  const relay = () => stop.abort()
  opts.signal?.addEventListener("abort", relay)
  let cred: PublicKeyCredential | null
  try {
    if (opts.signal?.aborted) throw new PasskeyError("cancelled")
    cred = (await navigator.credentials.get({
      signal: stop.signal,
      publicKey: {
        challenge: buf(random(32)),
        rpId,
        userVerification: "required",
        timeout: TIMEOUT,
        allowCredentials: opts.credId ? [{ type: "public-key", id: buf(unb64url(opts.credId)), transports: opts.transports as AuthenticatorTransport[] | undefined }] : [],
        extensions: extensions as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null
  } catch (e) {
    throw classify(e)
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener("abort", relay)
  }
  if (!cred || opts.signal?.aborted) throw new PasskeyError("cancelled")
  const r = cred.response as AuthenticatorAssertionResponse
  await checkAuthData(new Uint8Array(r.authenticatorData), rpId)
  const credId = b64url(new Uint8Array(cred.rawId))
  if (opts.credId && credId !== opts.credId) throw new PasskeyError("mismatch")
  const ext = cred.getClientExtensionResults() as ExtOutputs
  const first = ext.prf?.results?.first
  if (!first || first.byteLength !== 32) throw new PasskeyError("no-prf")
  return {
    credId,
    prf: view(first),
    blob: ext.largeBlob?.blob && ext.largeBlob.blob.byteLength ? new Uint8Array(ext.largeBlob.blob) : undefined,
    written: ext.largeBlob?.written,
    readAnswered: !!opts.read && ext.largeBlob !== undefined,
  }
}

/**
 * Asks the passkey provider to hide a key; no-op where unsupported (Safari keeps it). Used only for a
 * key that just proved useless (no PRF): a synced key may be what another device opens EXM with.
 */
export function signalUnknown(credId: string, rpId = location.hostname) {
  try {
    const PKC = window.PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> } | undefined
    PKC?.signalUnknownCredential?.({ rpId, credentialId: credId }).catch(() => {})
  } catch {
    /* nothing to tell */
  }
}

/* ------------------------------------------------------------------ storage */

export function recordSnapshot(): string | null {
  try { return localStorage.getItem(RECORD_KEY) }
  catch { return null }
}

export function loadRecord(): PasskeyRecord | null {
  try {
    const r = JSON.parse(recordSnapshot() ?? "null")
    return r && r.v === 1 && typeof r.credId === "string" ? (r as PasskeyRecord) : null
  } catch {
    return null
  }
}
export function saveRecord(r: PasskeyRecord) {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(r))
  } catch {
    throw new PasskeyError("failed", "Браузер не дал сохранить настройку")
  }
}
export function clearRecord() {
  try {
    localStorage.removeItem(RECORD_KEY)
  } catch {
    /* nothing stored */
  }
}

/** this device's passkeys gave no PRF once: the feature stays hidden here */
export const hasNoPrf = () => flag(NO_PRF_KEY)
export const markNoPrf = () => setFlag(NO_PRF_KEY, String(Date.now()))
/** "Попробовать снова": the person may pick another password manager this time */
export const clearNoPrf = () => {
  try {
    localStorage.removeItem(NO_PRF_KEY)
  } catch {
    /* nothing stored */
  }
}
/** "Не сейчас" on the offer after a password unlock */
export const offerDismissed = () => flag(OFFER_KEY)
export const dismissOffer = () => setFlag(OFFER_KEY, "dismissed")

function flag(key: string) {
  try {
    return !!localStorage.getItem(key)
  } catch {
    return false
  }
}
function setFlag(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode: the offer just comes back */
  }
}
