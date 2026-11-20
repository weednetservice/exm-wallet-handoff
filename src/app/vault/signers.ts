import "./polyfill"
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  erc20Abi as viemErc20Abi,
  fallback,
  http,
  parseAbi,
  parseGwei,
  serializeTransaction,
  keccak256,
  type Address,
  type Chain,
  type Hex,
} from "viem"
import { assertBroadcastableNetwork, assertSupportedExecutionNetwork, networkLabel, tokensOf, type Network, type Token } from "@/lib/chains"
import { backendUrl } from "@/lib/api/backend"
import { isTransferPreparationError, readPendingTransfer, rememberPreparedTransfer, TransferPreparationError } from "../transfers/pending"
import { assertPreparedTransfer } from "../transfers/signed"
import type { DerivedKeys } from "./keys"

export type SendResult = { url: string; label: string; hash: string; status: "broadcast" | "confirmed" }
export type SigningGuard = () => void
export class SigningSessionExpiredError extends Error {
  constructor() {
    super("Кошелёк заблокирован или заменён. Откройте его и проверьте операцию заново.")
    this.name = "SigningSessionExpiredError"
  }
}

function isSigningSessionExpired(error: unknown): boolean {
  let current = error
  for (let i = 0; i < 8 && current && typeof current === "object"; i++) {
    if (current instanceof SigningSessionExpiredError || (current as { name?: string }).name === "SigningSessionExpiredError") return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/** The node may have accepted the signed transaction before its HTTP reply was lost. Never invite a blind retry. */
export class BroadcastUncertainError extends Error {
  constructor(network: Network) {
    super(`Ответ узла ${networkLabel(network)} оборвался после попытки отправки. Операция могла попасть в сеть: проверьте историю или адрес в обозревателе перед новой отправкой.`)
    this.name = "BroadcastUncertainError"
  }
}

/** A known hash was broadcast, but the receipt could not be read. Retrying would sign a second transaction. */
export class PendingSwapError extends Error {
  constructor(network: Network, readonly hash: Hex) {
    super(`Операция передана в ${networkLabel(network)}, но подтверждение пока не удалось проверить. Сверьте хэш в обозревателе перед новой операцией.`)
    this.name = "PendingSwapError"
  }
}

/** Only explicit preflight/validation rejection is safe to retry. A lost RPC reply stays uncertain. */
export function isDefiniteBroadcastRejection(error: unknown): boolean {
  const e = error as { name?: string; message?: string; shortMessage?: string }
  const message = `${e?.name ?? ""} ${e?.shortMessage ?? ""} ${e?.message ?? ""}`
  return /insufficient funds|not enough (?:balance|funds|lamports)|simulation failed|execution reverted|revert(?:ed)?|user rejected|UserRejectedRequestError|user denied|rejected by user|signature verification fail|invalid (?:transaction|signature)|blockhash not found|transaction too large|dust|bad-txns|mandatory-script-verify-flag|min relay fee not met/i.test(message)
}

/* ------------------------------------------------------------------ EVM */

/** OP Stack GasPriceOracle predeploy (same address on every OP Stack chain) */
const GAS_PRICE_ORACLE: Address = "0x420000000000000000000000000000000000000F"
/** swap approval/execution receipt deadline; ordinary transfers return their hash immediately */
const RECEIPT_TIMEOUT_MS = 180_000

const chains = new Map<string, Chain>()

/** the viem chain of a network, built from our config: built-in and custom networks alike */
export function viemChain(network: Network): Chain {
  if (network.family !== "evm" || network.chainId === undefined) throw new Error(`Сеть ${network.name} не из семейства Ethereum`)
  const key = `${network.id}|${network.chainId}|${network.rpcUrl}`
  let chain = chains.get(key)
  if (!chain) {
    chain = defineChain({
      id: network.chainId,
      name: networkLabel(network),
      nativeCurrency: network.native,
      rpcUrls: { default: { http: [network.rpcUrl, ...(network.rpcFallbacks ?? [])] } },
      blockExplorers: network.explorer.url ? { default: { name: network.explorer.name, url: network.explorer.url } } : undefined,
      testnet: network.environment === "testnet",
    })
    chains.set(key, chain)
  }
  return chain
}

/** Mainnets use a fixed allowlist; custom testnets repeat the viem catalogue check. */
async function assertSignable(network: Network) {
  assertBroadcastableNetwork(network)
}

function evmClients(keys: DerivedKeys, network: Network, guard?: SigningGuard) {
  assertSupportedExecutionNetwork(network)
  const chain = viemChain(network)
  const urls = [network.rpcUrl, ...(network.rpcFallbacks ?? [])]
  return {
    // writes go to the main RPC only: a raw transaction sent twice through a fallback would only add noise
    // viem may fetch nonce and fees inside sendTransaction. Check at the actual local sign call.
    wallet: createWalletClient({ account: { ...keys.evm, signTransaction: async (...args: Parameters<typeof keys.evm.signTransaction>) => {
      guard?.()
      const signed = await keys.evm.signTransaction(...args)
      guard?.()
      if (typeof window !== "undefined") {
        try {
          const intent = readPendingTransfer(keys.evm.address, network.id)
          if (!intent || intent.state !== "intent") throw new TransferPreparationError()
          await assertPreparedTransfer(signed, network, intent)
          guard?.()
          if (readPendingTransfer(keys.evm.address, network.id)?.id !== intent.id) throw new TransferPreparationError()
          const hash = keccak256(signed)
          rememberPreparedTransfer(keys.evm.address, network.id, { hash, url: network.explorer.tx(hash), label: `Операция в ${network.explorer.name}`, status: "broadcast" })
        } catch (error) { if (isSigningSessionExpired(error)) throw error; throw new TransferPreparationError() }
      }
      guard?.()
      return signed
    } }, chain, transport: http(backendUrl(network.rpcUrl), { retryCount: 0 }) }),
    // reads (estimates, fees, receipts) may fall back to the other endpoints
    pub: createPublicClient({ chain, transport: urls.length > 1 ? fallback(urls.map((u) => http(backendUrl(u)))) : http(backendUrl(network.rpcUrl)) }),
  }
}

type Pub = ReturnType<typeof evmClients>["pub"]

/** the most a unit of gas can cost now: EIP-1559 max fee, or the legacy gas price */
async function maxFeePerGas(pub: Pub) {
  try {
    return (await pub.estimateFeesPerGas()).maxFeePerGas
  } catch {
    return (await pub.estimateFeesPerGas({ type: "legacy" })).gasPrice
  }
}

const gasPriceOracleAbi = parseAbi(["function getL1Fee(bytes data) view returns (uint256)"])

/**
 * OP Stack chains charge an L1 data fee on top of L2 gas: the GasPriceOracle prices the serialized
 * transaction (stub gas and fee values, as viem/op-stack's estimateL1Fee does). +25 % because it
 * follows L1 prices.
 */
export async function l1Fee(pub: Pub, network: Network, tx: { to: Address; value?: bigint; data?: Hex }) {
  if (!network.opStack || network.chainId === undefined) return 0n
  try {
    const serialized = serializeTransaction({
      chainId: network.chainId,
      type: "eip1559",
      to: tx.to,
      value: tx.value,
      data: tx.data,
      gas: tx.data ? 300_000n : 21_000n,
      maxFeePerGas: parseGwei("5"),
      maxPriorityFeePerGas: parseGwei("1"),
      nonce: 1,
    })
    const fee = await pub.readContract({ address: GAS_PRICE_ORACLE, abi: gasPriceOracleAbi, functionName: "getL1Fee", args: [serialized] })
    return (fee * 125n) / 100n
  } catch {
    if (network.environment === "mainnet") throw new Error(`Не удалось проверить полную комиссию сети ${networkLabel(network)}. Повторите позже.`)
    return 0n
  }
}

/** a never-used address: the worst case for gas (a new account) when the recipient is not known yet */
function freshAddress(): Address {
  const b = crypto.getRandomValues(new Uint8Array(20))
  return ("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as Address
}

/**
 * Upper bound of the fee for sending `value` to `to`, in wei. Without `to` it prices the worst case,
 * a transfer to a new account (on Sepolia that costs about 17 times a self-transfer).
 */
export async function evmFee(keys: DerivedKeys, network: Network, to?: string, value = 0n) {
  const { pub } = evmClients(keys, network)
  const recipient = (to ?? freshAddress()) as Address
  const account = keys.evm.address
  // Once the recipient and amount are known, a failed estimate must be visible to the user.
  // Falling back to a plain transfer could understate the cost of a contract recipient.
  const gas = to && value > 0n
    ? await pub.estimateGas({ account, to: recipient, value })
    : await pub.estimateGas({ account, to: recipient, value: 1n })
      .catch(() => pub.estimateGas({ account, to: recipient, value: 0n }))
  const [perGas, l1] = await Promise.all([maxFeePerGas(pub), l1Fee(pub, network, { to: recipient, value })])
  return (gas * 120n / 100n) * perGas + l1 // headroom for state changes before confirmation
}

export async function sendAndWait(network: Network, wallet: ReturnType<typeof evmClients>["wallet"], pub: Pub, tx: { to: Address; value?: bigint; data?: Hex; gas?: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }, failed: string, guard: SigningGuard, preparedHash: () => Hex | undefined) {
  const hash = await broadcastEvmTransfer(network, wallet, tx, guard)
  if (preparedHash()?.toLowerCase() !== hash.toLowerCase()) throw new BroadcastUncertainError(network)
  try {
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS })
    if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new PendingSwapError(network, hash)
    if (receipt.status !== "success") throw new Error(failed)
  } catch (e) {
    if ((e as Error).message === failed) throw e
    throw new PendingSwapError(network, hash)
  }
  return hash
}

/** A regular transfer has a useful result as soon as the RPC returns its hash. Swaps still use sendAndWait. */
export async function broadcastEvmTransfer(network: Network, wallet: ReturnType<typeof evmClients>["wallet"], tx: { to: Address; value?: bigint; data?: Hex; gas?: bigint; maxFeePerGas?: bigint }, guard?: SigningGuard): Promise<Hex> {
  assertBroadcastableNetwork(network)
  const served = await wallet.getChainId()
  if (served !== network.chainId) throw new Error(`RPC сети ${networkLabel(network)} отвечает за другую сеть (chain id ${served}). Подпись отменена`)
  guard?.()
  try {
    return await wallet.sendTransaction(tx)
  } catch (error) {
    if (isSigningSessionExpired(error)) throw new SigningSessionExpiredError()
    if (isTransferPreparationError(error)) throw new TransferPreparationError()
    if (isDefiniteBroadcastRejection(error)) throw error
    throw new BroadcastUncertainError(network)
  }
}

export async function evmSend(keys: DerivedKeys, network: Network, to: string, value: bigint, maxNetworkFee?: bigint, guard?: SigningGuard): Promise<SendResult> {
  await assertSignable(network)
  const { wallet, pub } = evmClients(keys, network, guard)
  let tx: { to: Address; value: bigint; gas?: bigint; maxFeePerGas?: bigint }
  if (network.environment === "mainnet") {
    if (maxNetworkFee === undefined || maxNetworkFee <= 0n || network.opStack) throw new Error("Лимит комиссии не подтверждён. Вернитесь к проверке перевода.")
    const recipient = to as Address
    const gas = (await pub.estimateGas({ account: keys.evm.address, to: recipient, value })) * 120n / 100n
    const gasPriceCap = await maxFeePerGas(pub)
    if (gas * gasPriceCap > maxNetworkFee) throw new Error("Комиссия выросла до подписи. Проверьте перевод ещё раз.")
    // These explicit limits bind the signed transaction to the maximum shown in the review.
    tx = { to: recipient, value, gas, maxFeePerGas: gasPriceCap }
  } else tx = { to: to as Address, value }
  const hash = await broadcastEvmTransfer(network, wallet, tx, guard)
  return { url: network.explorer.tx(hash), label: `Операция в ${network.explorer.name}`, hash, status: "broadcast" }
}

/* ------------------------------------------------------------------ ERC-20 (USDC) */

const transferData = (to: string, amount: bigint) => encodeFunctionData({ abi: viemErc20Abi, functionName: "transfer", args: [to as Address, amount] })

/** gas limit for a token transfer: the estimate +20 % (storage writes can cost more by the time it lands) */
async function tokenGas(pub: Pub, keys: DerivedKeys, token: Token, to: Address, amount: bigint) {
  const gas = await pub.estimateGas({ account: keys.evm.address, to: token.address as Address, data: transferData(to, amount) })
  return (gas * 120n) / 100n
}

export async function tokenBalance(keys: DerivedKeys, network: Network, token: Token) {
  const { pub } = evmClients(keys, network)
  return pub.readContract({ address: token.address as Address, abi: viemErc20Abi, functionName: "balanceOf", args: [keys.evm.address] })
}

/** upper bound of the fee (in the native coin) for sending `amount` of an ERC-20 token */
export async function erc20Fee(keys: DerivedKeys, network: Network, token: Token, to?: string, amount?: bigint) {
  const { pub } = evmClients(keys, network)
  const recipient = (to ?? freshAddress()) as Address
  // A known transfer must simulate its exact recipient and amount. A revert must reach the UI,
  // otherwise a fallback estimate could understate the fee or hide a rejected token transfer.
  const gas = to && amount !== undefined && amount > 0n
    ? await tokenGas(pub, keys, token, recipient, amount)
    : await tokenGas(pub, keys, token, recipient, 1n)
      .catch(() => tokenGas(pub, keys, token, recipient, 0n))
  const [perGas, l1] = await Promise.all([maxFeePerGas(pub), l1Fee(pub, network, { to: token.address as Address, data: transferData(recipient, amount ?? 1n) })])
  return gas * perGas + l1
}

export async function erc20Send(keys: DerivedKeys, network: Network, token: Token, to: string, amount: bigint, maxNetworkFee?: bigint, guard?: SigningGuard): Promise<SendResult> {
  await assertSignable(network)
  if (network.environment === "mainnet" && (maxNetworkFee === undefined || maxNetworkFee <= 0n || network.opStack)) throw new Error("Лимит комиссии не подтверждён. Вернитесь к проверке перевода.")
  if (network.family !== "evm" || !/^0x[0-9a-fA-F]{40}$/.test(token.address)) throw new Error(`${token.symbol} нельзя отправить в сети ${networkLabel(network)}`)
  if (!tokensOf(network).some((known) => known.address.toLowerCase() === token.address.toLowerCase() && known.symbol === token.symbol && known.decimals === token.decimals)) {
    throw new Error(`${token.symbol} не подтверждён для сети ${networkLabel(network)}`)
  }
  const { wallet, pub } = evmClients(keys, network, guard)
  const balance = await pub.readContract({ address: token.address as Address, abi: viemErc20Abi, functionName: "balanceOf", args: [keys.evm.address] })
  if (balance < amount) throw new Error(`Не хватает ${token.symbol}: на счёте меньше, чем вы отправляете`)
  // the estimate also simulates the call: a transfer that would revert fails here, before signing
  const gas = await tokenGas(pub, keys, token, to as Address, amount)
  const gasPriceCap = network.environment === "mainnet" ? await maxFeePerGas(pub) : undefined
  if (gasPriceCap !== undefined && gas * gasPriceCap > maxNetworkFee!) throw new Error("Комиссия выросла до подписи. Проверьте перевод ещё раз.")
  const hash = await broadcastEvmTransfer(network, wallet, { to: token.address as Address, data: transferData(to, amount), gas, maxFeePerGas: gasPriceCap }, guard)
  return { url: network.explorer.tx(hash), label: `Операция в ${network.explorer.name}`, hash, status: "broadcast" }
}
