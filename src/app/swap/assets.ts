import { tokensOf, type Network, type Token } from "@/lib/chains"
import { ETH_TOKEN, USDC_TOKEN, type SwapToken } from "./tokens"

export type SwapAsset = {
  id: string
  network: Network
  symbol: string
  name: string
  decimals: number
  token?: Token
}

/** Every coin visible to the wallet can be selected. Execution is gated by an actual route. */
export function swapAssets(networks: Network[]): SwapAsset[] {
  return networks.flatMap((network) => [
    { id: `${network.id}:native`, network, symbol: network.native.symbol, name: network.native.name, decimals: network.native.decimals },
    ...tokensOf(network).map((token) => ({ id: `${network.id}:token:${token.id}`, network, symbol: token.symbol, name: token.name, decimals: token.decimals, token })),
  ])
}

export function liveSwapToken(asset: SwapAsset): SwapToken | null {
  if (asset.network.id !== "sepolia") return null
  if (!asset.token && asset.symbol === "ETH") return ETH_TOKEN
  if (asset.token?.address.toLowerCase() === USDC_TOKEN.address.toLowerCase()) return USDC_TOKEN
  return null
}

export function hasLiveSwapRoute(input: SwapAsset, output: SwapAsset): boolean {
  const a = liveSwapToken(input)
  const b = liveSwapToken(output)
  return !!a && !!b && a.symbol !== b.symbol
}

export function routeExplanation(input: SwapAsset, output: SwapAsset): string | null {
  if (input.id === output.id) return "Выберите разные монеты для обмена."
  if (hasLiveSwapRoute(input, output)) return null
  if (input.network.id !== output.network.id) return "Монеты находятся в разных тестовых сетях. Обмен между ними пока не поддерживается."
  return `Обмен ${input.symbol} → ${output.symbol} в сети ${input.network.testnetName} пока недоступен.`
}

export function assetForSymbol(assets: SwapAsset[], symbol: string): SwapAsset | undefined {
  const matching = assets.filter((asset) => asset.symbol.toUpperCase() === symbol.toUpperCase())
  return matching.find((asset) => asset.network.id === "sepolia") ?? matching[0]
}
