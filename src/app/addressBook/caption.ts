import type { SavedAddress } from "./store"
import { shortAddress } from "@/lib/format"

const words = (name: string) => name.trim().split(/\s+/)
const prefix = (name: string) => name.toLocaleLowerCase("ru-RU").slice(0, 5)

/** A small quick-transfer label must distinguish similar names before opening the full recipient. */
export function quickContactCaption(contact: SavedAddress, contacts: SavedAddress[]): string {
  const parts = words(contact.name)
  const first = parts[0]
  const peers = contacts.filter((item) => item.id !== contact.id)
  if (!peers.some((item) => prefix(words(item.name)[0]) === prefix(first))) return first
  const last = parts.at(-1)!
  if (parts.length > 1 && !peers.some((item) => prefix(words(item.name).at(-1)!) === prefix(last))) return last
  return shortAddress(contact.address, 2, 4)
}
