import { createPublicClient, createWalletClient, decodeFunctionData, encodeFunctionData, erc20Abi, http, isAddress, type Address, type Hex } from "viem"
import { backendUrl } from "@/lib/api/backend"
import { networkById, tokensOf, type Token } from "@/lib/chains"
import type { DerivedKeys } from "../vault/keys"
import { broadcastEvmTransfer, viemChain, type SigningGuard } from "../vault/signers"

export const ETHEREUM = networkById("ethereum-mainnet")!
export const ALLOWANCE_SPENDERS = [
  { id: "lifi", name: "LI.FI", address: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE" as Address },
  { id: "uniswap", name: "Uniswap V3", address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" as Address },
] as const
export type Spender = (typeof ALLOWANCE_SPENDERS)[number]
export type AllowanceTarget = { token: Token; spender: Spender }
export type RevokeReview = AllowanceTarget & { owner: Address; current: bigint; gas: bigint; feeCap: bigint; priorityFee: bigint; maximumFee: bigint; receivedAt: number }
export const REVOKE_REVIEW_TTL = 45_000

const client = createPublicClient({ chain: viemChain(ETHEREUM), transport: http(backendUrl(ETHEREUM.rpcUrl)) })
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const fail = (): never => { throw new Error("Разрешение не прошло проверку. Обновите экран.") }

export function allowanceTargets(): AllowanceTarget[] {
  return tokensOf(ETHEREUM).flatMap((token) => ALLOWANCE_SPENDERS.map((spender) => ({ token, spender })))
}

export function assertAllowanceTarget(target: AllowanceTarget) {
  if (ETHEREUM.id !== "ethereum-mainnet" || ETHEREUM.chainId !== 1) fail()
  if (!tokensOf(ETHEREUM).some((token) => eq(token.address, target.token.address) && token.symbol === target.token.symbol && token.decimals === target.token.decimals)) fail()
  if (!ALLOWANCE_SPENDERS.some((spender) => eq(spender.address, target.spender.address) && spender.id === target.spender.id)) fail()
}

export function revokeData(target: AllowanceTarget): Hex {
  assertAllowanceTarget(target)
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [target.spender.address, 0n] })
  const decoded = decodeFunctionData({ abi: erc20Abi, data })
  if (decoded.functionName !== "approve" || !eq(decoded.args[0], target.spender.address) || decoded.args[1] !== 0n) fail()
  return data
}

export async function currentAllowance(owner: Address, target: AllowanceTarget): Promise<bigint> {
  if (!isAddress(owner)) fail()
  assertAllowanceTarget(target)
  return client.readContract({ address: target.token.address as Address, abi: erc20Abi, functionName: "allowance", args: [owner, target.spender.address] })
}

export function boundRevokeFee(review: RevokeReview, nowGas: bigint, nowFeeCap: bigint) {
  if (review.gas <= 0n || review.feeCap <= 0n || review.priorityFee < 0n || review.priorityFee > review.feeCap ||
      review.maximumFee !== review.gas * review.feeCap || nowGas <= 0n || nowGas > review.gas || nowFeeCap <= 0n || nowFeeCap > review.feeCap) {
    throw new Error("Комиссия выросла после подтверждения. Обновите расчёт.")
  }
  return { gas: review.gas, maxFeePerGas: review.feeCap, maxPriorityFeePerGas: review.priorityFee }
}

export async function prepareRevoke(owner: Address, target: AllowanceTarget): Promise<RevokeReview> {
  if (!isAddress(owner)) fail()
  const data = revokeData(target)
  const current = await currentAllowance(owner, target)
  if (current === 0n) throw new Error("Разрешение уже отозвано. Обновите список.")
  const [gasRaw, fees] = await Promise.all([
    client.estimateGas({ account: owner, to: target.token.address as Address, data }),
    client.estimateFeesPerGas(),
  ])
  const gas = gasRaw * 125n / 100n
  if (gas <= 0n || fees.maxFeePerGas <= 0n || fees.maxPriorityFeePerGas > fees.maxFeePerGas) throw new Error("Не удалось ограничить комиссию сети")
  const native = await client.getBalance({ address: owner })
  if (native < gas * fees.maxFeePerGas) throw new Error("Не хватает ETH на комиссию отзыва")
  return { ...target, owner, current, gas, feeCap: fees.maxFeePerGas, priorityFee: fees.maxPriorityFeePerGas, maximumFee: gas * fees.maxFeePerGas, receivedAt: Date.now() }
}

/** Exactly one zero-approval for a known token/spender. The caller persists pending state before invoking this. */
export async function executeRevoke(keys: DerivedKeys, review: RevokeReview, guard: SigningGuard): Promise<Hex> {
  if (!eq(keys.evm.address, review.owner) || !isAddress(review.owner) || Date.now() - review.receivedAt > REVOKE_REVIEW_TTL) throw new Error("Проверка устарела. Обновите комиссию.")
  const data = revokeData(review)
  const allowance = await currentAllowance(review.owner, review)
  if (allowance === 0n) throw new Error("Разрешение уже отозвано. Обновите список.")
  if (allowance !== review.current) throw new Error("Лимит изменился. Обновите экран и проверьте его заново.")
  const [gasRaw, fees] = await Promise.all([
    client.estimateGas({ account: review.owner, to: review.token.address as Address, data }),
    client.estimateFeesPerGas(),
  ])
  const priced = boundRevokeFee(review, gasRaw, fees.maxFeePerGas)
  guard()
  const account = { ...keys.evm, signTransaction: async (...args: Parameters<typeof keys.evm.signTransaction>) => {
    guard()
    const signed = await keys.evm.signTransaction(...args)
    guard()
    return signed
  } }
  const wallet = createWalletClient({ account, chain: viemChain(ETHEREUM), transport: http(backendUrl(ETHEREUM.rpcUrl), { retryCount: 0 }) })
  return broadcastEvmTransfer(ETHEREUM, wallet, { to: review.token.address as Address, data, ...priced }, guard)
}

export async function revokeReceipt(hash: Hex) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) fail()
  return client.getTransactionReceipt({ hash })
}

export async function waitRevokeReceipt(hash: Hex) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) fail()
  return client.waitForTransactionReceipt({ hash, timeout: 120_000 })
}
