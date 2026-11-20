import { parseAbi } from "viem"

export const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as const
export const FEE_TIERS = [500, 3000, 10000] as const
export type FeeTier = (typeof FEE_TIERS)[number]
export const MIN_SQRT_RATIO = 4295128739n
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n

export const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
])

export const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
  "function refundETH() payable",
])
