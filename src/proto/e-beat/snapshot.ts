/**
 * SNAPSHOT, not live data: read from the public endpoints in networks.ts on 2026-11-15 for the demo
 * addresses in src/app/demo.ts (probe script: eth_getBalance / getBalance / toncenter addressInformation,
 * CoinGecko simple/price, block timestamps 200 blocks apart). It is what the screens show for the first
 * moment and what stays if a request fails; live answers replace it (data.ts). Networks not listed in
 * `balances` answered zero. Nothing here is invented.
 */
export const SNAPSHOT_DATE = "15.11.2026"

/** base units of the native coin */
export const SNAPSHOT_BALANCES: Record<string, string> = {
  sepolia: "220684454285242435",
  "solana-devnet": "2520746225",
  "ton-testnet": "12567460296",
}

/** USD and 24 h change, CoinGecko, main-network coins */
export const SNAPSHOT_PRICES: Record<string, { usd: number; change24h: number }> = {
  ethereum: { usd: 1814.85, change24h: -4.03 },
  solana: { usd: 71.41, change24h: -5.21 },
  "the-open-network": { usd: 1.051, change24h: -1.7 },
  "polygon-ecosystem-token": { usd: 0.0801, change24h: -3.81 },
  "avalanche-2": { usd: 7.13, change24h: -11.6 },
  binancecoin: { usd: 593, change24h: -3.99 },
  monad: { usd: 0.01574505, change24h: -4.74 },
  bitcoin: { usd: 64839, change24h: -3.06 },
}

/**
 * Seconds per block, measured: (timestamp of the head − timestamp 200 blocks back) / 200 (Sepolia: 50 blocks);
 * Solana: getRecentPerformanceSamples; TON: 100 masterchain blocks. Bitcoin testnet4 is absent on purpose:
 * its block timestamps ran 1.8 h ahead of the clock that day (the 20-minute rule), so no honest average exists.
 */
export const SNAPSHOT_TEMPO: Record<string, number> = {
  sepolia: 12.24,
  "base-sepolia": 0.2,
  "arbitrum-sepolia": 0.255,
  "op-sepolia": 2.0,
  "unichain-sepolia": 1.0,
  "linea-sepolia": 3.815,
  "zksync-sepolia": 10.175,
  "polygon-amoy": 1.0,
  "avalanche-fuji": 1.575,
  "bnb-testnet": 0.45,
  "monad-testnet": 0.31,
  "solana-devnet": 0.24,
  "ton-testnet": 0.404,
}
