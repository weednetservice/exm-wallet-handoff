/** Ethereum mainnet swaps: on-chain Uniswap V3 quotes and locally constructed calldata. */
import { createPublicClient, createWalletClient, decodeEventLog, encodeFunctionData, erc20Abi, http, isAddress, parseAbi, type Address, type Hex, type TransactionReceipt } from "viem"
import { networkById, tokensOf, usdcOn } from "@/lib/chains"
import { backendUrl } from "@/lib/api/backend"
import { FEE_TIERS, MIN_SQRT_RATIO, MAX_SQRT_RATIO, ADDRESS_THIS, quoterAbi, routerAbi, type FeeTier } from "./routerAbi"
import { PendingSwapError, sendAndWait, viemChain, type SigningGuard } from "../vault/signers"
import type { DerivedKeys } from "../vault/keys"
import { assertMainnetWriteBudget } from "./writeBudget"
import { assertMainnetDeploymentIdentity } from "./deploymentIdentity"
import { assertMainnetOraclePrice } from "./oracle"
import { signedSwapHash, type ReviewedSwapTransaction } from "./signedSwap"
import { isTransferPreparationError, TransferPreparationError } from "../transfers/pending"

export const MAINNET = networkById("ethereum-mainnet")!
export const MAINNET_USDC = usdcOn(MAINNET)!
const MAINNET_TOKENS = tokensOf(MAINNET)
export const NATIVE = "0x0000000000000000000000000000000000000000" as Address
export const UNISWAP_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" as Address
export const UNISWAP_QUOTER = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as Address
export const UNISWAP_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984" as Address
export const WETH_MAINNET = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address
// Keep writes closed until recovery on production transports and devices is verified.
export const MAINNET_SWAP_SIGNING_ENABLED = false
export const MAINNET_SWAP_PAUSE_REASON = "Подпись временно закрыта. Проверяем восстановление обмена при потере связи с сетью."
export type MainnetAsset = "ETH" | "USDC" | "DAI" | "USDT"
export type MainnetQuote = {
  input: MainnetAsset
  output: MainnetAsset
  amountIn: bigint
  amountOut: bigint
  minimumOut: bigint
  owner: Address
  spender: Address | null
  tx: { to: Address; data: Hex; value: bigint }
  receivedAt: number
  deadline: bigint
  feeTier: FeeTier
  priceImpactBps: number
  tool: string
}
export type MainnetDelivery = { owner: Address; output: MainnetAsset; minimumOut: bigint }
export const MAINNET_QUOTE_TTL = 30_000
const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const tokenOf = (asset: MainnetAsset) => asset === "ETH" ? null : MAINNET_TOKENS.find((token) => token.symbol === asset) ?? null
const addressOf = (asset: MainnetAsset) => asset === "ETH" ? WETH_MAINNET : tokenOf(asset)?.address as Address
const supportedPair = (input: MainnetAsset, output: MainnetAsset) => input !== output && (input === "ETH" || output === "ETH") && ["ETH", "USDC", "DAI"].includes(input) && ["ETH", "USDC", "DAI"].includes(output) && !!addressOf(input) && !!addressOf(output)
const fail = (): never => { throw new Error("Маршрут обмена не прошёл проверку. Обновите курс.") }

/** Compare the effective rate with a small same-pool on-chain quote, without floating point. */
export function priceImpactBps(amountIn: bigint, amountOut: bigint, referenceIn: bigint, referenceOut: bigint): number {
  if (amountIn <= 0n || amountOut <= 0n || referenceIn <= 0n || referenceOut <= 0n) throw new Error("Не удалось проверить влияние суммы на курс.")
  const fairOutScaled = referenceOut * amountIn
  const actualOutScaled = amountOut * referenceIn
  if (actualOutScaled >= fairOutScaled) return 0
  const missing = fairOutScaled - actualOutScaled
  return Number((missing * 10_000n + fairOutScaled - 1n) / fairOutScaled)
}

export function assertPriceImpact(amountIn: bigint, amountOut: bigint, referenceIn: bigint, referenceOut: bigint): number {
  const impact = priceImpactBps(amountIn, amountOut, referenceIn, referenceOut)
  if (impact > 500) throw new Error("Эта сумма ухудшает курс более чем на 5 %. Уменьшите сумму обмена.")
  return impact
}

const smallReferenceIn = (asset: MainnetAsset): bigint => asset === "ETH" ? 1_000_000_000_000_000n : asset === "USDC" ? 1_000_000n : 1_000_000_000_000_000_000n

/** The only transaction bytes EXM will ever sign for these pairs. */
export function buildMainnetSwapCall(p: { input: MainnetAsset; output: MainnetAsset; amountIn: bigint; minimumOut: bigint; feeTier: FeeTier; owner: Address; deadline: bigint }) {
  if (!supportedPair(p.input, p.output) || !isAddress(p.owner) || p.amountIn <= 0n || p.minimumOut <= 0n || !FEE_TIERS.includes(p.feeTier) || p.deadline <= 0n) fail()
  const swap = encodeFunctionData({ abi: routerAbi, functionName: "exactInputSingle", args: [{
    tokenIn: addressOf(p.input),
    tokenOut: addressOf(p.output),
    fee: p.feeTier,
    recipient: p.output === "ETH" ? ADDRESS_THIS : p.owner,
    amountIn: p.amountIn,
    amountOutMinimum: p.minimumOut,
    sqrtPriceLimitX96: 0n,
  }] })
  const calls = p.output === "ETH"
    ? [swap, encodeFunctionData({ abi: routerAbi, functionName: "unwrapWETH9", args: [p.minimumOut, p.owner] })]
    : [swap, encodeFunctionData({ abi: routerAbi, functionName: "refundETH" })]
  return { to: UNISWAP_ROUTER, data: encodeFunctionData({ abi: routerAbi, functionName: "multicall", args: [p.deadline, calls] }), value: p.input === "ETH" ? p.amountIn : 0n }
}

/** Reconstruct from reviewed values; never accept externally supplied transaction bytes. */
export function assertMainnetQuote(quote: MainnetQuote) {
  if (!supportedPair(quote.input, quote.output) || !isAddress(quote.owner) || quote.amountOut < quote.minimumOut || quote.minimumOut <= 0n || quote.amountIn <= 0n) fail()
  if (!Number.isSafeInteger(quote.priceImpactBps) || quote.priceImpactBps < 0 || quote.priceImpactBps > 500) fail()
  if (quote.deadline < BigInt(Math.floor(Date.now() / 1000))) throw new Error("Срок обмена истёк. Обновите курс.")
  const expected = buildMainnetSwapCall(quote)
  if (!equal(quote.tx.to, expected.to) || quote.tx.data.toLowerCase() !== expected.data.toLowerCase() || quote.tx.value !== expected.value || (quote.spender !== null && !equal(quote.spender, UNISWAP_ROUTER))) fail()
  if (quote.spender !== (quote.input === "ETH" ? null : UNISWAP_ROUTER)) fail()
}

/** QuoterV2 simulations use eth_call; no provider supplies signed calldata. */
export async function getMainnetQuote(input: MainnetAsset, output: MainnetAsset, amount: bigint, owner: Address, signal?: AbortSignal): Promise<MainnetQuote> {
  if (MAINNET.chainId !== 1 || !isAddress(owner) || amount <= 0n || !supportedPair(input, output)) fail()
  if (await client.getChainId() !== 1) throw new Error("RPC отвечает за другую сеть. Обмен отменён.")
  const blockNumber = await client.getBlockNumber()
  const results = await Promise.allSettled(FEE_TIERS.map((fee) => client.simulateContract({
    address: UNISWAP_QUOTER, abi: quoterAbi, functionName: "quoteExactInputSingle",
    args: [{ tokenIn: addressOf(input), tokenOut: addressOf(output), amountIn: amount, fee, sqrtPriceLimitX96: 0n }],
    blockNumber,
  })))
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
  let best: { amountOut: bigint; feeTier: FeeTier } | undefined
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return
    const [amountOut, sqrtAfter] = result.value.result
    if (amountOut <= 0n || sqrtAfter <= MIN_SQRT_RATIO + 1n || sqrtAfter >= MAX_SQRT_RATIO - 1n) return
    if (!best || amountOut > best.amountOut) best = { amountOut, feeTier: FEE_TIERS[index] }
  })
  if (!best) throw new Error("Для этой пары и суммы нет доступного пула Uniswap V3.")
  // Quote the same pool at a small fixed size. A live pool can still offer a poor
  // execution price for a large trade; slippage alone only bounds deterioration
  // after the displayed quote. Missing or zero reference fails closed.
  let referenceOut = 0n
  const referenceIn = smallReferenceIn(input)
  try {
    const reference = await client.simulateContract({
      address: UNISWAP_QUOTER, abi: quoterAbi, functionName: "quoteExactInputSingle",
      args: [{ tokenIn: addressOf(input), tokenOut: addressOf(output), amountIn: referenceIn, fee: best.feeTier, sqrtPriceLimitX96: 0n }],
      blockNumber,
    })
    const [out, sqrtAfter] = reference.result
    if (sqrtAfter > MIN_SQRT_RATIO + 1n && sqrtAfter < MAX_SQRT_RATIO - 1n) referenceOut = out
  } catch { /* lack of a reliable reference closes the route below */ }
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
  const priceImpact = assertPriceImpact(amount, best.amountOut, referenceIn, referenceOut)
  const minimumOut = best.amountOut * 9950n / 10000n
  if (minimumOut <= 0n) fail()
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60)
  const tx = buildMainnetSwapCall({ input, output, amountIn: amount, minimumOut, feeTier: best.feeTier, owner, deadline })
  const quote: MainnetQuote = {
    input, output, amountIn: amount, amountOut: best.amountOut, minimumOut, owner,
    spender: input === "ETH" ? null : UNISWAP_ROUTER,
    tx, receivedAt: Date.now(), deadline, feeTier: best.feeTier,
    priceImpactBps: priceImpact,
    tool: "Uniswap V3",
  }
  assertMainnetQuote(quote)
  return quote
}

const client = createPublicClient({ chain: viemChain(MAINNET), transport: http(backendUrl(MAINNET.rpcUrl)) })
export async function mainnetAllowance(owner: Address, input: MainnetAsset = "USDC"): Promise<bigint> {
  if (input !== "USDC" && input !== "DAI") fail()
  const token = tokenOf(input)
  if (!token) return fail()
  return client.readContract({ address: token.address as Address, abi: erc20Abi, functionName: "allowance", args: [owner, UNISWAP_ROUTER] })
}

/** Estimation must succeed for the actual calldata and account; no guessed 21k fallback. */
export async function estimateMainnetFee(quote: MainnetQuote, approvalNeeded: boolean) {
  assertMainnetQuote(quote)
  if (Date.now() - quote.receivedAt > MAINNET_QUOTE_TTL) throw new Error("Курс устарел")
  // An ERC-20 swap cannot be simulated before allowance exists. At this stage estimate only the
  // approval; after its receipt, fetch a fresh quote and estimate the actual swap or fail closed.
  const txGas = approvalNeeded ? 0n : await client.estimateGas({ account: quote.owner, ...quote.tx })
  const gasPrice = await client.estimateFeesPerGas()
  const feePerGas = gasPrice.maxFeePerGas
  if (!feePerGas || feePerGas <= 0n) throw new Error("Не удалось оценить комиссию")
  const priorityFee = gasPrice.maxPriorityFeePerGas ?? 0n
  if (priorityFee > feePerGas) throw new Error("Не удалось ограничить комиссию")
  const approvalGas = approvalNeeded ? await client.estimateGas({
    account: quote.owner,
    to: addressOf(quote.input),
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [UNISWAP_ROUTER, quote.amountIn] }),
  }) : 0n
  return { swapGas: txGas * 125n / 100n, approvalGas: approvalGas * 125n / 100n, feePerGas, priorityFee, total: (txGas + approvalGas) * 125n / 100n * feePerGas }
}

export async function estimateNativeSwapMaximum(output: MainnetAsset, owner: Address, signal: AbortSignal) {
  const balance = await client.getBalance({ address: owner })
  const reference = smallReferenceIn("ETH")
  let amount = balance / 2n < reference ? balance / 2n : reference
  if (amount <= 0n) throw new Error("Не хватает ETH на сумму и комиссию сети.")

  let reserve = 0n
  // Fees can change with the pool and size. Recheck the exact amount before filling the field.
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted()
    const quote = await getMainnetQuote("ETH", output, amount, owner, signal)
    const { swapGas, total } = await estimateMainnetFee(quote, false)
    signal.throwIfAborted()
    if (swapGas < 21_000n || total <= 0n) throw new Error("Не удалось оценить комиссию.")
    if (total > reserve) reserve = total
    if (balance <= reserve) throw new Error("Не хватает ETH на сумму и комиссию сети.")
    const next = balance - reserve
    if (next === amount) return amount
    amount = next
  }
  throw new Error("Комиссия изменилась. Нажмите «Макс» ещё раз.")
}

/** Pure guard used by both write paths; maxFeePerGas is carried into the signed transaction. */
export function boundMainnetFee(reviewedCap: bigint, reviewedPriority: bigint, currentCap: bigint) {
  if (reviewedCap <= 0n || reviewedPriority < 0n || reviewedPriority > reviewedCap || currentCap <= 0n || currentCap > reviewedCap)
    throw new Error("Комиссия сети выросла после подтверждения. Обновите расчёт.")
  return { maxFeePerGas: reviewedCap, maxPriorityFeePerGas: reviewedPriority }
}

async function feeForSigning(cap: bigint, priority: bigint) {
  const current = await client.estimateFeesPerGas()
  return boundMainnetFee(cap, priority, current.maxFeePerGas)
}

export async function assertMainnetPlainAccount(owner: Address) {
  const code = await client.getCode({ address: owner })
  if (code && code !== "0x") throw new Error("На адресе работает смарт-аккаунт или делегирование EIP-7702. EXM пока не может проверить зачисление обмена на такой адрес.")
}

const withdrawalAbi = parseAbi(["event Withdrawal(address indexed src, uint256 wad)"])

/** The hash binds this receipt to the locally reviewed calldata, including the unwrap recipient. */
export function mainnetDelivered(intent: MainnetDelivery, receipt: TransactionReceipt, hash: Hex) {
  const token = addressOf(intent.output)
  if (!token || intent.minimumOut <= 0n || receipt.status !== "success" || !equal(receipt.transactionHash, hash) ||
      !equal(receipt.from, intent.owner) || !receipt.to || !equal(receipt.to, UNISWAP_ROUTER)) return false
  let receivedInThisTx = 0n
  for (const log of receipt.logs) {
    if (log.removed || !log.transactionHash || !equal(log.transactionHash, hash) || log.blockHash !== receipt.blockHash || !equal(log.address, token)) continue
    try {
      if (intent.output === "ETH") {
        // Router02 unwrapWETH9 withdraws WETH, then sends the same amount to the reviewed recipient.
        const { args } = decodeEventLog({ abi: withdrawalAbi, data: log.data, topics: log.topics })
        if (equal(args.src, UNISWAP_ROUTER) && args.wad >= intent.minimumOut) return true
        continue
      }
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics })
      if (event.eventName === "Transfer" && equal(event.args.to, intent.owner)) receivedInThisTx += event.args.value
    } catch { /* unrelated contract event */ }
  }
  return receivedInThisTx >= intent.minimumOut
}

async function verifySwapPreflight(quote: MainnetQuote) {
  await Promise.all([
    assertMainnetDeploymentIdentity(client, { tokenIn: addressOf(quote.input), tokenOut: addressOf(quote.output), feeTier: quote.feeTier }),
    assertMainnetOraclePrice(client, quote),
  ])
}

async function sendReviewedSwap(keys: DerivedKeys, quote: MainnetQuote, tx: ReviewedSwapTransaction, failed: string, guard: SigningGuard, persistHash: (hash: Hex) => void) {
  if (MAINNET.chainId !== 1) fail()
  let preparedHash: Hex | undefined
  const wallet = createWalletClient({ account: { ...keys.evm, signTransaction: async (...args: Parameters<typeof keys.evm.signTransaction>) => {
    guard()
    const signed = await keys.evm.signTransaction(...args)
    const hash = await signedSwapHash(signed, quote.owner, tx).catch(() => { throw new TransferPreparationError() })
    guard()
    if (Date.now() - quote.receivedAt > MAINNET_QUOTE_TTL || preparedHash) throw new TransferPreparationError()
    try { persistHash(hash) } catch { throw new TransferPreparationError() }
    preparedHash = hash
    return signed
  } }, chain: viemChain(MAINNET), transport: http(backendUrl(MAINNET.rpcUrl), { retryCount: 0 }) })
  try { return await sendAndWait(MAINNET, wallet, client, tx, failed, guard, () => preparedHash) }
  catch (error) {
    if (isTransferPreparationError(error)) throw new Error("Не удалось проверить и сохранить хэш обмена. Операция не передана узлу.")
    throw error
  }
}
export async function approveMainnet(keys: DerivedKeys, quote: MainnetQuote, gas: bigint, feeCap: bigint, priorityFee: bigint, guard: SigningGuard, persistHash: (hash: Hex) => void) {
  if (!MAINNET_SWAP_SIGNING_ENABLED) throw new Error(MAINNET_SWAP_PAUSE_REASON)
  assertMainnetQuote(quote)
  if (quote.input === "ETH" || !quote.spender || !equal(quote.spender, UNISWAP_ROUTER) || !equal(keys.evm.address, quote.owner)) fail()
  await assertMainnetPlainAccount(quote.owner)
  if (Date.now() - quote.receivedAt > MAINNET_QUOTE_TTL) throw new Error("Курс устарел. Обновите расчёт.")
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [UNISWAP_ROUTER, quote.amountIn] })
  const [estimatedGas, balance] = await Promise.all([
    client.estimateGas({ account: quote.owner, to: addressOf(quote.input), data }),
    client.getBalance({ address: quote.owner }),
  ])
  assertMainnetWriteBudget({ reviewedGas: gas, estimatedGas, feeCap, value: 0n, balance })
  const priced = await feeForSigning(feeCap, priorityFee)
  await verifySwapPreflight(quote)
  if (Date.now() - quote.receivedAt > MAINNET_QUOTE_TTL) throw new Error("Курс устарел. Обновите расчёт.")
  const tx = { to: addressOf(quote.input), data, gas, ...priced }
  assertMainnetQuote(quote)
  return sendReviewedSwap(keys, quote, tx, `Разрешение ${quote.input} отклонено сетью`, guard, persistHash)
}
export async function executeMainnet(keys: DerivedKeys, quote: MainnetQuote, gas: bigint, feeCap: bigint, priorityFee: bigint, onPrepared: (intent: MainnetDelivery) => void, guard: SigningGuard, persistHash: (hash: Hex) => void) {
  if (!MAINNET_SWAP_SIGNING_ENABLED) throw new Error(MAINNET_SWAP_PAUSE_REASON)
  assertMainnetQuote(quote)
  if (!equal(keys.evm.address, quote.owner) || Date.now() - quote.receivedAt > MAINNET_QUOTE_TTL) throw new Error("Курс устарел. Обновите расчёт.")
  await assertMainnetPlainAccount(quote.owner)
  if (quote.input !== "ETH" && await mainnetAllowance(quote.owner, quote.input) < quote.amountIn) throw new Error(`Разрешение ${quote.input} ещё не подтверждено`)
  // Re-simulate the same calldata immediately before signing. No fallback to a different route.
  await client.call({ account: quote.owner, ...quote.tx })
  const [estimatedGas, balance] = await Promise.all([
    client.estimateGas({ account: quote.owner, ...quote.tx }),
    client.getBalance({ address: quote.owner }),
  ])
  assertMainnetWriteBudget({ reviewedGas: gas, estimatedGas, feeCap, value: quote.tx.value, balance })
  const priced = await feeForSigning(feeCap, priorityFee)
  await verifySwapPreflight(quote)
  if (Date.now() - quote.receivedAt > MAINNET_QUOTE_TTL) throw new Error("Курс устарел. Обновите расчёт.")
  const intent = { owner: quote.owner, output: quote.output, minimumOut: quote.minimumOut }
  onPrepared(intent)
  assertMainnetQuote(quote)
  const tx = { ...quote.tx, gas, ...priced }
  const hash = await sendReviewedSwap(keys, quote, tx, "Обмен отклонён сетью", guard, persistHash)
  try {
    const receipt = await client.getTransactionReceipt({ hash })
    if (mainnetDelivered(intent, receipt, hash)) return hash
  } catch { /* Hash is known; keep a pending record until delivery can be checked. */ }
  throw new PendingSwapError(MAINNET, hash)
}

export async function mainnetReceipt(hash: Hex) {
  return client.getTransactionReceipt({ hash })
}
