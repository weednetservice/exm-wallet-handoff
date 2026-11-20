/**
 * Swap logic for Uniswap v3 on Sepolia: best-tier quotes (QuoterV2), router calldata (SwapRouter02),
 * gas estimates and allowance reads. Nothing here holds a key: reads go through a public RPC;
 * the approve and swap transactions are signed by EXM's own vault (src/app/vault/signers.ts).
 */
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  pad,
  toHex,
  type Address,
  type Hex,
  type StateOverride,
} from "viem"
import {
  ADDRESS_THIS,
  erc20Abi,
  FEE_TIERS,
  MAX_SQRT_RATIO,
  MIN_SQRT_RATIO,
  QUOTER_V2,
  quoterAbi,
  routerAbi,
  sepoliaClient,
  SWAP_ROUTER_02,
  USDC,
  USDC_ALLOWANCE_SLOT,
  USDC_BALANCE_SLOT,
  type FeeTier,
} from "./contracts"
import type { SwapToken } from "./tokens"

/* ------------------------------------------------------------------ quotes */

export type Quote = { amountIn: bigint; amountOut: bigint; fee: FeeTier; gasEstimate: bigint }

/** the pool returned nothing for this pair and amount at any fee tier */
export class NoRouteError extends Error {
  constructor() {
    super("Нет пула Uniswap для этой пары и суммы")
  }
}

/**
 * Asks QuoterV2 at every fee tier (eth_call, batched) and keeps the largest output.
 * Throws NoRouteError when every tier reverts, and the RPC error when the network itself failed.
 */
export async function quoteBest(tokenIn: SwapToken, tokenOut: SwapToken, amountIn: bigint): Promise<Quote> {
  const results = await Promise.allSettled(
    FEE_TIERS.map((fee) =>
      sepoliaClient.simulateContract({
        address: QUOTER_V2,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, fee, sqrtPriceLimitX96: 0n }],
      }),
    ),
  )
  let best: Quote | null = null
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return
    const [amountOut, sqrtAfter, , gasEstimate] = r.value.result
    // ended at the limit price: this pool can't absorb the whole amount, so the quote is not a fill
    if (sqrtAfter <= MIN_SQRT_RATIO + 1n || sqrtAfter >= MAX_SQRT_RATIO - 1n) return
    if (!best || amountOut > best.amountOut) best = { amountIn, amountOut, fee: FEE_TIERS[i], gasEstimate }
  })
  if (best) return best
  // reverts and drained pools mean no usable route; anything else (timeout, HTTP) is a network error
  const failure = results.find((r) => r.status === "rejected" && !isRevert(r.reason)) as PromiseRejectedResult | undefined
  if (failure) throw failure.reason
  throw new NoRouteError()
}

const isRevert = (e: unknown) => e instanceof BaseError && !!e.walk((x) => x instanceof ContractFunctionRevertedError)

/** value that settles `ms` after the last change (typing in the amount field) */
export function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/** live quote: debounced on the amount, refreshed every 15 s while the amount stays */
export function useSwapQuote(tokenIn: SwapToken, tokenOut: SwapToken, amountIn: bigint | null) {
  const settled = useDebounced(amountIn)
  const query = useQuery({
    queryKey: ["swap-quote", "sepolia", tokenIn.symbol, tokenOut.symbol, settled?.toString()],
    queryFn: () => quoteBest(tokenIn, tokenOut, settled!),
    enabled: settled !== null && settled > 0n,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: (n, e) => !(e instanceof NoRouteError) && n < 1,
  })
  // while the typed amount hasn't settled yet, the shown quote belongs to an older amount
  const pending = amountIn !== settled || (query.isFetching && query.data?.amountIn !== amountIn)
  return { ...query, pending }
}

/** amountOut minus slippage, in basis points (50 = 0,5 %) */
export function minOut(amountOut: bigint, slippageBps: number) {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n
}

/* -------------------------------------------------------------- calldata */

export type SwapCall = { to: Address; data: Hex; value: bigint }

/**
 * Router call for one swap, wrapped in multicall(deadline, …) so a transaction stuck in the mempool
 * can't execute later at a stale price.
 * ETH → USDC: exactInputSingle(tokenIn WETH, recipient user) + refundETH, value = amountIn (the router wraps it).
 * USDC → ETH: exactInputSingle(recipient ADDRESS_THIS) + unwrapWETH9(amountOutMinimum, user).
 */
export function buildSwapCall(p: {
  tokenIn: SwapToken
  tokenOut: SwapToken
  amountIn: bigint
  amountOutMinimum: bigint
  fee: FeeTier
  recipient: Address
  deadline?: bigint
}): SwapCall {
  const deadline = p.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 20 * 60)
  const unwrap = p.tokenOut.native
  const swap = encodeFunctionData({
    abi: routerAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: p.tokenIn.address,
        tokenOut: p.tokenOut.address,
        fee: p.fee,
        recipient: unwrap ? ADDRESS_THIS : p.recipient,
        amountIn: p.amountIn,
        amountOutMinimum: p.amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })
  // ETH in: refundETH returns any value the pool did not take, instead of leaving it in the router
  const calls = unwrap
    ? [swap, encodeFunctionData({ abi: routerAbi, functionName: "unwrapWETH9", args: [p.amountOutMinimum, p.recipient] })]
    : [swap, encodeFunctionData({ abi: routerAbi, functionName: "refundETH" })]
  return {
    to: SWAP_ROUTER_02,
    data: encodeFunctionData({ abi: routerAbi, functionName: "multicall", args: [deadline, calls] }),
    value: p.tokenIn.native ? p.amountIn : 0n,
  }
}

/** an address with no funds, for estimates when nobody is connected (its balances are overridden) */
const ESTIMATOR: Address = "0x000000000000000000000000000000000000dEaD"

const slotOf = (owner: Address, slot: bigint) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [owner, slot]))

/**
 * eth_call state that lets `account` run the swap: enough ETH, and for USDC input a USDC balance and
 * router allowance of `amountIn`. Only used for gas estimates; the real transaction runs on real state.
 */
function swapOverride(account: Address, tokenIn: SwapToken, amountIn: bigint): StateOverride {
  const out: StateOverride = [{ address: account, balance: amountIn * (tokenIn.native ? 1n : 0n) + 10n ** 18n }]
  if (!tokenIn.native) {
    const allowanceSlot = keccak256(
      encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [SWAP_ROUTER_02, slotOf(account, USDC_ALLOWANCE_SLOT)]),
    )
    out.push({
      address: USDC,
      stateDiff: [
        { slot: slotOf(account, USDC_BALANCE_SLOT), value: pad(toHex(amountIn)) },
        { slot: allowanceSlot, value: pad(toHex(amountIn)) },
      ],
    })
  }
  return out
}

export type FeeEstimate = {
  /** gas limit we send (estimate + 25 %) */
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  /** upper bound in wei: gas × maxFeePerGas */
  fee: bigint
  /** USDC input without enough allowance: the approve transaction comes first */
  approve?: { gas: bigint; fee: bigint }
}

/** network fee of the swap (and of the approve, if one is needed), from eth_estimateGas on the real calldata */
export async function estimateSwapFee(p: { call: SwapCall; tokenIn: SwapToken; amountIn: bigint; account?: Address; needsApproval?: boolean }): Promise<FeeEstimate> {
  const account = p.account ?? ESTIMATOR
  const [gasRaw, fees] = await Promise.all([
    sepoliaClient.estimateGas({ account, to: p.call.to, data: p.call.data, value: p.call.value, stateOverride: swapOverride(account, p.tokenIn, p.amountIn) }),
    sepoliaClient.estimateFeesPerGas(),
  ])
  const gas = (gasRaw * 125n) / 100n
  // twice the current fee cap: room for the base fee to rise before the block that includes it
  const maxFeePerGas = fees.maxFeePerGas * 2n
  const out: FeeEstimate = { gas, maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, fee: gas * maxFeePerGas }
  if (p.needsApproval) {
    const approveGas = (await sepoliaClient.estimateGas({ account, to: USDC, data: approveData(p.amountIn) }) * 125n) / 100n
    out.approve = { gas: approveGas, fee: approveGas * maxFeePerGas }
  }
  return out
}

/* ------------------------------------------------------------- approval */

const approveData = (amount: bigint) => encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [SWAP_ROUTER_02, amount] })

export function readAllowance(owner: Address) {
  return sepoliaClient.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [owner, SWAP_ROUTER_02] })
}

/** router allowance for USDC; refreshed after an approve by invalidating ["allowance", "sepolia"] */
export function useAllowance(owner: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["allowance", "sepolia", owner],
    queryFn: () => readAllowance(owner as Address),
    enabled: enabled && !!owner,
    staleTime: 10_000,
  })
}

/* ------------------------------------------------------------- links */

export const txUrl = (hash: string) => `https://eth-sepolia.blockscout.com/tx/${hash}`
