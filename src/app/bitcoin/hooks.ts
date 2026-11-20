import { useQuery } from "@tanstack/react-query"
import { useAccounts } from "../accounts"
import { loadBip84Activity, loadBip84Discovery } from "./discovery"

export function useBitcoinMainnetDiscovery(enabled: boolean) {
  const { bitcoinMainnet, bitcoinMainnetXpub } = useAccounts()
  return useQuery({
    queryKey: ["bitcoin-mainnet-discovery", bitcoinMainnet?.address],
    queryFn: ({ signal }) => loadBip84Discovery(bitcoinMainnetXpub!, signal),
    enabled: enabled && !!bitcoinMainnet && !!bitcoinMainnetXpub,
    staleTime: 120_000,
    refetchInterval: 120_000,
  })
}

export function useBitcoinMainnetActivity(enabled: boolean) {
  const { bitcoinMainnet, bitcoinMainnetXpub } = useAccounts()
  const discovery = useBitcoinMainnetDiscovery(enabled)
  const activity = useQuery({
    queryKey: ["bitcoin-mainnet-activity", bitcoinMainnet?.address, discovery.data?.usedAddresses.map((item) => item.address).join(",")],
    queryFn: ({ signal }) => loadBip84Activity(discovery.data!, signal),
    enabled: enabled && !!bitcoinMainnetXpub && !!discovery.data && !discovery.error,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
  const error = discovery.error ?? activity.error
  return {
    data: error ? undefined : activity.data,
    error,
    isError: !!error,
    isLoading: discovery.isLoading || activity.isLoading,
    refetch: error === discovery.error ? discovery.refetch : activity.refetch,
  }
}
