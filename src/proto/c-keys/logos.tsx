/**
 * Логотипы сетей и монет: @web3icons/react (MIT), фирменный вариант как есть, круглая обрезка.
 * Ничего не рисуется. Тонкое внутреннее кольцо одно на все логотипы: чёрные знаки Linea и ZKsync
 * на карточке #1D2633 дают 1,16:1 и без него теряют форму круга.
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
import { RoundMark } from "@/app/marks"
import { cn } from "@/lib/utils"

type Mark = ComponentType<{ variant?: "branded" | "mono" | "background"; size?: number | string; color?: string }>

const NET: Record<string, Mark> = {
  sepolia: NetworkEthereum,
  "base-sepolia": NetworkBase,
  "arbitrum-sepolia": NetworkArbitrumOne,
  "op-sepolia": NetworkOptimism,
  "unichain-sepolia": NetworkUnichain,
  "polygon-amoy": NetworkPolygon,
  "avalanche-fuji": NetworkAvalanche,
  "bnb-testnet": NetworkBinanceSmartChain,
  "linea-sepolia": NetworkLinea,
  "zksync-sepolia": NetworkZksync,
  "monad-testnet": NetworkMonad,
  "solana-devnet": NetworkSolana,
  "ton-testnet": NetworkTon,
  "bitcoin-testnet4": NetworkBitcoin,
}

const COIN: Record<string, Mark> = { ETH: TokenETH, POL: TokenPOL, AVAX: TokenAVAX, BNB: TokenBNB, MON: TokenMON, SOL: TokenSOL, TON: TokenTON, BTC: TokenBTC }

/** логотип сети в круге; `mono`: одноцветный знак на втором слое (запертое состояние) */
export function NetLogo({ id, size = 28, mono = false, className }: { id: string; size?: number; mono?: boolean; className?: string }) {
  const M = NET[id]
  return (
    <span aria-hidden="true" className={cn("ck-logo", className)} style={{ width: size, height: size }}>
      {mono ? (
        <span className="grid size-full place-items-center bg-[var(--tint)] text-white">
          <M variant="mono" size={Math.round(size * 0.64)} color="currentColor" />
        </span>
      ) : (
        <RoundMark mark={M} size={size} base={id === "base-sepolia"} />
      )}
    </span>
  )
}

export function CoinLogo({ symbol, size = 44 }: { symbol: string; size?: number }) {
  const M = COIN[symbol]
  return (
    <span aria-hidden="true" className="ck-logo" style={{ width: size, height: size }}>
      <M variant="background" size={size} />
    </span>
  )
}
