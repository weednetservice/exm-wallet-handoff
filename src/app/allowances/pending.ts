export type PendingRevoke = { owner: string; token: string; spender: string; hash: string | null; at: number }
export const PENDING_REVOKE_KEY = "exm.allowance.pending.v1"

type StorageAccess = Pick<Storage, "getItem" | "setItem">
const address = /^0x[0-9a-fA-F]{40}$/
const txHash = /^0x[0-9a-fA-F]{64}$/

function valid(value: unknown): value is PendingRevoke {
  if (!value || typeof value !== "object") return false
  const item = value as PendingRevoke
  return address.test(item.owner) && address.test(item.token) && address.test(item.spender) &&
    (item.hash === null || txHash.test(item.hash)) && Number.isSafeInteger(item.at) && item.at > 0
}

function readAll(storage: StorageAccess): Record<string, PendingRevoke> {
  const raw = JSON.parse(storage.getItem(PENDING_REVOKE_KEY) ?? "{}") as unknown
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Запись незавершённых операций повреждена")
  if (valid(raw)) return { [raw.owner.toLowerCase()]: raw }
  const out: Record<string, PendingRevoke> = {}
  for (const [owner, item] of Object.entries(raw)) {
    if (!valid(item) || owner.toLowerCase() !== item.owner.toLowerCase()) throw new Error("Запись незавершённых операций повреждена")
    out[owner.toLowerCase()] = item
  }
  return out
}

export function readPendingRevoke(owner: string | undefined, storage: StorageAccess = localStorage): PendingRevoke | null {
  if (!owner || !address.test(owner)) return null
  try { return readAll(storage)[owner.toLowerCase()] ?? null } catch { return null }
}

/** A pending intent must survive reload before any signing or broadcast begins. */
export function persistPendingRevoke(owner: string, value: PendingRevoke | null, storage: StorageAccess = localStorage): void {
  if (!address.test(owner) || (value && (!valid(value) || value.owner.toLowerCase() !== owner.toLowerCase()))) throw new Error("Операция не прошла проверку")
  let all: Record<string, PendingRevoke>
  try {
    all = readAll(storage)
    if (value) all[owner.toLowerCase()] = value
    else delete all[owner.toLowerCase()]
    storage.setItem(PENDING_REVOKE_KEY, JSON.stringify(all))
    const check = readAll(storage)[owner.toLowerCase()] ?? null
    if (JSON.stringify(check) !== JSON.stringify(value)) throw new Error("Запись не сохранилась")
  } catch {
    throw new Error("Не удалось сохранить незавершённую операцию на этом устройстве. Отзыв остановлен до подписи.")
  }
}

/** Never replace an unresolved revoke, including one created in another tab. */
export function claimPendingRevoke(owner: string, value: PendingRevoke, storage: StorageAccess = localStorage): void {
  if (!address.test(owner) || !valid(value) || value.owner.toLowerCase() !== owner.toLowerCase()) throw new Error("Операция не прошла проверку")
  assertNoPendingRevoke(owner, storage)
  persistPendingRevoke(owner, value, storage)
}

export function assertNoPendingRevoke(owner: string, storage: StorageAccess = localStorage): void {
  if (!address.test(owner)) throw new Error("Адрес кошелька не прошёл проверку")
  try {
    if (readAll(storage)[owner.toLowerCase()]) throw new Error("Незавершённый отзыв уже сохранён")
  } catch (e) {
    if ((e as Error).message === "Незавершённый отзыв уже сохранён") throw e
    throw new Error("Не удалось проверить незавершённые отзывы. Подпись остановлена.")
  }
}

export function clearPendingRevokeIfCurrent(owner: string, expected: PendingRevoke, storage: StorageAccess = localStorage): void {
  const current = readPendingRevoke(owner, storage)
  if (!current || JSON.stringify(current) !== JSON.stringify(expected)) throw new Error("Запись отзыва изменилась. Обновите экран и проверьте её заново.")
  persistPendingRevoke(owner, null, storage)
}

type RevokeLocks = Pick<LockManager, "request">
export async function withRevokeSigningLock<T>(owner: string, action: () => Promise<T>, locks: RevokeLocks | undefined = typeof navigator === "undefined" ? undefined : navigator.locks): Promise<T> {
  if (!address.test(owner)) throw new Error("Адрес кошелька не прошёл проверку")
  if (!locks) throw new Error("Браузер не поддерживает защиту от повторного отзыва из другой вкладки. Подпись остановлена.")
  return locks.request(`exm.mainnet.write.${owner.toLowerCase()}`, { mode: "exclusive", ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error("Для этого адреса уже выполняется отзыв в другой вкладке. Проверьте его результат.")
    return action()
  })
}
