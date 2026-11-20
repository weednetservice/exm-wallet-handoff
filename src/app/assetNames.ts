const names: Record<string, string> = {
  ETH: "Ethereum", SOL: "Solana", TON: "Toncoin", BTC: "Bitcoin",
  USDC: "USD Coin", USDT: "Tether", DAI: "Dai", AVAX: "Avalanche",
  BNB: "BNB", POL: "Polygon",
}

export const assetName = (symbol: string) => names[symbol] ?? symbol
