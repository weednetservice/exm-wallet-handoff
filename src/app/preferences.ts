import { useSyncExternalStore } from "react"

const KEY = "exm.walletNames.v1"
const DEFAULT_NAME = "Мой кошелёк"
const ownerKey = (address?: string) => address?.startsWith("0x") ? address.toLowerCase() : address ?? ""
const validName = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 24 && !/[\u0000-\u001f\u007f]/.test(value)

function read(): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}")
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw).filter(([, value]) => validName(value)))
  } catch { return {} }
}

let names = read()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
const onStorage = (event: StorageEvent) => {
  if (event.key !== KEY && event.key !== null) return
  names = read()
  emit()
}
const subscribe = (listener: () => void) => {
  if (!listeners.size) window.addEventListener("storage", onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) window.removeEventListener("storage", onStorage)
  }
}

export function useWalletName(address?: string) {
  const key = ownerKey(address)
  const name = useSyncExternalStore(subscribe, () => names[key] ?? DEFAULT_NAME)
  const rename = (input: string): { ok: boolean; error?: string } => {
    const next = input.trim().replace(/\s+/g, " ")
    if (!key) return { ok: false, error: "Сначала откройте кошелёк" }
    if (!validName(next)) return { ok: false, error: "Введите название от 1 до 24 символов" }
    const updated = { ...names, [key]: next }
    try { localStorage.setItem(KEY, JSON.stringify(updated)) }
    catch { return { ok: false, error: "Браузер не дал сохранить название" } }
    names = updated
    emit()
    return { ok: true }
  }
  return { name, rename }
}
