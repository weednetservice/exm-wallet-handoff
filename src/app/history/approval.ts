import { evmRpc, tokensOf, type Network } from "@/lib/chains"
import { formatCoin } from "@/lib/format"

type RpcTransaction = { input?: string; to?: string | null } | null

export type ApprovalDetails = {
  tokenContract: string
  tokenName: string
  spender: string
  limit: string
  unlimited: boolean
}

/** Decode only ERC-20 approve(address,uint256); other approval methods need their own parser. */
export function parseApproval(input: string, contract: string, network: Network): ApprovalDetails | null {
  if (!/^0x095ea7b3[0-9a-fA-F]{128}$/.test(input) || !/^0x[0-9a-fA-F]{40}$/.test(contract)) return null
  const spenderWord = input.slice(10, 74)
  const amountWord = input.slice(74, 138)
  if (!/^0{24}$/i.test(spenderWord.slice(0, 24))) return null
  const spender = `0x${spenderWord.slice(24)}`
  const amount = BigInt(`0x${amountWord}`)
  const token = tokensOf(network).find((item) => item.address.toLowerCase() === contract.toLowerCase())
  const unlimited = amount === (1n << 256n) - 1n
  return {
    tokenContract: contract,
    tokenName: token?.symbol ?? "Непроверенный токен",
    spender,
    limit: unlimited ? "Без ограничения" : token ? formatCoin(amount, token.decimals, token.symbol) : `${amount.toString()} базовых единиц`,
    unlimited,
  }
}

export async function readApproval(network: Network, hash: string, signal?: AbortSignal): Promise<ApprovalDetails | null> {
  if (network.family !== "evm" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null
  const tx = await evmRpc<RpcTransaction>(network, "eth_getTransactionByHash", [hash], signal)
  if (!tx?.input || !tx.to) return null
  return parseApproval(tx.input, tx.to, network)
}
