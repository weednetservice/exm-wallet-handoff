/**
 * The 14 test networks of the prototype (the brief says "15": Scroll Sepolia, the 15th, was shut down on
 * 2026-07-30, research/05-feasibility.md §1.9). Endpoints are the keyless, CORS-open ones probed in 05.
 * The prototype only reads: block heights, balances of the demo addresses, gas prices.
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

export type Mark = ComponentType<{ variant?: "branded" | "mono" | "background"; size?: number | string }>
export type Family = "evm" | "solana" | "ton" | "bitcoin"

export type Net = {
  id: string
  name: string
  family: Family
  symbol: string
  decimals: number
  /** CoinGecko id of the coin on its main network: the reference price */
  cg: string
  http: string
  /** push source of new blocks; absent: the height is polled */
  ws?: string
  /** what one beat is called: Solana produces slots, the rest blocks */
  unit: "блок" | "слот"
  mark: Mark
  /** the demo address watched on this network; Bitcoin has none in the demo set */
  address?: string
}

const [EVM, SOL, TON] = DEMO_ADDRESSES

const evm = (id: string, name: string, http: string, ws: string, mark: Mark, symbol = "ETH", cg = "ethereum"): Net => ({
  id,
  name,
  family: "evm",
  symbol,
  decimals: 18,
  cg,
  http,
  ws,
  unit: "блок",
  mark,
  address: EVM,
})

export const NETS: Net[] = [
  evm("sepolia", "Ethereum Sepolia", "https://ethereum-sepolia-rpc.publicnode.com", "wss://ethereum-sepolia-rpc.publicnode.com", NetworkEthereum),
  evm("base-sepolia", "Base Sepolia", "https://sepolia.base.org", "wss://base-sepolia-rpc.publicnode.com", NetworkBase),
  evm("arbitrum-sepolia", "Arbitrum Sepolia", "https://sepolia-rollup.arbitrum.io/rpc", "wss://arbitrum-sepolia-rpc.publicnode.com", NetworkArbitrumOne),
  evm("op-sepolia", "OP Sepolia", "https://sepolia.optimism.io", "wss://optimism-sepolia-rpc.publicnode.com", NetworkOptimism),
  evm("unichain-sepolia", "Unichain Sepolia", "https://sepolia.unichain.org", "wss://unichain-sepolia-rpc.publicnode.com", NetworkUnichain),
  evm("linea-sepolia", "Linea Sepolia", "https://rpc.sepolia.linea.build", "wss://linea-sepolia-rpc.publicnode.com", NetworkLinea),
  evm("zksync-sepolia", "ZKsync Sepolia", "https://sepolia.era.zksync.dev", "wss://sepolia.era.zksync.dev/ws", NetworkZksync),
  evm("polygon-amoy", "Polygon Amoy", "https://polygon-amoy-bor-rpc.publicnode.com", "wss://polygon-amoy-bor-rpc.publicnode.com", NetworkPolygon, "POL", "polygon-ecosystem-token"),
  evm("avalanche-fuji", "Avalanche Fuji", "https://api.avax-test.network/ext/bc/C/rpc", "wss://avalanche-fuji-c-chain-rpc.publicnode.com", NetworkAvalanche, "AVAX", "avalanche-2"),
  evm("bnb-testnet", "BNB Testnet", "https://bsc-testnet-rpc.publicnode.com", "wss://bsc-testnet-rpc.publicnode.com", NetworkBinanceSmartChain, "BNB", "binancecoin"),
  evm("monad-testnet", "Monad Testnet", "https://testnet-rpc.monad.xyz", "wss://testnet-rpc.monad.xyz", NetworkMonad, "MON", "monad"),
  {
    id: "solana-devnet",
    name: "Solana Devnet",
    family: "solana",
    symbol: "SOL",
    decimals: 9,
    cg: "solana",
    http: "https://api.devnet.solana.com",
    ws: "wss://api.devnet.solana.com",
    unit: "слот",
    mark: NetworkSolana,
    address: SOL,
  },
  {
    id: "ton-testnet",
    name: "TON Testnet",
    family: "ton",
    symbol: "TON",
    decimals: 9,
    cg: "the-open-network",
    http: "https://testnet.toncenter.com/api/v3",
    unit: "блок",
    mark: NetworkTon,
    address: TON,
  },
  {
    id: "bitcoin-testnet4",
    name: "Bitcoin Testnet4",
    family: "bitcoin",
    symbol: "BTC",
    decimals: 8,
    cg: "bitcoin",
    http: "https://mempool.space/testnet4/api",
    unit: "блок",
    mark: NetworkBitcoin,
  },
]

export const netById = (id: string) => NETS.find((n) => n.id === id)!

export const COIN_MARK: Record<string, Mark> = {
  ETH: TokenETH,
  POL: TokenPOL,
  AVAX: TokenAVAX,
  BNB: TokenBNB,
  MON: TokenMON,
  SOL: TokenSOL,
  TON: TokenTON,
  BTC: TokenBTC,
}

/** coins in the order of the home list; the networks of a coin keep the order of NETS */
export const COINS = ["ETH", "SOL", "TON", "POL", "AVAX", "BNB", "MON", "BTC"] as const
export type Coin = (typeof COINS)[number]
export const netsOf = (coin: string) => NETS.filter((n) => n.symbol === coin)

/**
 * Tempo classes: how the home screen folds 14 networks into four lines. The thresholds are in seconds
 * per block; a network lands in a class by its measured tempo, not by a hand-written list.
 */
export type TempoClass = { id: "sub" | "sec" | "ten" | "min"; title: string; below: number }
export const TEMPO_CLASSES: TempoClass[] = [
  { id: "sub", title: "До секунды", below: 0.95 },
  { id: "sec", title: "Секунды", below: 8 },
  { id: "ten", title: "От 10 секунд", below: 60 },
  { id: "min", title: "Минуты", below: Infinity },
]
/** tempo undefined: no steady rhythm to measure (Bitcoin testnet4), so the slowest class */
export const classOf = (tempo: number | undefined) =>
  tempo === undefined ? TEMPO_CLASSES[3] : TEMPO_CLASSES.find((c) => tempo < c.below)!

/** distance between two beats on a strip: density reads as speed, so a still frame already tells the networks apart */
export const stepOf = (tempo: number | undefined) => (tempo === undefined ? 26 : tempo < 0.95 ? 6 : tempo < 8 ? 11 : 20)
