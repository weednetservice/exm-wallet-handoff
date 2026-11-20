/**
 * Coin, network and wallet marks from @web3icons/react (MIT, licenses/ICONS.md): each project's own
 * logo on its own colour, clipped round, as Keeper shows coins. The marks belong to their projects
 * and are used only to name them.
 */
import type { ComponentType } from "react"
import {
  NetworkBase,
  NetworkBitcoin,
  NetworkEthereum,
  NetworkSolana,
  NetworkTon,
  TokenAVAX,
  TokenBNB,
  TokenBTC,
  TokenDAI,
  TokenDPI,
  TokenETH,
  TokenEURC,
  TokenMON,
  TokenPOL,
  TokenSOL,
  TokenTON,
  TokenUSDC,
  TokenUSDT,
  WalletBackpack,
  WalletCoinbase,
  WalletMetamask,
  WalletPhantom,
  WalletRabby,
  WalletSolflare,
  WalletWalletConnect,
} from "@web3icons/react"
import type { Network } from "@/lib/chains"
import { cn } from "@/lib/utils"

type Mark = ComponentType<{ variant?: "branded" | "mono" | "background"; size?: number | string }>

const COIN: Record<string, Mark> = { ETH: TokenETH, WETH: TokenETH, DPI: TokenDPI, EURC: TokenEURC, SOL: TokenSOL, TON: TokenTON, USDC: TokenUSDC, DAI: TokenDAI, USDT: TokenUSDT, BTC: TokenBTC, POL: TokenPOL, AVAX: TokenAVAX, BNB: TokenBNB, MON: TokenMON }
export const NETWORK_MARK: Record<string, Mark> = {
  "ethereum-mainnet": NetworkEthereum,
  "base-mainnet": NetworkBase,
  "solana-mainnet": NetworkSolana,
  "bitcoin-mainnet": NetworkBitcoin,
}
/** the chain each coin is native to: no badge there (Keeper shows TON bare and USDT with a TRON badge) */
const HOME: Record<string, string> = { ETH: "ethereum-mainnet", WETH: "ethereum-mainnet", SOL: "solana-mainnet", BTC: "bitcoin-mainnet" }

/**
 * One mark in a circle. Base's own app icon is its blue square on white; the set's "background"
 * variant inverts that into a white box, so Base gets the branded square on white instead.
 */
export function RoundMark({ mark, size, base = false }: { mark: Mark; size: number | string; base?: boolean }) {
  const M = mark
  return base ? (
    <span className="grid size-full place-items-center rounded-full bg-white">
      <span className="block" style={{ width: "62%", height: "62%" }}>
        <M variant="branded" size="100%" />
      </span>
    </span>
  ) : (
    <M variant="background" size={size} />
  )
}

/**
 * A coin's logo with a small network badge when the coin lives away from its home chain:
 * ETH on Base Sepolia gets the Base badge, ETH on Sepolia none, USDC on Sepolia the Ethereum badge.
 */
export function CoinIcon({
  symbol,
  networkId,
  size = 44,
  ring = "var(--grouped)",
  className,
}: {
  symbol: string
  networkId?: string
  size?: number
  /** the surface behind the icon: the badge is cut out of it */
  ring?: string
  className?: string
}) {
  const Coin = COIN[symbol]
  const Badge = networkId && HOME[symbol] !== networkId ? NETWORK_MARK[networkId] : undefined
  const badge = Math.max(14, Math.round(size * 0.4))
  return (
    <span aria-hidden="true" className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      <span className="block size-full overflow-hidden rounded-full bg-[var(--tint)]">
        {Coin ? symbol === "SOL" ? <span className="block size-full bg-[#0b0b13]"><Coin variant="branded" size={size} /></span> : <Coin variant="background" size={size} /> : <span className="t-label2 grid size-full place-items-center">{symbol.slice(0, 4)}</span>}
      </span>
      {Badge ? (
        <span className="absolute overflow-hidden rounded-full" style={{ width: badge, height: badge, right: -2, bottom: -2, boxShadow: `0 0 0 2px ${ring}` }}>
          <RoundMark mark={Badge} size={badge} base={networkId === "base-sepolia" || networkId === "base-mainnet"} />
        </span>
      ) : null}
    </span>
  )
}

/** the native coin of a network, with its badge */
export function NetworkCoin({ network, size, ring }: { network: Network; size?: number; ring?: string }) {
  return <CoinIcon symbol={network.native.symbol} networkId={network.id} size={size} ring={ring} />
}

export function NetworkMark({ networkId, size = 24, className }: { networkId: string; size?: number; className?: string }) {
  const M = NETWORK_MARK[networkId] ?? (networkId.startsWith("evm-") ? NetworkEthereum : undefined)
  return M ? (
    <span aria-hidden="true" className={cn("inline-block shrink-0 overflow-hidden rounded-full", className)} style={{ width: size, height: size }}>
      <RoundMark mark={M} size={size} base={networkId === "base-sepolia" || networkId === "base-mainnet"} />
    </span>
  ) : null
}

const WALLET: Record<string, Mark> = {
  metamask: WalletMetamask,
  rabby: WalletRabby,
  coinbase: WalletCoinbase,
  phantom: WalletPhantom,
  solflare: WalletSolflare,
  backpack: WalletBackpack,
  walletconnect: WalletWalletConnect,
  /** TON wallets have no mark in the set: the TON network mark stands in */
  ton: NetworkTon,
}
export type WalletId = keyof typeof WALLET

export function WalletMark({ id, size = 28 }: { id: WalletId; size?: number }) {
  const M = WALLET[id]
  return (
    <span aria-hidden="true" className="inline-block shrink-0 overflow-hidden rounded-[8px]" style={{ width: size, height: size }}>
      <M variant="background" size={size} />
    </span>
  )
}
