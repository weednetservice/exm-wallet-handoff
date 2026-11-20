import { getJson } from "@/lib/api/http"
import { tokensOf, type Network, type Token } from "@/lib/chains"
import { catalogMetadata } from "./catalog"

export type ExplorerToken = {
  address_hash?: string
  decimals?: string | number | null
  name?: string | null
  symbol?: string | null
  type?: string
}

type BlockscoutBalance = {
  token?: ExplorerToken
  value?: string
}

export type DiscoveredToken = { token: Token; amount: bigint }
export type TokenDiscovery = { items: DiscoveredToken[]; hiddenCount: number }

const DISPLAY_LIMIT = 80
const contractAddress = /^0x[0-9a-fA-F]{40}$/
export const erc20Value = /^\d{1,78}$/
const clean = (value: unknown, fallback: string, max: number) =>
  (typeof value === "string" ? value : "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, max) || fallback

export function tokenFromExplorer(meta: ExplorerToken | undefined): Token | null {
  const addressHash = meta?.address_hash
  if (meta?.type !== "ERC-20" || typeof addressHash !== "string" || !contractAddress.test(addressHash) || meta.decimals == null) return null
  if (!/^\d{1,3}$/.test(String(meta.decimals))) return null
  const decimals = Number(meta.decimals)
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) return null
  return {
    id: `unverified:${addressHash.toLowerCase()}`,
    address: addressHash.toLowerCase(),
    symbol: clean(meta.symbol, "ERC-20", 16),
    name: clean(meta.name, "Неизвестный токен", 64),
    decimals,
    coingeckoId: "",
    binanceSymbol: "",
    icon: "",
  }
}

/** Explorer metadata is untrusted: a listed token is never automatically eligible for signing. */
export async function discoverEvmTokens(network: Network, address: string, signal?: AbortSignal): Promise<TokenDiscovery> {
  if (network.family !== "evm" || network.history?.kind !== "blockscout") return { items: [], hiddenCount: 0 }
  const url = `${network.history.api}/addresses/${encodeURIComponent(address)}/token-balances`
  const raw = await getJson<unknown>(url, { source: "Blockscout", signal }).catch((error) => {
    if (error?.status === 404) return []
    throw error
  })
  if (!Array.isArray(raw)) throw new Error("Список токенов пришёл в неизвестном формате")
  const known = new Set(tokensOf(network).map((token) => token.address.toLowerCase()))
  const seen = new Set<string>()
  const found: DiscoveredToken[] = []
  for (const row of raw as BlockscoutBalance[]) {
    const token = tokenFromExplorer(row?.token)
    if (!token || typeof row.value !== "string" || !erc20Value.test(row.value)) continue
    const id = token.address.toLowerCase()
    if (known.has(id) || seen.has(id)) continue
    const amount = BigInt(row.value)
    if (amount === 0n || amount >= 2n ** 256n) continue
    seen.add(id)
    found.push({ token: { ...token, ...catalogMetadata(network, id) }, amount })
  }
  const listed = found.filter(({ token }) => token.coingeckoId)
  const unknown = found.filter(({ token }) => !token.coingeckoId)
  return { items: [...listed, ...unknown.slice(0, DISPLAY_LIMIT)], hiddenCount: Math.max(0, unknown.length - DISPLAY_LIMIT) }
}
