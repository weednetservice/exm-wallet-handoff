import { ApiError, getJson } from "@/lib/api/http"

export type PortfolioFamily = "evm" | "solana"

export type PortfolioNetwork = {
  id: string
  name: string
  chainId: number | null
  symbol: string
  decimals: number
  family: PortfolioFamily
}

export type PortfolioAsset = {
  network: string
  chain: string
  family: PortfolioFamily
  contract: string | null
  amount: string
  decimals: number | null
  symbol: string | null
  name: string | null
  spam?: boolean
}

type Capabilities = {
  indexer: "zerion" | null
  networks: PortfolioNetwork[]
}

export type PortfolioPage = {
  source: "zerion" | "rpc"
  assets: PortfolioAsset[]
  cursor: string | null
  partial: boolean
  unavailable?: string[]
}

export class PortfolioPending extends Error {
  constructor() {
    super("Индексатор ещё готовит данные по адресу. Повторите запрос чуть позже.")
  }
}

const source = "Активы по сетям"
const idPattern = /^[a-z0-9][a-z0-9_-]{0,79}$/
const contractPatterns = { evm: /^0x[0-9a-f]{40}$/i, solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ }

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function family(value: unknown): value is PortfolioFamily {
  return value === "evm" || value === "solana"
}

function decimals(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255
}

function nullableText(value: unknown, length: number): value is string | null {
  return value === null || typeof value === "string" && value.length <= length
}

function isNetwork(value: unknown): value is PortfolioNetwork {
  return record(value) && family(value.family) && typeof value.id === "string" && idPattern.test(value.id)
    && typeof value.name === "string" && value.name.length > 0 && value.name.length <= 160
    && typeof value.symbol === "string" && value.symbol.length <= 24 && decimals(value.decimals)
    && (value.chainId === null || typeof value.chainId === "number" && Number.isSafeInteger(value.chainId) && value.chainId > 0)
}

function isAsset(value: unknown): value is PortfolioAsset {
  return record(value) && family(value.family) && typeof value.network === "string" && idPattern.test(value.network)
    && typeof value.chain === "string" && value.chain.length > 0 && value.chain.length <= 160
    && (value.contract === null || typeof value.contract === "string" && contractPatterns[value.family].test(value.contract))
    && typeof value.amount === "string" && /^\d{1,100}$/.test(value.amount)
    && (value.decimals === null || decimals(value.decimals))
    && nullableText(value.symbol, 40) && nullableText(value.name, 160)
    && (value.spam === undefined || typeof value.spam === "boolean")
}

function invalidResponse(): never {
  throw new Error("Сервис вернул неполные данные. Попробуйте ещё раз.")
}

function request(path: string, signal: AbortSignal, body?: object) {
  return getJson<unknown>(`/api/portfolio/${path}`, {
    source,
    signal,
    timeoutMs: 20_000,
    init: body ? {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    } : { cache: "no-store" },
  })
}

export async function portfolioCapabilities(signal: AbortSignal): Promise<Capabilities> {
  const value = await request("capabilities", signal)
  if (!record(value) || value.indexer !== null && value.indexer !== "zerion" || !Array.isArray(value.networks) || !value.networks.every(isNetwork)) {
    invalidResponse()
  }
  return { indexer: value.indexer, networks: value.networks }
}

export async function scanPortfolio(address: string, accountFamily: PortfolioFamily, cursor: string | undefined, signal: AbortSignal): Promise<PortfolioPage> {
  const value = await request("scan", signal, { address, family: accountFamily, cursor })
  if (record(value) && value.status === "pending") throw new PortfolioPending()
  if (!record(value) || value.source !== "zerion" && value.source !== "rpc"
    || !Array.isArray(value.assets) || !value.assets.every((asset) => isAsset(asset) && asset.family === accountFamily)
    || value.cursor !== null && (typeof value.cursor !== "string" || !value.cursor || value.cursor.length > 8192)
    || typeof value.partial !== "boolean"
    || value.unavailable !== undefined && (!Array.isArray(value.unavailable) || !value.unavailable.every((item) => typeof item === "string" && item.length <= 160))) {
    invalidResponse()
  }
  return { source: value.source, assets: value.assets, cursor: value.cursor, partial: value.partial, unavailable: value.unavailable }
}

export async function checkPortfolioAsset(network: PortfolioNetwork, address: string, contract: string | null, signal: AbortSignal) {
  const value = await request("check", signal, { network: network.id, address, contract })
  if (!record(value) || !isAsset(value.asset) || value.asset.network !== network.id || value.asset.family !== network.family
    || contractKey(network.family, value.asset.contract) !== contractKey(network.family, contract)) {
    invalidResponse()
  }
  return value.asset
}

export function validPortfolioContract(accountFamily: PortfolioFamily, value: string) {
  return contractPatterns[accountFamily].test(value)
}

function contractKey(accountFamily: PortfolioFamily, contract: string | null) {
  return accountFamily === "evm" ? contract?.toLowerCase() ?? null : contract
}

export function portfolioAssetKey(asset: PortfolioAsset) {
  return `${asset.family}:${asset.network}:${contractKey(asset.family, asset.contract) ?? "native"}`
}

export function portfolioError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 400) return "Проверьте адрес и выбранную сеть."
    if (error.status === 404) return "По этому адресу в выбранной сети нет данных о токене."
    if (error.status === 422) return "Контракт не вернул остаток токена."
    if (error.status === 429) return "Слишком много запросов. Попробуйте через минуту."
    return "Источник данных не ответил. Повторите проверку."
  }
  return error instanceof Error ? error.message : "Не удалось проверить активы. Попробуйте ещё раз."
}
