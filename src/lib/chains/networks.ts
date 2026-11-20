import { BITCOIN_MAINNET } from "./bitcoin"

export type ChainFamily = "evm" | "solana" | "ton" | "bitcoin"
export type HistorySource = { kind: "blockscout"; api: string } | { kind: "routescan"; api: string } | { kind: "node" }
export type Explorer = { name: string; url: string; tx: (hash: string) => string; address: (addr: string) => string }

export type Network = {
  id: string
  family: ChainFamily
  /** The legacy value remains representable so removed configurations can be refused explicitly. */
  environment: "testnet" | "mainnet"
  name: string
  testnetName: string
  chainId?: number
  native: { symbol: string; decimals: number; name: string }
  coingeckoId: string
  binanceSymbol: string
  rpcUrl: string
  rpcFallbacks?: string[]
  explorer: Explorer
  faucets: { name: string; url: string }[]
  history: HistorySource | null
  icons?: { network: string; coin?: string }
  opStack?: boolean
  custom?: boolean
}

const explorerAt = (name: string, root: string): Explorer => ({ name, url: root, tx: (hash) => `${root}/tx/${hash}`, address: (address) => `${root}/address/${address}` })
const ETH = { symbol: "ETH", decimals: 18, name: "Ether" }
const ETH_PRICE = { coingeckoId: "ethereum", binanceSymbol: "ETHUSDT" }

/** Only canonical, supported mainnets can enter production settings. */
export const NETWORKS: Network[] = [
  {
    id: "ethereum-mainnet", family: "evm", environment: "mainnet", name: "Ethereum", testnetName: "Mainnet", chainId: 1,
    native: ETH, ...ETH_PRICE, rpcUrl: "https://ethereum-rpc.publicnode.com",
    explorer: explorerAt("Blockscout", "https://eth.blockscout.com"), history: { kind: "blockscout", api: "https://eth.blockscout.com/api/v2" },
    faucets: [], icons: { network: "NetworkEthereum", coin: "TokenETH" },
  },
  {
    id: "base-mainnet", family: "evm", environment: "mainnet", name: "Base", testnetName: "Mainnet", chainId: 8453,
    native: ETH, ...ETH_PRICE, rpcUrl: "https://mainnet.base.org", rpcFallbacks: ["https://base-rpc.publicnode.com"],
    explorer: explorerAt("Basescan", "https://basescan.org"), history: null,
    faucets: [], icons: { network: "NetworkBase", coin: "TokenETH" }, opStack: true,
  },
  {
    id: "solana-mainnet", family: "solana", environment: "mainnet", name: "Solana", testnetName: "Mainnet",
    native: { symbol: "SOL", decimals: 9, name: "Solana" }, coingeckoId: "solana", binanceSymbol: "SOLUSDT", rpcUrl: "https://solana-rpc.publicnode.com",
    explorer: explorerAt("Solana Explorer", "https://explorer.solana.com"), history: { kind: "node" },
    faucets: [], icons: { network: "NetworkSolana", coin: "TokenSOL" },
  },
  BITCOIN_MAINNET,
]

export const DEFAULT_NETWORK_IDS: readonly string[] = NETWORKS.map((network) => network.id)
export const BUILTIN_TESTNET_CHAIN_IDS: ReadonlySet<number> = new Set()
export const ALLOWED_MAINNET_CHAIN_IDS: ReadonlySet<number> = new Set([1, 8453])
export const MAINNET_CHAIN_IDS: ReadonlySet<number> = new Set([
  1, 10, 14, 25, 30, 56, 66, 100, 122, 130, 137, 143, 146, 196, 204, 223, 250, 252, 288, 324, 480, 999, 1030, 1088, 1101, 1116,
  1135, 1284, 1329, 1625, 1868, 2020, 2222, 2741, 4200, 4689, 5000, 5330, 7000, 7560, 8217, 8453, 8822, 9745, 13371, 33139,
  34443, 42161, 42170, 42220, 43114, 48900, 57073, 59144, 60808, 80094, 81457, 98866, 167000, 200901, 534352, 747474, 7777777,
  1313161554, 1666600000,
])

const refuse = (what: string): never => { throw new Error(`Сеть ${what} не поддерживается. Доступны только встроенные основные сети.`) }

/** Kept for old callers: removed test networks must never reach a signer. */
export function assertTestnet(network: Network): void { refuse(network.name) }

export function assertSupportedExecutionNetwork(network: Network) {
  if (network.family !== "evm" || network.environment !== "mainnet" || !ALLOWED_MAINNET_CHAIN_IDS.has(network.chainId ?? -1) || network.custom) refuse(network.name)
  const builtin = NETWORKS.find((item) => item.id === network.id && item.environment === "mainnet")
  if (!builtin || network !== builtin) refuse(network.name)
}

/** Registration and defaults do not grant a network a new signing capability. */
export const isBroadcastDisabled = () => {
  if (typeof document === "undefined") return false
  const mode = document.documentElement.dataset.broadcast
  return import.meta.env.PROD ? mode !== "wallet" : mode === "read-only"
}

export function canBroadcastFromNetwork(network: Network): boolean {
  if (isBroadcastDisabled()) return false
  try { assertSupportedExecutionNetwork(network) } catch { return false }
  return network.id === "ethereum-mainnet"
}

export function assertBroadcastableNetwork(network: Network) {
  assertSupportedExecutionNetwork(network)
  if (isBroadcastDisabled()) throw new Error("На этом сервере отправка отключена. Доступны баланс и получение.")
  if (!canBroadcastFromNetwork(network)) throw new Error(`Отправка в ${networkLabel(network)} пока не подключена. Доступны баланс и получение.`)
}

export function networkLabel(network: Network) {
  return network.testnetName.startsWith(network.name) ? network.testnetName : `${network.name} ${network.testnetName}`
}
export const hasHistory = (network: Network) => network.history !== null
