import { argon2idAsync } from "@noble/hashes/argon2.js"

export const VAULT_STORAGE_KEY = "exm.vault.v1"
const KEY = VAULT_STORAGE_KEY
const LEGACY_ITERATIONS = 600_000
const ARGON2_COST = { m: 32 * 1024, t: 3, p: 1, dkLen: 32, asyncTick: 12 }

type Stored = { v: 1 | 2; salt: string; iv: string; ct: string; created: number }

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function aesKey(password: string, salt: Uint8Array, version: Stored["v"]) {
  const passwordBytes = new TextEncoder().encode(password)
  if (version === 2) {
    const raw = await argon2idAsync(passwordBytes, salt, ARGON2_COST).finally(() => passwordBytes.fill(0))
    return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]).finally(() => raw.fill(0))
  }
  const base = await crypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveKey"]).finally(() => passwordBytes.fill(0))
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: LEGACY_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

function cipherParams(iv: Uint8Array, version: Stored["v"], created: number): AesGcmParams {
  const params: AesGcmParams = { name: "AES-GCM", iv: iv as BufferSource }
  if (version === 2) params.additionalData = new TextEncoder().encode(`EXM vault v2:${created}`)
  return params
}

export function hasVault(): boolean {
  try {
    return !!localStorage.getItem(KEY)
  } catch {
    return false
  }
}

/** Exact record identity, including ciphertext: used to reject an unlock superseded in another tab. */
export function vaultSnapshot(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export async function saveVault(words: string[], password: string, beforeCommit?: () => void) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const version = 2
  const key = await aesKey(password, salt, version)
  const created = Date.now()
  const plain = new TextEncoder().encode(words.join(" "))
  const ct = await crypto.subtle.encrypt(cipherParams(iv, version, created), key, plain).finally(() => plain.fill(0))
  const stored: Stored = { v: version, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)), created }
  const snapshot = JSON.stringify(stored)
  beforeCommit?.()
  try {
    localStorage.setItem(KEY, snapshot)
  } catch {
    throw new Error("Браузер не дал сохранить кошелёк: возможно, это приватное окно или хранилище отключено")
  }
  return snapshot
}

/** when the stored vault was written: tells one vault from the next (Face ID records are tied to it) */
export function vaultStamp(): number | null {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored | null
    return stored?.created ?? null
  } catch {
    return null
  }
}

/** the phrase, or null for a wrong password */
export async function openVault(password: string, snapshot = vaultSnapshot()): Promise<string[] | null> {
  let stored: Stored
  try {
    stored = JSON.parse(snapshot ?? "null")
    if ((stored?.v !== 1 && stored?.v !== 2) || !Number.isSafeInteger(stored.created) || typeof stored.salt !== "string" || typeof stored.iv !== "string" || typeof stored.ct !== "string" ||
        stored.salt.length !== 24 || stored.iv.length !== 16 || stored.ct.length > 320) return null
    const salt = unb64(stored.salt), iv = unb64(stored.iv), ct = unb64(stored.ct)
    if (salt.length !== 16 || iv.length !== 12 || ct.length < 16) return null
    const key = await aesKey(password, salt, stored.v)
    const plain = new Uint8Array(await crypto.subtle.decrypt(cipherParams(iv, stored.v, stored.created), key, ct as BufferSource))
    try { return new TextDecoder().decode(plain).split(" ") }
    finally { plain.fill(0) }
  } catch {
    return null
  }
}

export function removeVault() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing stored */
  }
}
