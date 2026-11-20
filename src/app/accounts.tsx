/**
 * Own wallet addresses take priority over validated mainnet watch-only addresses.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useVault } from "./vault"
import { chainData, NETWORKS, validateBitcoinMainnetAddress, type ChainFamily, type Network } from "@/lib/chains"
import { isLegacyDemoAddress } from "./demo"

export type Source = "wallet" | "watch"
export type AccountMap = Partial<Record<ChainFamily, { address: string; source: Source }>>
export type Account = { address: string; source: Source }

export function selectAccountForNetwork(accounts: AccountMap, bitcoinMainnet: Account | undefined, network: Network): Account | undefined {
  if (network.environment !== "mainnet" || !NETWORKS.some((item) => item.id === network.id)) return undefined
  if (network.id === "bitcoin-mainnet") {
    if (bitcoinMainnet && !validateBitcoinMainnetAddress(bitcoinMainnet.address)) return bitcoinMainnet
    const account = accounts.bitcoin
    return account && !validateBitcoinMainnetAddress(account.address) ? account : undefined
  }
  return accounts[network.family]
}

export function validMainnetWatch(family: ChainFamily, address: string): boolean {
  const network = NETWORKS.find((item) => item.family === family)
  return !!network && !isLegacyDemoAddress(address) && !chainData(network).validateAddress(address)
}

/** Filter only in memory: legacy stored addresses remain available for explicit user management. */
export function activeWatchedAddresses(input: Partial<Record<ChainFamily, string>>): Partial<Record<ChainFamily, string>> {
  return Object.fromEntries(Object.entries(input).filter(([family, address]) => typeof address === "string" && validMainnetWatch(family as ChainFamily, address)))
}

type Ctx = {
  accounts: AccountMap
  bitcoinMainnet?: Account
  bitcoinMainnetXpub?: string
  accountForNetwork: (network: Network) => Account | undefined
  watch: (family: ChainFamily, address: string) => void
  unwatch: (family: ChainFamily) => void
  disconnect: (family: ChainFamily) => Promise<void>
}

const AccountsContext = createContext<Ctx | null>(null)

export function useAccounts() {
  const ctx = useContext(AccountsContext)
  if (!ctx) throw new Error("useAccounts outside AccountsProvider")
  return ctx
}

const STORE = "wallet.watch.v1"
function loadWatched(): Partial<Record<ChainFamily, string>> {
  let saved: Partial<Record<ChainFamily, string>> = {}
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}")
    if (v && typeof v === "object" && !Array.isArray(v)) saved = v
  } catch {
    /* storage unavailable: start empty */
  }
  const shared = watchFromUrl()
  if (!Object.keys(shared).length) return saved
  const merged = { ...saved, ...shared }
  saveWatched(merged)
  return merged
}

/**
 * A shareable view link: /?watch=<address>,<address>… adds supported mainnet addresses as watch-only
 * accounts (the network is recognised from the address), then the parameter is removed from the URL.
 */
function watchFromUrl(): Partial<Record<ChainFamily, string>> {
  const url = new URL(window.location.href)
  const raw = url.searchParams.get("watch")
  if (!raw) return {}
  const out: Partial<Record<ChainFamily, string>> = {}
  for (const part of raw.split(",")) {
    const address = part.trim()
    const family = familyOf(address)
    const network = family && NETWORKS.find((n) => n.family === family)
    if (network && validMainnetWatch(family!, address)) out[family!] = address
  }
  url.searchParams.delete("watch")
  window.history.replaceState(null, "", url.pathname + url.search + url.hash)
  return out
}

/** which chain an address belongs to, from its shape */
export function familyOf(address: string): ChainFamily | null {
  const a = address.trim()
  if (/^0x/i.test(a)) return "evm"
  if (/^bc1/i.test(a) || (/^[13]/.test(a) && !validateBitcoinMainnetAddress(a))) return "bitcoin"
  if (/^tb1/i.test(a)) return null
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return "solana"
  return null
}
function saveWatched(v: Partial<Record<ChainFamily, string>>) {
  try {
    localStorage.setItem(STORE, JSON.stringify(v))
  } catch {
    /* private mode or blocked storage: watching still works for this visit */
  }
}

type Connected = { connected: Partial<Record<ChainFamily, string>>; bitcoinMainnet?: string; bitcoinMainnetXpub?: string; disconnect: (f: ChainFamily) => Promise<void> }

function Provider({ connected, children }: { connected: Connected; children: ReactNode }) {
  const [watched, setWatched] = useState(loadWatched)

  const watch = useCallback((family: ChainFamily, address: string) => {
    if (!validMainnetWatch(family, address.trim())) return
    setWatched((w) => {
      const next = { ...w, [family]: address.trim() }
      saveWatched(next)
      return next
    })
  }, [])
  const unwatch = useCallback((family: ChainFamily) => {
    setWatched((w) => {
      const next = { ...w }
      delete next[family]
      saveWatched(next)
      return next
    })
  }, [])

  const accounts = useMemo(() => {
    const out: AccountMap = {}
    const active = activeWatchedAddresses(watched)
    for (const f of ["evm", "solana", "bitcoin"] as ChainFamily[]) {
      const c = connected.connected[f]
      const w = active[f]
      if (c) out[f] = { address: c, source: "wallet" }
      else if (w) out[f] = { address: w, source: "watch" }
    }
    return out
  }, [connected.connected, watched])

  const bitcoinMainnet = useMemo<Account | undefined>(() => connected.bitcoinMainnet
    ? { address: connected.bitcoinMainnet, source: "wallet" }
    : undefined, [connected.bitcoinMainnet])
  const accountForNetwork = useCallback((network: Network): Account | undefined =>
    selectAccountForNetwork(accounts, bitcoinMainnet, network), [accounts, bitcoinMainnet])

  const value = useMemo(() => ({ accounts, bitcoinMainnet, bitcoinMainnetXpub: connected.bitcoinMainnetXpub, accountForNetwork, watch, unwatch, disconnect: connected.disconnect }), [accounts, bitcoinMainnet, connected.bitcoinMainnetXpub, accountForNetwork, watch, unwatch, connected.disconnect])
  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>
}

/**
 * EXM's own wallet supplies the "wallet" accounts while unlocked. A watch-only address has no keys.
 */
export function AccountsProvider({ children }: { children: ReactNode }) {
  const { status, addresses, lock } = useVault()
  const connected = useMemo<Connected>(
    () => ({
      connected: status === "unlocked" && addresses ? { evm: addresses.evm, solana: addresses.solana, bitcoin: addresses.bitcoinMainnet } : {},
      bitcoinMainnet: status === "unlocked" ? addresses?.bitcoinMainnet : undefined,
      bitcoinMainnetXpub: status === "unlocked" ? addresses?.bitcoinMainnetXpub : undefined,
      disconnect: async () => lock(),
    }),
    [status, addresses, lock],
  )
  return <Provider connected={connected}>{children}</Provider>
}
