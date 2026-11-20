export const PERSON_AVATAR_COUNT = 16
export const PERSON_AVATAR_STORAGE_PREFIX = "exm.personAvatar.v1:"
export type PersonAvatarKind = "account" | "contact"
export type AvatarStorage = Pick<Storage, "getItem" | "setItem">
export type AvatarRandom = (values: Uint32Array) => void

const cryptoRandom: AvatarRandom = (values) => { globalThis.crypto.getRandomValues(values) }
export const validAvatarIndex = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < PERSON_AVATAR_COUNT

export function sampleUniformIndex(count: number, random: AvatarRandom = cryptoRandom): number {
  if (!Number.isSafeInteger(count) || count < 1 || count > 2 ** 32) throw new RangeError("Invalid avatar range")
  const limit = 2 ** 32 - (2 ** 32 % count)
  const values = new Uint32Array(1)
  for (let attempt = 0; attempt < 64; attempt += 1) {
    random(values)
    if (values[0] < limit) return values[0] % count
  }
  throw new Error("Avatar randomness unavailable")
}

function publicIdentity(value: unknown): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  return /^(?:evm:)?0x[0-9a-f]{40}$/i.test(trimmed) ? trimmed.toLowerCase() : trimmed
}

function fallbackIndex(key: string): number {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619)
  return (hash >>> 0) % PERSON_AVATAR_COUNT
}

function browserStorage(): AvatarStorage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage }
  catch { return null }
}

/** Only a public account identifier or contact ID belongs here; never pass wallet secrets. */
export function createPersonAvatarAllocator({ storage = browserStorage, random = cryptoRandom }: { storage?: () => AvatarStorage | null; random?: AvatarRandom } = {}) {
  const memory = new Map<string, number>()
  return (kind: PersonAvatarKind, identity: string): number => {
    const id = publicIdentity(identity)
    if (!id) return 0
    const key = `${PERSON_AVATAR_STORAGE_PREFIX}${kind}:${encodeURIComponent(id)}`
    let target: AvatarStorage | null = null
    try { target = storage() } catch { /* A decorative preference cannot block the wallet. */ }
    try {
      const saved = target?.getItem(key)
      const parsed = saved !== null && saved !== undefined && /^(?:[0-9]|1[0-5])$/.test(saved) ? Number(saved) : null
      if (validAvatarIndex(parsed)) { memory.set(key, parsed); return parsed }
    } catch { /* Keep the assignment in memory when browser storage is denied. */ }
    let index = memory.get(key)
    if (index === undefined) {
      try { index = sampleUniformIndex(PERSON_AVATAR_COUNT, random) }
      catch { index = fallbackIndex(key) }
      memory.set(key, index)
    }
    try { target?.setItem(key, String(index)) } catch { /* The in-memory assignment remains usable. */ }
    return index
  }
}

export const getPersonAvatarIndex = createPersonAvatarAllocator()
