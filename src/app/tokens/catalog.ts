import type { Network, Token } from "@/lib/chains"

const ethereumCatalog: Record<string, Pick<Token, "symbol" | "name" | "decimals" | "coingeckoId">> = {
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", name: "Wrapped Ether", decimals: 18, coingeckoId: "weth" },
  "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c": { symbol: "EURC", name: "EURC", decimals: 6, coingeckoId: "euro-coin" },
  "0x1494ca1f11d487c2bbe4543e90080aeba4ba3c2b": { symbol: "DPI", name: "DeFi Pulse Index", decimals: 18, coingeckoId: "defipulse-index" },
  "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39": { symbol: "HEX", name: "HEX", decimals: 8, coingeckoId: "hex" },
  "0xf0f9d895aca5c8678f706fb8216fa22957685a13": { symbol: "CULT", name: "Cult DAO", decimals: 18, coingeckoId: "cult-dao" },
  "0x0ae055097c6d159879521c384f1d2123d1f195e6": { symbol: "STAKE", name: "xDai STAKE", decimals: 18, coingeckoId: "xdai-stake" },
}

export function catalogMetadata(network: Network, address: string) {
  if (network.id !== "ethereum-mainnet" || network.chainId !== 1 || network.environment !== "mainnet" || network.custom) return undefined
  return ethereumCatalog[address.toLowerCase()]
}
