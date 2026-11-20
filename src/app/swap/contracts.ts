/**
 * Uniswap v3 on Ethereum Sepolia: addresses and the ABI fragments the swap tab calls.
 * All addresses were checked on chain (they have code; the WETH/USDC pools exist at 500/3000/10000).
 */
import { createPublicClient, http, parseAbi, type Address } from "viem"
import { sepolia } from "viem/chains"
export { ADDRESS_THIS, FEE_TIERS, MIN_SQRT_RATIO, MAX_SQRT_RATIO, quoterAbi, routerAbi, type FeeTier } from "./routerAbi"

export const SEPOLIA_ID = 11155111

export const QUOTER_V2: Address = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3"
export const SWAP_ROUTER_02: Address = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E"
export const WETH: Address = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
/** Circle test USDC, 6 decimals */
export const USDC: Address = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"

/** FiatToken (USDC) storage: balances at slot 9, allowances at slot 10. Used only for gas estimates via eth_call state override. */
export const USDC_BALANCE_SLOT = 9n
export const USDC_ALLOWANCE_SLOT = 10n

export const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
])

/** read-only client: quotes, balances and simulations work without a connected wallet */
export const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com", { batch: true }),
})
