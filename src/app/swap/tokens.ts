/** The swap pair (ETH ⇄ USDC on Sepolia) and an ERC-20 balance hook other screens can reuse. */
import { useQuery } from "@tanstack/react-query"
import type { Address } from "viem"
import { erc20Abi, sepoliaClient, USDC, WETH } from "./contracts"

export type SwapToken = {
  symbol: "ETH" | "USDC"
  name: string
  decimals: number
  /** the ERC-20 the pool trades: WETH stands in for native ETH */
  address: Address
  native: boolean
}

export const ETH_TOKEN: SwapToken = { symbol: "ETH", name: "Ether", decimals: 18, address: WETH, native: true }
export const USDC_TOKEN: SwapToken = { symbol: "USDC", name: "USD Coin (тестовый)", decimals: 6, address: USDC, native: false }

/**
 * ERC-20 balance on Sepolia, in base units. The key lives under ["balance", "sepolia"], so
 * invalidating that prefix after a swap refreshes it together with the ETH balance.
 */
export function useErc20Balance(token: Address | undefined, owner: string | undefined) {
  return useQuery({
    queryKey: ["balance", "sepolia", "erc20", token, owner],
    queryFn: () =>
      sepoliaClient.readContract({ address: token!, abi: erc20Abi, functionName: "balanceOf", args: [owner as Address] }),
    enabled: !!token && !!owner && /^0x[0-9a-fA-F]{40}$/.test(owner),
    refetchInterval: 20_000,
    staleTime: 10_000,
  })
}
