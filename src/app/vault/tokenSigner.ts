/**
 * Signing for a token (Circle test USDC) on one EVM network, the token twin of `useSigner` in
 * ./index.tsx: the same shape (`ready`, `fee`, `send`), so the send sheet can take either.
 * The fee is paid in the network's native coin.
 */
import { useMemo } from "react"
import { chainData, type Network, type Token } from "@/lib/chains"
import { useVault } from "./index"
import { erc20Fee, erc20Send, tokenBalance, type SendResult } from "./signers"
export type TokenFee = { total: bigint; networkFee: bigint; rent: bigint; createsAccount: boolean }

export function useTokenSigner(network: Network, token: Token) {
  const { keys, createSigningGuard } = useVault()
  return useMemo(() => {
    const need = () => {
      if (!keys) throw new Error("Кошелёк заблокирован: введите пароль")
      return keys
    }
    return {
      ready: !!keys && network.family === "evm",
      /** native-coin fee bound for sending `amount` of the token to `to` */
      async fee(to?: string, amount?: bigint): Promise<bigint> {
        const k = need()
        if (network.family === "evm") return erc20Fee(k, network, token, to, amount)
        throw new Error("Отправка токенов в этой сети не подключена")
      },
      async feeDetails(to?: string, amount?: bigint): Promise<TokenFee> {
        const k = need()
        if (network.family === "evm") {
          const networkFee = await erc20Fee(k, network, token, to, amount)
          return { total: networkFee, networkFee, rent: 0n, createsAccount: false }
        }
        throw new Error("Отправка токенов в этой сети не подключена")
      },
      /** the token balance of the open wallet, base units */
      async balance(): Promise<bigint> {
        const k = need()
        if (network.family === "evm") return tokenBalance(k, network, token)
        const get = chainData(network).getTokenBalance
        if (!get) throw new Error("Баланс токена в этой сети недоступен")
        return get(network.family === "solana" ? k.solana : "", token)
      },
      async minFor(): Promise<bigint | null> {
        return null
      },
      async send(to: string, amount: bigint, maxNetworkFee?: bigint): Promise<SendResult> {
        const k = need()
        const guard = createSigningGuard(k)
        if (network.family !== "evm") throw new Error("Отправка токенов в этой сети не подключена")
        return erc20Send(k, network, token, to, amount, maxNetworkFee, guard)
      },
    }
  }, [keys, network, token, createSigningGuard])
}
