import { useEffect, useState } from "react"
import type { Activity } from "@/lib/chains"

const normalized = (activity: Activity, value: string) => activity.network.family === "evm" || activity.network.family === "bitcoin" ? value.toLowerCase() : value

function sameAsset(a: Activity, b: Activity) {
  if (!a.token || !b.token) return !a.token && !b.token
  return normalized(a, a.token.address) === normalized(b, b.token.address)
}

export function findLiveActivity(selected: Activity, activities: readonly Activity[]): Activity | undefined {
  const matches = activities.filter((activity) => activity.network.id === selected.network.id &&
    normalized(activity, activity.hash) === normalized(selected, selected.hash) && sameAsset(activity, selected))
  const exact = matches.find((activity) => normalized(activity, activity.id) === normalized(selected, selected.id))
  if (exact) return exact
  if (!selected.id.startsWith("local:")) return undefined

  // A local transfer has no log index yet. Keep its snapshot if multiple indexed
  // movements of the same asset, amount and recipient could be that transfer.
  const indexed = matches.filter((activity) => !activity.id.startsWith("local:") && activity.amount === selected.amount &&
    (activity.direction === selected.direction || activity.direction === "self") &&
    normalized(activity, activity.counterparty ?? "") === normalized(selected, selected.counterparty ?? ""))
  return indexed.length === 1 ? indexed[0] : undefined
}

const fields = ["id", "hash", "direction", "title", "counterparty", "amount", "token", "unverified", "fee", "status", "network", "explorerUrl"] as const
const sameSnapshot = (a: Activity, b: Activity) => fields.every((field) => a[field] === b[field]) && a.time?.getTime() === b.time?.getTime()

export function useLiveActivitySelection(activities: readonly Activity[]) {
  const [selected, setSelected] = useState<Activity | null>(null)
  const current = selected ? findLiveActivity(selected, activities) ?? selected : null

  useEffect(() => {
    if (selected && current && !sameSnapshot(selected, current)) setSelected(current)
  }, [selected, current])

  return [current, setSelected] as const
}
