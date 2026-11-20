/**
 * СНИМОК, не живые данные. Снят 15.11.2026 в 03:37 UTC с публичных узлов тестовых сетей для демо-адресов
 * приложения (`src/app/demo.ts`), цены: CoinGecko `simple/price` в ту же минуту.
 * Скрипт снятия лежит рядом со скриншотами прототипа (work/snap.mjs). Ничего здесь не придумано:
 * нулевой баланс значит, что узел сети ответил 0x0 для этого адреса.
 *
 * Bitcoin: в демо-наборе приложения адреса Bitcoin нет, поэтому у ключа Bitcoin адреса и баланса нет
 * (экран показывает это словами, а не нулём).
 */
import { DEMO_ADDRESSES } from "@/app/demo"

export const SNAPSHOT_AT = "2026-11-15T03:37:03Z"
export const SNAPSHOT_LABEL = "15 ноября, 03:37 UTC"

export const ADDRESS = {
  evm: DEMO_ADDRESSES[0],
  solana: DEMO_ADDRESSES[1],
  ton: DEMO_ADDRESSES[2],
  bitcoin: undefined,
} as const

/** базовые единицы (wei, lamports, nanoton), как ответил узел */
export const BALANCE: Record<string, bigint> = {
  sepolia: 220681651789917704n,
  "base-sepolia": 0n,
  "arbitrum-sepolia": 0n,
  "op-sepolia": 0n,
  "unichain-sepolia": 0n,
  "polygon-amoy": 0n,
  "avalanche-fuji": 0n,
  "bnb-testnet": 0n,
  "linea-sepolia": 0n,
  "zksync-sepolia": 0n,
  "monad-testnet": 0n,
  "solana-devnet": 2520736225n,
  "ton-testnet": 12567460296n,
}

/** eth_gasPrice в wei на момент снимка: из него считается оценка комиссии простого перевода (21 000 газа) */
export const GAS_PRICE: Record<string, bigint> = {
  sepolia: 21n,
  "base-sepolia": 6000000n,
  "arbitrum-sepolia": 20072000n,
  "op-sepolia": 1000250n,
  "unichain-sepolia": 1500000n,
  "polygon-amoy": 50000000000n,
  "avalanche-fuji": 160n,
  "bnb-testnet": 412458285n,
  "linea-sepolia": 36904000n,
  "zksync-sepolia": 25000000n,
  "monad-testnet": 102000000000n,
}

/** цена монеты в основной сети, USD (у тестовых монет своей цены нет) */
export const PRICE: Record<string, number> = {
  ETH: 1819.37,
  SOL: 71.42,
  TON: 1.051,
  BTC: 64872,
  POL: 0.080083,
  AVAX: 7.14,
  BNB: 594.2,
  MON: 0.01576763,
}
