import type { MainnetAsset } from "./mainnet"

export type PendingSwap = { id?: string; step: "approve" | "swap"; hash: string | null; message: string; delivery?: { owner: string; output: MainnetAsset; minimumOut: string; before?: string } }
export const PENDING_SWAP_KEY = "exm.mainnet.swap.pending.v1"
type StorageAccess = Pick<Storage, "getItem" | "setItem">
const address = /^0x[0-9a-fA-F]{40}$/
const hash = /^0x[0-9a-fA-F]{64}$/
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function valid(value: unknown): value is PendingSwap {
  if (!value || typeof value !== "object") return false
  const item = value as PendingSwap
  const delivery = item.delivery
  return (item.step === "approve" || item.step === "swap") &&
    (item.id === undefined || typeof item.id === "string" && uuid.test(item.id)) &&
    (item.hash === null || typeof item.hash === "string" && hash.test(item.hash)) &&
    typeof item.message === "string" && item.message.length <= 500 &&
    (!delivery || address.test(delivery.owner) && ["ETH", "USDC", "DAI", "USDT"].includes(delivery.output) &&
      /^\d+$/.test(delivery.minimumOut) && (delivery.before === undefined || /^\d+$/.test(delivery.before)))
}

function readAll(storage: StorageAccess): Record<string, PendingSwap> {
  const raw = JSON.parse(storage.getItem(PENDING_SWAP_KEY) ?? "{}") as unknown
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Повреждена запись обмена")
  const out: Record<string, PendingSwap> = {}
  for (const [owner, item] of Object.entries(raw)) {
    if (!address.test(owner) || !valid(item) || item.delivery && item.delivery.owner.toLowerCase() !== owner.toLowerCase()) throw new Error("Повреждена запись обмена")
    out[owner.toLowerCase()] = item
  }
  return out
}

export function readPendingSwap(owner: string | undefined, storage: StorageAccess = localStorage): PendingSwap | null {
  if (!owner || !address.test(owner)) return null
  try { return readAll(storage)[owner.toLowerCase()] ?? null } catch { return null }
}

/** Persist and read back the intent before any mainnet signature is allowed. */
export function persistPendingSwap(owner: string, value: PendingSwap | null, storage: StorageAccess = localStorage): void {
  if (!address.test(owner) || value && (!valid(value) || value.delivery && value.delivery.owner.toLowerCase() !== owner.toLowerCase())) throw new Error("Операция не прошла проверку")
  try {
    const all = readAll(storage)
    if (value) all[owner.toLowerCase()] = value
    else delete all[owner.toLowerCase()]
    storage.setItem(PENDING_SWAP_KEY, JSON.stringify(all))
    const check = readAll(storage)[owner.toLowerCase()] ?? null
    if (JSON.stringify(check) !== JSON.stringify(value)) throw new Error("Запись не сохранилась")
  } catch {
    throw new Error("Не удалось сохранить незавершённый обмен на этом устройстве. Подпись остановлена.")
  }
}

/** A late UI response may only clear the exact operation that is still recorded for this owner. */
export function clearPendingSwapIfCurrent(owner: string, expected: PendingSwap, storage: StorageAccess = localStorage): void {
  const current = readPendingSwap(owner, storage)
  if (!current || JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new Error("Запись операции изменилась. Обновите экран и проверьте её заново.")
  }
  persistPendingSwap(owner, null, storage)
}

export function updatePendingSwap(owner: string, expected: PendingSwap, patch: Partial<Pick<PendingSwap, "hash" | "delivery" | "message">>, storage: StorageAccess = localStorage): PendingSwap {
  const current = readPendingSwap(owner, storage)
  if (!current || JSON.stringify(current) !== JSON.stringify(expected)) throw new Error("Запись операции изменилась. Обновите экран и проверьте её заново.")
  if (current.hash && patch.hash !== undefined && patch.hash !== current.hash) throw new Error("Хэш операции уже сохранён.")
  const next = { ...current, ...patch }
  persistPendingSwap(owner, next, storage)
  return next
}

/** Claim a vacant owner slot. A new attempt may never replace an unresolved one. */
export function claimPendingSwap(owner: string, value: PendingSwap, storage: StorageAccess = localStorage): void {
  if (!address.test(owner) || !valid(value) || !value.id) throw new Error("Операция не прошла проверку")
  assertNoPendingSwap(owner, storage)
  persistPendingSwap(owner, value, storage)
}

/** Strict read for signing decisions; malformed storage must not look like an empty queue. */
export function assertNoPendingSwap(owner: string, storage: StorageAccess = localStorage): void {
  if (!address.test(owner)) throw new Error("Адрес кошелька не прошёл проверку")
  try {
    if (readAll(storage)[owner.toLowerCase()]) throw new Error("Незавершённый обмен уже сохранён")
  } catch (e) {
    if ((e as Error).message === "Незавершённый обмен уже сохранён") throw e
    throw new Error("Не удалось проверить незавершённые обмены. Подпись остановлена.")
  }
}

type SwapLocks = Pick<LockManager, "request">
/** ifAvailable never queues a second tab's stale confirmation behind the first send. */
export async function withSwapSigningLock<T>(owner: string, action: () => Promise<T>, locks: SwapLocks | undefined = typeof navigator === "undefined" ? undefined : navigator.locks): Promise<T> {
  if (!address.test(owner)) throw new Error("Адрес кошелька не прошёл проверку")
  if (!locks) throw new Error("Браузер не поддерживает защиту от повторной отправки из другой вкладки. Подпись остановлена.")
  return locks.request(`exm.mainnet.write.${owner.toLowerCase()}`, { mode: "exclusive", ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error("Для этого адреса уже выполняется обмен в другой вкладке. Проверьте его результат.")
    return action()
  })
}
