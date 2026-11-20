import { useCallback, useState } from "react"
import { NETWORKS, networkLabel, type HistorySource, type Network } from "./networks"
import type { CustomNetworkRecord } from "./settings"

/** Compatibility types for refusing legacy catalogue requests without loading remote chains. */
export type CatalogEntry = {
  chainId: number
  name: string
  native: { symbol: string; decimals: number; name: string }
  rpcUrls: string[]
  explorers: { name: string; url: string }[]
  opStack: boolean
  builtinId?: string
}
export type RpcProbe = { url: string; ok: true; ms: number } | { url: string; ok: false; reason: string; chainId?: number }
export type PreparedNetwork = { record: CustomNetworkRecord; network: Network; rpc: RpcProbe & { ok: true }; probes: RpcProbe[] }
const unavailable = () => new Error("Пользовательские и тестовые сети не поддерживаются. Доступны только встроенные основные сети.")

export function buildCatalog(_chains: readonly unknown[]): CatalogEntry[] { return [] }
export function searchCatalog(_entries: readonly CatalogEntry[], _query: string, _limit = 50): CatalogEntry[] { return [] }
export async function loadTestnetCatalog(): Promise<CatalogEntry[]> { return [] }
export async function catalogEntry(_chainId: number): Promise<CatalogEntry | undefined> { return undefined }
export async function isTestnetChainId(_chainId: number): Promise<boolean> { return false }
export async function assertCatalogTestnet(_chainId: number | undefined): Promise<never> { throw unavailable() }
export async function probeRpc(url: string, _expectedChainId: number, _signal?: AbortSignal): Promise<RpcProbe> { return { url, ok: false, reason: unavailable().message } }
export async function blockscoutRegistryExplorers(_chainId: number, _signal?: AbortSignal): Promise<string[]> { return [] }
export async function findHistorySource(_chainId: number, _explorers: readonly string[], _signal?: AbortSignal): Promise<{ history: HistorySource; explorer?: string } | null> { return null }

export class BuiltInNetworkError extends Error {
  constructor(readonly network: Network) { super(`${networkLabel(network)} уже есть в кошельке`); this.name = "BuiltInNetworkError" }
}
export class RpcUnreachableError extends Error {
  constructor(readonly entry: CatalogEntry, readonly probes: RpcProbe[]) { super(unavailable().message); this.name = "RpcUnreachableError" }
}
export async function prepareCustomNetwork(chainId: number, _opts: { rpcUrl?: string } = {}, _signal?: AbortSignal): Promise<PreparedNetwork> {
  const builtin = NETWORKS.find((network) => network.chainId === chainId)
  if (builtin) throw new BuiltInNetworkError(builtin)
  throw unavailable()
}
export async function addCustomNetwork(_chainId: number, _opts: { rpcUrl?: string } = {}, _signal?: AbortSignal): Promise<PreparedNetwork> { throw unavailable() }
export function useTestnetCatalog(_query: string) { return { results: [] as CatalogEntry[], total: 0, loading: false, error: null as Error | null } }
export function useAddCustomNetwork() {
  const [error, setError] = useState<Error | null>(null)
  const add = useCallback(async (_chainId: number, _rpcUrl?: string) => { setError(unavailable()); return null }, [])
  return { pending: false, error, needsRpc: null as CatalogEntry | null, added: null as Network | null, add }
}
