/** React Query hooks over the data layer: one cache for balances, history and prices. */
import { useQuery } from "@tanstack/react-query"
import { chainData, NETWORKS, tokensOf, type Network } from "@/lib/chains"
import { getQuotes } from "@/lib/api/market"
import { useAccounts } from "./accounts"
import { useBitcoinMainnetActivity } from "./bitcoin/hooks"

export function useBalance(network: Network, address?: string) {
  return useQuery({
    queryKey: ["balance", network.id, address],
    queryFn: ({ signal }) => chainData(network).getBalance(address!, signal),
    enabled: !!address,
    refetchInterval: 20_000,
    staleTime: 10_000,
  })
}

export function useActivity(network: Network, address?: string) {
  const { bitcoinMainnetXpub } = useAccounts()
  const accountHistory = network.id === "bitcoin-mainnet" && !!address && !!bitcoinMainnetXpub
  const bitcoinActivity = useBitcoinMainnetActivity(accountHistory)
  const ordinaryActivity = useQuery({
    queryKey: ["activity", network.id, address],
    queryFn: ({ signal }) => chainData(network).getActivity(address!, signal),
    enabled: !!address && !accountHistory,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
  return accountHistory ? bitcoinActivity : ordinaryActivity
}

/** mainnet reference prices of the coins we show (CoinGecko, one request for all) */
export function useQuotes(enabled = true) {
  return useQuery({
    queryKey: ["quotes"],
    queryFn: () => getQuotes([...NETWORKS.map((n) => n.coingeckoId), ...NETWORKS.flatMap((n) => tokensOf(n).map((token) => token.coingeckoId))]),
    enabled,
    refetchInterval: 60_000,
    staleTime: 50_000,
  })
}
