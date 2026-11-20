import { useQuery } from "@tanstack/react-query"
import { getJson } from "@/lib/api/http"
import { tokensOf, type Network, type Token } from "@/lib/chains"
import { erc20Value, tokenFromExplorer, type ExplorerToken } from "./discovery"

export type TokenTransfer = { id: string; hash: string; from: string; to: string; value: bigint; time: Date; url: string }
export type AddressTokenTransfer = TokenTransfer & { token: Token; verified: boolean }

type BlockscoutTransfer = {
  transaction_hash: string
  log_index: number
  timestamp: string
  from: { hash: string }
  to: { hash: string }
  token: ExplorerToken
  total: { value: string }
}

const involvesAddress = (from: string, to: string, address: string) => from.toLowerCase() === address.toLowerCase() || to.toLowerCase() === address.toLowerCase()

/** One recent-transfer feed per address; unknown contracts stay marked as unverified. */
export async function getAddressTokenTransfers(network: Network, address: string, signal?: AbortSignal): Promise<AddressTokenTransfer[]> {
  const source = network.history
  if (!source || source.kind !== "blockscout") return []
  const url = `${source.api}/addresses/${encodeURIComponent(address)}/token-transfers?type=ERC-20`
  const data = await getJson<{ items: BlockscoutTransfer[] }>(url, { source: "Blockscout", signal }).catch((error) => {
    if (error?.status === 404) return { items: [] as BlockscoutTransfer[] }
    throw error
  })
  if (!Array.isArray(data.items)) throw new Error("История токенов пришла в неизвестном формате")
  const known = new Map(tokensOf(network).map((token) => [token.address.toLowerCase(), token]))
  return data.items.flatMap((item): AddressTokenTransfer[] => {
    const listed = tokenFromExplorer(item?.token)
    if (!listed || !/^0x[0-9a-fA-F]{64}$/.test(item.transaction_hash) ||
      !/^0x[0-9a-fA-F]{40}$/.test(item.from?.hash ?? "") || !/^0x[0-9a-fA-F]{40}$/.test(item.to?.hash ?? "") ||
      !erc20Value.test(item.total?.value ?? "") || !Number.isSafeInteger(item.log_index) ||
      !involvesAddress(item.from.hash, item.to.hash, address)) return []
    const token = known.get(listed.address.toLowerCase()) ?? listed
    const time = new Date(item.timestamp)
    if (!Number.isFinite(time.getTime())) return []
    return [{
      id: `${item.transaction_hash}:${item.log_index}`,
      hash: item.transaction_hash,
      from: item.from.hash,
      to: item.to.hash,
      value: BigInt(item.total.value),
      time,
      url: network.explorer.tx(item.transaction_hash),
      token,
      verified: known.has(listed.address.toLowerCase()),
    }]
  })
}

/** The address endpoint may contain other tokens; always match the contract address. */
export async function getTokenTransfers(network: Network, token: Token, address: string, signal?: AbortSignal): Promise<TokenTransfer[]> {
  const source = network.history
  if (!source || source.kind !== "blockscout") return []
  const url = `${source.api}/addresses/${encodeURIComponent(address)}/token-transfers?type=ERC-20&token=${encodeURIComponent(token.address)}`
  const data = await getJson<{ items: BlockscoutTransfer[] }>(url, { source: "Blockscout", signal }).catch((error) => {
    if (error?.status === 404) return { items: [] as BlockscoutTransfer[] }
    throw error
  })
  if (!Array.isArray(data.items)) throw new Error("История токена пришла в неизвестном формате")
  return data.items
    .filter((item) => item.token?.address_hash?.toLowerCase() === token.address.toLowerCase() &&
      /^0x[0-9a-fA-F]{64}$/.test(item.transaction_hash) &&
      /^0x[0-9a-fA-F]{40}$/.test(item.from?.hash ?? "") && /^0x[0-9a-fA-F]{40}$/.test(item.to?.hash ?? "") &&
      erc20Value.test(item.total?.value ?? "") && Number.isSafeInteger(item.log_index) &&
      Number.isFinite(new Date(item.timestamp).getTime()) && involvesAddress(item.from.hash, item.to.hash, address))
    .map((item) => ({
      id: `${item.transaction_hash}:${item.log_index}`,
      hash: item.transaction_hash,
      from: item.from.hash,
      to: item.to.hash,
      value: BigInt(item.total.value),
      time: new Date(item.timestamp),
      url: network.explorer.tx(item.transaction_hash),
    }))
}

export function useTokenActivity(network: Network, token: Token, address: string) {
  return useQuery({
    queryKey: ["token-activity", network.id, token.address, address],
    queryFn: ({ signal }) => getTokenTransfers(network, token, address, signal),
    enabled: network.history?.kind === "blockscout" && !!address,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}
