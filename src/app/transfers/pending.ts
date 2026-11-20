import type { SendResult } from "../vault/signers"

export const TRANSFER_PENDING_PREFIX = "exm.transfer.pending.v1:"
export const TRANSFER_PENDING_EVENT = "exm.transfer.pending.changed"
export type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem" | "length" | "key">
export type TransferAsset = { id: string; symbol: string; decimals: number }
export type PendingTransfer = {
  id: string
  owner: string
  networkId: string
  asset: TransferAsset
  to: string
  amount: string
  fee: string
  createdAt: number
  hashBeforeBroadcast?: true
  state: "intent" | "prepared" | "broadcast" | "uncertain" | "confirmed" | "failed"
  result?: SendResult
}

const canonicalOwner = (owner: string) => /^0x[0-9a-f]{40}$/i.test(owner) ? owner.toLowerCase() : owner
export const transferPendingKey = (owner: string, networkId: string) => `${TRANSFER_PENDING_PREFIX}${networkId}:${canonicalOwner(owner)}`
export const isUnresolvedTransfer = (item: PendingTransfer) => item.state !== "confirmed" && item.state !== "failed"

function valid(item: unknown): item is PendingTransfer {
  if (!item || typeof item !== "object") return false
  const value = item as PendingTransfer
  return typeof value.id === "string" && value.id.length >= 16 && typeof value.owner === "string" && value.owner.length > 0 &&
    typeof value.networkId === "string" && value.networkId.length > 0 && typeof value.to === "string" && value.to.length > 0 &&
    typeof value.amount === "string" && /^\d+$/.test(value.amount) && typeof value.fee === "string" && /^\d+$/.test(value.fee) &&
    Number.isSafeInteger(value.createdAt) && value.createdAt > 0 && !!value.asset && typeof value.asset.id === "string" &&
    (value.hashBeforeBroadcast === undefined || value.hashBeforeBroadcast === true) &&
    typeof value.asset.symbol === "string" && Number.isSafeInteger(value.asset.decimals) && value.asset.decimals >= 0 && value.asset.decimals <= 255 &&
    ["intent", "prepared", "broadcast", "uncertain", "confirmed", "failed"].includes(value.state) &&
    (!value.result || typeof value.result.hash === "string" && value.result.hash.length > 0 && typeof value.result.url === "string" && typeof value.result.label === "string" && ["broadcast", "confirmed"].includes(value.result.status))
}

export function readPendingTransfer(owner: string, networkId: string, storage: StorageAccess = localStorage): PendingTransfer | null {
  try {
    const raw = storage.getItem(transferPendingKey(owner, networkId))
    if (raw === null) return null
    const item: unknown = JSON.parse(raw)
    if (!valid(item) || canonicalOwner(item.owner) !== canonicalOwner(owner) || item.networkId !== networkId) throw new Error("Invalid transfer record")
    return item
  } catch {
    throw new Error("Не удалось прочитать незавершённый перевод на этом устройстве. Подпись остановлена.")
  }
}

function changed() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRANSFER_PENDING_EVENT))
}

function persist(item: PendingTransfer, storage: StorageAccess) {
  if (!valid(item)) throw new Error("Данные перевода не прошли проверку")
  try {
    storage.setItem(transferPendingKey(item.owner, item.networkId), JSON.stringify(item))
    if (JSON.stringify(readPendingTransfer(item.owner, item.networkId, storage)) !== JSON.stringify(item)) throw new Error("Read-back differs")
  } catch {
    throw new Error("Не удалось сохранить незавершённый перевод на этом устройстве. Подпись остановлена.")
  }
  changed()
}

type LegacyTransfer = { assetId: string; to: string; amount: string; result?: SendResult }
const canonicalBinding = (value: string) => /^0x[0-9a-f]+$/i.test(value) ? value.toLowerCase() : value

function readLegacyTransfers(owner: string, networkId: string, storage: StorageAccess): LegacyTransfer[] {
  try {
    if (!Number.isSafeInteger(storage.length) || storage.length < 0 || typeof storage.key !== "function") throw new Error("Storage enumeration unavailable")
    const suffix = `:${owner.toLowerCase()}`
    const nativeKey = `exm.send.outcome.v1:${networkId}${suffix}`
    const tokenPrefix = `exm.token-send.outcome.v1:${networkId}:`
    const transfers: LegacyTransfer[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (!key || key !== nativeKey && !(key.startsWith(tokenPrefix) && key.endsWith(suffix))) continue
      const value: unknown = JSON.parse(storage.getItem(key) ?? "null")
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid prior outcome")
      const legacy = value as { kind?: unknown; to?: unknown; value?: unknown; amount?: unknown; result?: SendResult }
      const amount = key === nativeKey ? legacy.value : legacy.amount
      const assetId = key === nativeKey ? "native" : key.slice(tokenPrefix.length, -suffix.length)
      const result = legacy.result
      if ((legacy.kind !== "uncertain" && legacy.kind !== "done") || typeof legacy.to !== "string" || !legacy.to ||
        typeof amount !== "string" || !/^\d+$/.test(amount) || !assetId ||
        (legacy.kind === "done" && !result) || (result !== undefined && (!result || typeof result !== "object" || Array.isArray(result) || typeof result.hash !== "string" || !result.hash ||
          typeof result.url !== "string" || typeof result.label !== "string" || !["broadcast", "confirmed"].includes(result.status)))) throw new Error("Prior transfer cannot be identified")
      transfers.push({ assetId, to: legacy.to, amount, result })
    }
    return transfers
  } catch { throw new Error("Не удалось прочитать сохранённые переводы. Подпись остановлена.") }
}

function matchesResolvedTransfer(legacy: LegacyTransfer, current: PendingTransfer | null): boolean {
  return !!current && !isUnresolvedTransfer(current) && !!current.result && !!legacy.result &&
    canonicalBinding(legacy.assetId) === canonicalBinding(current.asset.id) &&
    canonicalBinding(legacy.to) === canonicalBinding(current.to) && legacy.amount === current.amount &&
    canonicalBinding(legacy.result.hash) === canonicalBinding(current.result.hash)
}

export function assertNoPendingTransfer(owner: string, networkId: string, storage: StorageAccess = localStorage): void {
  const current = readPendingTransfer(owner, networkId, storage)
  if (current && isUnresolvedTransfer(current)) throw new Error("В этой сети уже есть незавершённый перевод. Проверьте его статус перед новой отправкой.")
  if (readLegacyTransfers(owner, networkId, storage).some((legacy) => !matchesResolvedTransfer(legacy, current))) throw new Error("В этой сети уже есть незавершённый перевод. Проверьте его статус перед новой отправкой.")
}

/** Caller holds the owner lock; a record from another tab may never be overwritten. */
export function claimPendingTransfer(item: PendingTransfer, storage: StorageAccess = localStorage): void {
  assertNoPendingTransfer(item.owner, item.networkId, storage)
  persist(item, storage)
}

/** Preserve pending outcomes from releases that wrote their result only after broadcast. Caller holds the owner lock. */
export function migrateLegacyTransfer(owner: string, networkId: string, native: TransferAsset, tokens: TransferAsset[], storage: StorageAccess = localStorage): void {
  const current = readPendingTransfer(owner, networkId, storage)
  if (current && isUnresolvedTransfer(current)) return
  try {
    const legacy = readLegacyTransfers(owner, networkId, storage).find((item) => !matchesResolvedTransfer(item, current))
    if (!legacy) return
    const asset = legacy.assetId === "native" ? native : tokens.find((item) => canonicalBinding(item.id) === canonicalBinding(legacy.assetId))
    if (!asset) throw new Error("Unknown prior asset")
    // The caller holds the owner lock; the unresolved journal check above prevents replacing an active intent.
    persist({ id: crypto.randomUUID(), owner, networkId, asset, to: legacy.to, amount: legacy.amount, fee: "0", createdAt: Date.now(), state: legacy.result ? "broadcast" : "uncertain", result: legacy.result ? { ...legacy.result, status: "broadcast" } : undefined }, storage)
  } catch {
    throw new Error("Не удалось восстановить сохранённый перевод. Подпись остановлена.")
  }
}

export function updatePendingTransfer(expected: PendingTransfer, patch: Pick<PendingTransfer, "state"> & { result?: SendResult }, storage: StorageAccess = localStorage): PendingTransfer {
  const current = readPendingTransfer(expected.owner, expected.networkId, storage)
  if (!current || current.id !== expected.id) throw new Error("Запись перевода изменилась. Проверьте её заново.")
  const next = { ...current, ...patch }
  persist(next, storage)
  return next
}

export class TransferPreparationError extends Error {
  constructor() {
    super("Не удалось сохранить хэш до отправки. Отправка остановлена: перевод не передан узлу.")
    this.name = "TransferPreparationError"
  }
}

export function isTransferPreparationError(error: unknown): boolean {
  let current = error
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth++) {
    if (current instanceof TransferPreparationError || (current as { name?: string }).name === "TransferPreparationError") return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/** Called by the local signer after it validates the signed bytes against this locked intent, before returning bytes to the RPC transport. */
export function rememberPreparedTransfer(owner: string, networkId: string, result: SendResult, storage: StorageAccess = localStorage): void {
  try {
    const current = readPendingTransfer(owner, networkId, storage)
    if (!current || current.state !== "intent" || result.status !== "broadcast" || !/^0x[0-9a-f]{64}$/i.test(result.hash)) throw new Error("No owned signing intent")
    updatePendingTransfer(current, { state: "prepared", result }, storage)
  } catch { throw new TransferPreparationError() }
}

/** Only a proved cancellation before broadcast or a definite node rejection may discard an intent. */
export function clearRejectedTransfer(expected: PendingTransfer, storage: StorageAccess = localStorage): void {
  const current = readPendingTransfer(expected.owner, expected.networkId, storage)
  if (!current || current.id !== expected.id) throw new Error("Запись перевода изменилась. Проверьте её заново.")
  try {
    storage.removeItem(transferPendingKey(expected.owner, expected.networkId))
    if (readPendingTransfer(expected.owner, expected.networkId, storage) !== null) throw new Error("Record remains")
  } catch { throw new Error("Не удалось сохранить отмену перевода. Проверьте запись на этом устройстве.") }
  changed()
}

type TransferLocks = Pick<LockManager, "request">
export async function withTransferSigningLock<T>(owner: string, networkId: string, action: () => Promise<T>, locks: TransferLocks | undefined = typeof navigator === "undefined" ? undefined : navigator.locks): Promise<T> {
  if (!locks) throw new Error("Браузер не поддерживает защиту от повторной отправки из другой вкладки. Подпись остановлена.")
  // EVM shares its lock with swaps and allowance revocations, including across networks.
  const key = /^0x[0-9a-f]{40}$/i.test(owner) ? `exm.mainnet.write.${owner.toLowerCase()}` : `exm.transfer.write.${networkId}:${owner}`
  return locks.request(key, { mode: "exclusive", ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error("Для этого адреса уже выполняется операция в другой вкладке. Проверьте её результат.")
    return action()
  })
}

export const isInterruptedPreparation = (item: PendingTransfer | null) => !!item && /^0x[0-9a-f]{40}$/i.test(item.owner) && item.hashBeforeBroadcast === true && item.state === "intent" && !item.result

/** The current EVM signer cannot return bytes to its HTTP transport before persisting a prepared hash. */
export async function resetInterruptedPreparation(expected: PendingTransfer, storage: StorageAccess = localStorage, locks?: TransferLocks): Promise<void> {
  return withTransferSigningLock(expected.owner, expected.networkId, async () => {
    const current = readPendingTransfer(expected.owner, expected.networkId, storage)
    if (!current || current.id !== expected.id || !isInterruptedPreparation(current)) throw new Error("Нельзя доказать остановку до передачи узлу. Проверьте статус перевода.")
    clearRejectedTransfer(current, storage)
  }, locks ?? (typeof navigator === "undefined" ? undefined : navigator.locks))
}
