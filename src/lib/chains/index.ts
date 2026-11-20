import { evmData } from "./evm"
import { bitcoinData } from "./bitcoin"
import type { Network } from "./networks"
import { solanaData } from "./solana"
import type { ChainData } from "./types"

export * from "./networks"
export * from "./settings"
export * from "./tokens"
export * from "./catalog"
export { BITCOIN_MAINNET, BITCOIN_TESTNET4, validateBitcoinAddress, validateBitcoinMainnetAddress } from "./bitcoin"
export { NoHistoryError, evmRpc } from "./evm"
export type * from "./types"

const cache = new Map<string, ChainData>()

/** read access to a network (balances, history, address checks), one instance per network and endpoint */
export function chainData(network: Network): ChainData {
  const key = `${network.id}|${network.rpcUrl}`
  let d = cache.get(key)
  if (!d) {
    if (network.environment !== "mainnet") throw new Error("Тестовые сети удалены")
    if (network.family === "ton") throw new Error("Эта сеть не подключена")
    d = network.family === "evm" ? evmData(network) : network.family === "solana" ? solanaData(network) : bitcoinData(network as import("./bitcoin").BitcoinNetwork)
    cache.set(key, d)
  }
  return d
}
