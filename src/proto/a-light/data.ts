/**
 * Prototype data: a SNAPSHOT of the demo addresses (src/app/demo.ts), read from public testnet RPCs.
 * Nothing here is invented: balances are eth_getBalance / getBalance / getAddressBalance answers,
 * prices are CoinGecko simple/price, gas prices are eth_gasPrice. Networks the address holds nothing
 * in show zero. The demo has no Bitcoin address, so Bitcoin Testnet4 is zero by definition.
 * The address is live, so today's numbers can differ from this snapshot.
 */
import type { ComponentType } from "react"
import {
  NetworkArbitrumOne,
  NetworkAvalanche,
  NetworkBase,
  NetworkBinanceSmartChain,
  NetworkBitcoin,
  NetworkEthereum,
  NetworkLinea,
  NetworkMonad,
  NetworkOptimism,
  NetworkPolygon,
  NetworkSolana,
  NetworkTon,
  NetworkUnichain,
  NetworkZksync,
  TokenAVAX,
  TokenBNB,
  TokenBTC,
  TokenETH,
  TokenMON,
  TokenPOL,
  TokenSOL,
  TokenTON,
} from "@web3icons/react"
import { DEMO_ADDRESSES } from "@/app/demo"

/** balances and prices were read at this moment (UTC) */
export const SNAPSHOT_AT = "2026-11-15T03:32:49Z"
/** eth_gasPrice was read at this moment (UTC) */
export const GAS_SNAPSHOT_AT = "2026-11-15T03:36:11Z"

export type Mark = ComponentType<{
  variant?: "branded" | "mono" | "background"
  size?: number | string
}>
export type Family = "evm" | "solana" | "ton" | "bitcoin"

export type Net = {
  id: string
  name: string
  family: Family
  coin: string
  mark: Mark
  /** the network's light: its logo hue at equal strength, OKLCH L 0.70 C 0.14 (research/08 §4A) */
  light: string
  /** snapshot: native balance of the demo address, base units */
  amount: bigint
  /** snapshot: eth_gasPrice in wei (EVM networks where the coin is ETH) */
  gasPrice?: bigint
}

export type Coin = {
  symbol: string
  name: string
  decimals: number
  mark: Mark
  /** snapshot: CoinGecko price of the main-network coin, USD */
  usd: number
  /** the network whose light a multi-network coin takes: its home chain */
  home: string
}

/** the neutral light of the account: Keeper's accent, where no single network is in view */
export const NEUTRAL = { color: "#3C95FA", alpha: 0.16 }
/**
 * Strength of a network's light at its centre, which lies 60 px above the screen. On screen it is
 * 0.21 at the very top edge and falls with distance; under any secondary text (#8994A3) it is
 * 0.09 or less, well inside the 0.14 that research/08 allows there (measured in verify.py, see README).
 */
export const LIGHT_ALPHA = 0.32
/** the lower light of the send screen: about 0.7 of the top one, as in research/08 (0.10 against 0.14); no secondary text stands on the page there */
export const BOTTOM_ALPHA = 0.22

/** ruler order: the seven networks where the coin is ETH first, so the lit row stays put while scrubbing */
export const NETS: Net[] = [
  {
    id: "sepolia",
    name: "Ethereum Sepolia",
    family: "evm",
    coin: "ETH",
    mark: NetworkEthereum,
    light: "#7D98F5",
    amount: 220701985851753876n,
    gasPrice: 21n,
  },
  {
    id: "base-sepolia",
    name: "Base Sepolia",
    family: "evm",
    coin: "ETH",
    mark: NetworkBase,
    light: "#719CF5",
    amount: 0n,
    gasPrice: 6000000n,
  },
  {
    id: "arbitrum-sepolia",
    name: "Arbitrum Sepolia",
    family: "evm",
    coin: "ETH",
    mark: NetworkArbitrumOne,
    light: "#3FA7EE",
    amount: 0n,
    gasPrice: 20212000n,
  },
  {
    id: "op-sepolia",
    name: "OP Sepolia",
    family: "evm",
    coin: "ETH",
    mark: NetworkOptimism,
    light: "#E8796E",
    amount: 0n,
    gasPrice: 1000250n,
  },
  {
    id: "unichain-sepolia",
    name: "Unichain Sepolia",
    family: "evm",
    coin: "ETH",
    mark: NetworkUnichain,
    light: "#DA78B2",
    amount: 0n,
    gasPrice: 1500000n,
  },
  {
    id: "linea-sepolia",
    name: "Linea Sepolia",
    family: "evm",
    coin: "ETH",
    mark: NetworkLinea,
    light: "#9E9E9E",
    amount: 0n,
    gasPrice: 36904000n,
  },
  {
    id: "zksync-sepolia",
    name: "ZKsync Sepolia",
    family: "evm",
    coin: "ETH",
    mark: NetworkZksync,
    light: "#9E9E9E",
    amount: 0n,
    gasPrice: 25000000n,
  },
  {
    id: "polygon-amoy",
    name: "Polygon Amoy",
    family: "evm",
    coin: "POL",
    mark: NetworkPolygon,
    light: "#A38CED",
    amount: 0n,
  },
  {
    id: "avalanche-fuji",
    name: "Avalanche Fuji",
    family: "evm",
    coin: "AVAX",
    mark: NetworkAvalanche,
    light: "#E97871",
    amount: 0n,
  },
  {
    id: "bnb-testnet",
    name: "BNB Testnet",
    family: "evm",
    coin: "BNB",
    mark: NetworkBinanceSmartChain,
    light: "#C49711",
    amount: 0n,
  },
  {
    id: "monad-testnet",
    name: "Monad Testnet",
    family: "evm",
    coin: "MON",
    mark: NetworkMonad,
    light: "#9890F1",
    amount: 0n,
  },
  {
    id: "solana-devnet",
    name: "Solana Devnet",
    family: "solana",
    coin: "SOL",
    mark: NetworkSolana,
    light: "#C380D5",
    amount: 2520796225n,
  },
  {
    id: "ton-testnet",
    name: "TON Testnet",
    family: "ton",
    coin: "TON",
    mark: NetworkTon,
    light: "#42A6EE",
    amount: 12567460296n,
  },
  {
    id: "bitcoin-testnet4",
    name: "Bitcoin Testnet4",
    family: "bitcoin",
    coin: "BTC",
    mark: NetworkBitcoin,
    light: "#DB8832",
    amount: 0n,
  },
]

export const COINS: Coin[] = [
  {
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    mark: TokenETH,
    usd: 1816.47,
    home: "sepolia",
  },
  {
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    mark: TokenSOL,
    usd: 71.3,
    home: "solana-devnet",
  },
  {
    symbol: "TON",
    name: "Toncoin",
    decimals: 9,
    mark: TokenTON,
    usd: 1.051,
    home: "ton-testnet",
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    decimals: 8,
    mark: TokenBTC,
    usd: 64885,
    home: "bitcoin-testnet4",
  },
  {
    symbol: "BNB",
    name: "BNB",
    decimals: 18,
    mark: TokenBNB,
    usd: 593.58,
    home: "bnb-testnet",
  },
  {
    symbol: "AVAX",
    name: "Avalanche",
    decimals: 18,
    mark: TokenAVAX,
    usd: 7.12,
    home: "avalanche-fuji",
  },
  {
    symbol: "POL",
    name: "Polygon",
    decimals: 18,
    mark: TokenPOL,
    usd: 0.080282,
    home: "polygon-amoy",
  },
  {
    symbol: "MON",
    name: "Monad",
    decimals: 18,
    mark: TokenMON,
    usd: 0.01567736,
    home: "monad-testnet",
  },
]

/** the demo's addresses by family; it has none for Bitcoin */
export const ADDRESS: Record<Family, string | null> = {
  evm: DEMO_ADDRESSES[0],
  solana: DEMO_ADDRESSES[1],
  ton: DEMO_ADDRESSES[2],
  bitcoin: null,
}

/**
 * What the prototype's send screen offers to send: a stand-in for the amount a person would type.
 * It is an input, not a balance, and nothing is sent.
 */
export const DRAFT: Record<string, bigint> = {
  ETH: 10n ** 16n, // 0,01
  SOL: 10n ** 8n, // 0,1
  TON: 10n ** 9n, // 1
}

export const netById = (id: string) => NETS.find((n) => n.id === id)!
export const coinBySymbol = (s: string) => COINS.find((c) => c.symbol === s)!
export const netsOf = (symbol: string) => NETS.filter((n) => n.coin === symbol)
export const EVM_COUNT = NETS.filter((n) => n.family === "evm").length

/** base units → coins as a number, for the dollar value only (display keeps bigint) */
export function toNumber(amount: bigint, decimals: number) {
  return Number(amount) / 10 ** decimals
}
export function usdOf(amount: bigint, coin: Coin) {
  return toNumber(amount, coin.decimals) * coin.usd
}
/** a coin's balance in one network, or across all of its networks */
export function held(symbol: string, netId?: string | null) {
  return netsOf(symbol)
    .filter((n) => !netId || n.id === netId)
    .reduce((s, n) => s + n.amount, 0n)
}
export function totalUsd(netId?: string | null) {
  return NETS.filter((n) => !netId || n.id === netId).reduce((s, n) => s + usdOf(n.amount, coinBySymbol(n.coin)), 0)
}
/** a plain transfer costs 21 000 gas: the fee estimate from the gas price snapshot */
export function feeWei(net: Net) {
  return net.gasPrice !== undefined ? net.gasPrice * 21000n : undefined
}
