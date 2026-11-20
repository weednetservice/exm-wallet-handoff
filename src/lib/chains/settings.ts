import { useSyncExternalStore } from "react"
import { DEFAULT_NETWORK_IDS, NETWORKS, type HistorySource, type Network } from "./networks"

/** Keep the existing key: migration rewrites only this public network preference. */
export const NETWORKS_STORAGE_KEY = "exm.networks.v1"
export type SavedNetworkSettings = { v: 2; enabled: string[] }
export type NetworkPreferenceStorage = Pick<Storage, "getItem" | "setItem">

/** Legacy records remain typed for callers that must reject an old configuration. */
export type CustomNetworkRecord = {
  chainId: number
  name: string
  native: { symbol: string; decimals: number; name: string }
  rpcUrl: string
  rpcFallbacks?: string[]
  explorer: { name: string; url: string } | null
  history: HistorySource | null
  opStack?: boolean
  icon?: string
  addedAt: number
}

export function migrateNetworkSettings(input: unknown): SavedNetworkSettings {
  const saved = input && typeof input === "object" && !Array.isArray(input) ? input as { v?: unknown; enabled?: unknown } : undefined
  const selected = saved && (saved.v === 1 || saved.v === 2) && Array.isArray(saved.enabled) ? saved.enabled : []
  const enabled = DEFAULT_NETWORK_IDS.filter((id) => selected.includes(id))
  return { v: 2, enabled: enabled.length ? enabled : [...DEFAULT_NETWORK_IDS] }
}

/** A failed or blocked write still leaves a safe, migrated in-memory preference. */
export function readNetworkSettings(storage?: NetworkPreferenceStorage): SavedNetworkSettings {
  let input: unknown
  try { input = JSON.parse(storage?.getItem(NETWORKS_STORAGE_KEY) ?? "null") } catch { input = undefined }
  const saved = migrateNetworkSettings(input)
  try { storage?.setItem(NETWORKS_STORAGE_KEY, JSON.stringify(saved)) } catch { /* the current visit still uses migrated mainnets */ }
  return saved
}

const registrationError = () => new Error("Добавление пользовательских и тестовых сетей недоступно. Выберите встроенную основную сеть.")
export const customNetworkId = (chainId: number) => `evm-${chainId}`
export function isAllowedRpcUrl(url: string) {
  try { const parsed = new URL(url); return !parsed.username && !parsed.password && (parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) } catch { return false }
}
export function validRecord(_record: unknown): _record is CustomNetworkRecord { return false }
export function customNetwork(_record: CustomNetworkRecord): Network { throw registrationError() }
export function saveCustomNetwork(_record: CustomNetworkRecord): Network { throw registrationError() }
export function removeCustomNetwork(_id: string) { /* No custom configuration is loaded into the mainnet-only store. */ }

type State = { enabled: string[]; all: Network[]; enabledNetworks: Network[] }
function build(enabled: string[]): State {
  const on = new Set(enabled)
  return { enabled, all: [...NETWORKS], enabledNetworks: NETWORKS.filter((network) => on.has(network.id)) }
}
function storage(): NetworkPreferenceStorage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage } catch { return undefined }
}
function load(): State { return build(readNetworkSettings(storage()).enabled) }
let state = load()
const listeners = new Set<() => void>()
function commit(enabled: string[]) {
  const saved = migrateNetworkSettings({ v: 2, enabled })
  state = build(saved.enabled)
  try { storage()?.setItem(NETWORKS_STORAGE_KEY, JSON.stringify(saved)) } catch { /* retain this visit's choice */ }
  listeners.forEach((listener) => listener())
}
if (typeof window !== "undefined") window.addEventListener("storage", (event) => {
  if (event.key !== NETWORKS_STORAGE_KEY && event.key !== null) return
  state = load()
  listeners.forEach((listener) => listener())
})
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }

export const allNetworks = (): Network[] => state.all
export const enabledNetworks = (): Network[] => state.enabledNetworks
export const customNetworks = (): Network[] => []
export const isNetworkEnabled = (id: string) => state.enabled.includes(id)
export const networkById = (id: string): Network | undefined => state.all.find((network) => network.id === id)
export const networkByChainId = (chainId: number): Network | undefined => state.all.find((network) => network.chainId === chainId)

export function setNetworkEnabled(id: string, on: boolean) {
  if (!state.all.some((network) => network.id === id) || state.enabled.includes(id) === on) return
  const enabled = on ? [...state.enabled, id] : state.enabled.filter((item) => item !== id)
  if (enabled.length) commit(enabled)
}
export function resetNetworks() { commit([...DEFAULT_NETWORK_IDS]) }
export function useEnabledNetworks(): Network[] { return useSyncExternalStore(subscribe, enabledNetworks, enabledNetworks) }
export function useNetworkSettings() {
  const current = useSyncExternalStore(subscribe, () => state, () => state)
  return { all: current.all, enabled: current.enabledNetworks, custom: [] as Network[], isEnabled: (id: string) => current.enabled.includes(id), setEnabled: setNetworkEnabled, saveCustom: saveCustomNetwork, removeCustom: removeCustomNetwork, reset: resetNetworks }
}
