/** Public recipient addresses only. No seed, key, or transaction data enters this store. */
import { useSyncExternalStore } from "react"
import { chainData, NETWORKS, type ChainFamily } from "@/lib/chains"

export type SavedAddress = {
  id: string
  name: string
  family: ChainFamily
  address: string
}

/** A different address with a familiar beginning and ending is a common address-poisoning trap. */
export function recipientInBook(contacts: SavedAddress[], family: ChainFamily, recipient: string): { exact?: SavedAddress; similar?: SavedAddress } {
  const normalized = (value: string) => family === "evm" ? value.toLowerCase() : value
  const target = normalized(recipient.trim())
  const sameFamily = contacts.filter((item) => item.family === family)
  const exact = sameFamily.find((item) => normalized(item.address) === target)
  if (exact || target.length < 12) return { exact }
  const similar = sameFamily.find((item) => {
    const candidate = normalized(item.address)
    return candidate.length === target.length && candidate !== target &&
      ((candidate.slice(0, 6) === target.slice(0, 6) && candidate.slice(-4) === target.slice(-4)) ||
        (candidate.slice(0, 4) === target.slice(0, 4) && candidate.slice(-6) === target.slice(-6)))
  })
  return { similar }
}

export const ADDRESS_BOOK_KEY = "exm.addressBook.v1"
export const ADDRESS_BOOK_LIMIT = 100
const NAME_LIMIT = 40
const ADDRESS_LIMIT = 128
const families: ChainFamily[] = ["evm", "solana", "ton", "bitcoin"]

const canonicalId = (family: ChainFamily, address: string) => `${family}:${family === "evm" || (family === "bitcoin" && /^tb1/i.test(address)) ? address.toLowerCase() : address}`

/** A contact belongs to an address family, not to a particular EVM testnet. */
export function validateSavedAddress(family: ChainFamily, input: string): string | null {
  const address = input.trim()
  if (!address) return "Введите публичный адрес"
  if (address.length > ADDRESS_LIMIT || /\s/.test(address)) return "Проверьте адрес: в нём не должно быть пробелов"
  const network = NETWORKS.find((item) => item.family === family)
  if (!network) return "Семейство сети недоступно"
  return chainData(network).validateAddress(address)
}

function cleanName(input: string): { value?: string; error?: string } {
  if (/[\u0000-\u001f\u007f]/.test(input)) return { error: "Имя должно быть в одной строке" }
  const value = input.trim().replace(/\s+/g, " ")
  if (!value) return { error: "Введите имя контакта" }
  if (value.length > NAME_LIMIT) return { error: `Имя не длиннее ${NAME_LIMIT} символов` }
  return { value }
}

function parse(): SavedAddress[] {
  try {
    if (typeof localStorage === "undefined") return []
    const saved = JSON.parse(localStorage.getItem(ADDRESS_BOOK_KEY) ?? "null") as { v?: unknown; contacts?: unknown }
    if (!saved || saved.v !== 1 || !Array.isArray(saved.contacts)) return []
    const seen = new Set<string>()
    const contacts: SavedAddress[] = []
    for (const raw of saved.contacts) {
      if (!raw || typeof raw !== "object") continue
      const item = raw as Partial<SavedAddress>
      if (!families.includes(item.family as ChainFamily) || typeof item.name !== "string" || typeof item.address !== "string") continue
      const name = cleanName(item.name)
      if (!name.value || validateSavedAddress(item.family!, item.address)) continue
      const address = item.address.trim()
      const id = canonicalId(item.family!, address)
      if (seen.has(id)) continue
      seen.add(id)
      contacts.push({ id, name: name.value, family: item.family!, address })
      if (contacts.length === ADDRESS_BOOK_LIMIT) break
    }
    return contacts
  } catch {
    return []
  }
}

let snapshot = parse()
const listeners = new Set<() => void>()
const emit = (next: SavedAddress[]) => {
  snapshot = next
  listeners.forEach((listener) => listener())
}
const persist = (next: SavedAddress[]) => {
  try {
    const previous = JSON.parse(localStorage.getItem(ADDRESS_BOOK_KEY) ?? "null") as { v?: number; contacts?: unknown[] } | null
    const archived = previous?.v === 1 && Array.isArray(previous.contacts) ? previous.contacts.filter((item): item is SavedAddress => {
      if (!item || typeof item !== "object") return false
      const contact = item as SavedAddress
      return typeof contact.name === "string" && typeof contact.address === "string" && (contact.family === "ton" || contact.family === "bitcoin" && /^tb1/i.test(contact.address))
    }) : []
    localStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify({ v: 1, contacts: [...next, ...archived] }))
    emit(next)
    return true
  } catch {
    return false
  }
}
const onStorage = (event: StorageEvent) => {
  if (event.key === ADDRESS_BOOK_KEY || event.key === null) emit(parse())
}
const subscribe = (listener: () => void) => {
  if (!listeners.size && typeof window !== "undefined") window.addEventListener("storage", onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size && typeof window !== "undefined") window.removeEventListener("storage", onStorage)
  }
}

export type AddAddressResult = { ok: true; contact: SavedAddress } | { ok: false; error: string }

export function addSavedAddress(input: { name: string; family: ChainFamily; address: string }): AddAddressResult {
  const name = cleanName(input.name)
  if (!name.value) return { ok: false, error: name.error ?? "Введите имя" }
  if (!families.includes(input.family)) return { ok: false, error: "Выберите семейство сети" }
  const address = input.address.trim()
  const error = validateSavedAddress(input.family, address)
  if (error) return { ok: false, error }
  const id = canonicalId(input.family, address)
  if (snapshot.some((item) => item.id === id)) return { ok: false, error: "Этот адрес уже сохранён" }
  if (snapshot.length >= ADDRESS_BOOK_LIMIT) return { ok: false, error: `Можно сохранить не больше ${ADDRESS_BOOK_LIMIT} адресов` }
  const contact = { id, name: name.value, family: input.family, address }
  if (!persist([...snapshot, contact])) return { ok: false, error: "Браузер не дал сохранить адрес. Проверьте настройки хранилища." }
  return { ok: true, contact }
}

export function removeSavedAddress(id: string): boolean {
  if (!snapshot.some((item) => item.id === id)) return false
  return persist(snapshot.filter((item) => item.id !== id))
}

export function renameSavedAddress(id: string, input: string): AddAddressResult {
  const name = cleanName(input)
  if (!name.value) return { ok: false, error: name.error ?? "Введите имя" }
  const current = snapshot.find((item) => item.id === id)
  if (!current) return { ok: false, error: "Контакт больше не сохранён" }
  const contact = { ...current, name: name.value }
  const updated = snapshot.map((item) => item.id === id ? contact : item)
  if (!persist(updated)) return { ok: false, error: "Браузер не дал сохранить имя" }
  return { ok: true, contact }
}

export function useAddressBook() {
  const contacts = useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
  return { contacts, add: addSavedAddress, rename: renameSavedAddress, remove: removeSavedAddress }
}
