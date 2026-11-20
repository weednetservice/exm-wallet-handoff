import { useEffect, useState } from "react"

const KEY = "exm.pending.activity.v1"
const EVENT = "exm.pending.activity.changed"
export type PendingActivity = {
  networkId: string
  owner: string
  hash: string
  recipient: string
  amount: string
  tokenAddress?: string
  createdAt: number
}

function valid(value: unknown): value is PendingActivity {
  if (!value || typeof value !== "object") return false
  const item = value as PendingActivity
  return typeof item.networkId === "string" && typeof item.owner === "string" &&
    (/^0x[0-9a-fA-F]{64}$/.test(item.hash) || /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(item.hash)) && typeof item.recipient === "string" &&
    /^\d+$/.test(item.amount) && (item.tokenAddress === undefined || /^0x[0-9a-fA-F]{40}$/.test(item.tokenAddress)) &&
    Number.isSafeInteger(item.createdAt) && item.createdAt > 0
}

export function readPendingActivity(): PendingActivity[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter(valid) : []
  } catch { return [] }
}

function write(items: PendingActivity[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* the open sheet still shows the broadcast result */ }
  window.dispatchEvent(new Event(EVENT))
}

export function recordPendingActivity(item: PendingActivity) {
  if (!valid(item)) return
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1_000
  const prior = readPendingActivity().filter((row) => row.createdAt >= cutoff && !(row.networkId === item.networkId && row.hash.toLowerCase() === item.hash.toLowerCase()))
  write([item, ...prior].slice(0, 50))
}

export function removePendingActivity(networkId: string, hash: string) {
  const items = readPendingActivity()
  const next = items.filter((item) => item.networkId !== networkId || item.hash.toLowerCase() !== hash.toLowerCase())
  if (next.length !== items.length) write(next)
}

export function usePendingActivity() {
  const [items, setItems] = useState(readPendingActivity)
  useEffect(() => {
    const sync = () => setItems(readPendingActivity())
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync) }
  }, [])
  return items
}
