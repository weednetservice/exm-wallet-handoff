/**
 * Known mainnet token contracts for Ethereum and Base.
 *
 * Addresses: Circle, "USDC Contract Addresses", mainnet table
 * https://developers.circle.com/stablecoins/usdc-contract-addresses (read 2026-11-15).
 * Each EVM address was checked on chain the same day: symbol() = "USDC", decimals() = 6.
 * Ethereum DAI and USDT addresses also match LI.FI's chain-1 catalog. On-chain symbol()
 * and decimals() were checked on 2026-11-17; Tether's official supported-protocols page
 * lists the USDT address. Discovery of arbitrary contracts is kept separate from this list.
 */
import type { Network } from "./networks"

export type Token = {
  /** stable key for queries and storage: "usdc" */
  id: string
  symbol: string
  name: string
  decimals: number
  /** ERC-20 contract (EVM) or SPL mint (Solana) */
  address: string
  /** reference price: same ids as the native coins */
  coingeckoId: string
  binanceSymbol: string
  /** @web3icons/react export name */
  icon: string
}

/** Canonical mainnet Circle USDC contracts (6 decimals). */
export const CIRCLE_USDC_EVM: Readonly<Record<number, `0x${string}`>> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum Mainnet
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet
}

const USDC_BASE = {
  id: "usdc",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  coingeckoId: "usd-coin",
  binanceSymbol: "USDCUSDT",
  icon: "TokenUSDC",
} as const

/** Ethereum contracts checked against LI.FI's chain-1 token catalog and on-chain symbol/decimals. */
export const ETHEREUM_MAINNET_TOKENS: readonly Token[] = [
  { ...USDC_BASE, address: CIRCLE_USDC_EVM[1] },
  { id: "dai", symbol: "DAI", name: "Dai Stablecoin", decimals: 18, address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", coingeckoId: "dai", binanceSymbol: "DAIUSDT", icon: "TokenDAI" },
  { id: "usdt", symbol: "USDT", name: "Tether USD", decimals: 6, address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", coingeckoId: "tether", binanceSymbol: "USDTUSDC", icon: "TokenUSDT" },
]

/** Circle USDC on this network, or null where Circle does not deploy it */
export function usdcOn(network: Network): Token | null {
  if (network.environment !== "mainnet" || network.custom) return null
  if (network.family === "evm" && network.chainId !== undefined) {
    const expectedChainId = network.id === "ethereum-mainnet" ? 1 : network.id === "base-mainnet" ? 8453 : undefined
    if (network.chainId !== expectedChainId) return null
    const address = CIRCLE_USDC_EVM[network.chainId]
    return address ? { ...USDC_BASE, address } : null
  }
  return null
}

/** every token the wallet reads on this network */
export function tokensOf(network: Network): Token[] {
  if (network.environment !== "mainnet" || network.custom) return []
  const usdc = usdcOn(network)
  if (!usdc) return []
  return network.id === "ethereum-mainnet" ? [...ETHEREUM_MAINNET_TOKENS] : [usdc]
}
