import { parseAbi, type Address, type PublicClient } from "viem"

type Symbol = "ETH" | "USDC" | "DAI"
type PriceQuote = {
  input: string
  output: string
  amountIn: bigint
  amountOut: bigint
  minimumOut: bigint
}

type Feed = { address: Address; heartbeat: bigint; assetDecimals: bigint }
const feeds: Record<Symbol, Feed> = {
  ETH: { address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", heartbeat: 3_600n, assetDecimals: 18n },
  USDC: { address: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", heartbeat: 82_800n, assetDecimals: 6n },
  DAI: { address: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9", heartbeat: 3_600n, assetDecimals: 18n },
}

const oracleAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
])

const BPS = 10_000n
const MAX_QUOTE_DEVIATION = 300n
const MAX_MINIMUM_SHORTFALL = 350n
const MAX_BLOCK_AGE = 120n
const MAX_CLOCK_SKEW = 30n
const MAX_ROUND_DELAY = 120n
const ORACLE_UNAVAILABLE = "Не удалось сверить курс с независимым источником. Обновите расчёт позже."
const PRICE_OUTSIDE_LIMIT = "Курс вышел за пределы независимой проверки. Обновите расчёт или уменьшите сумму."

type OracleClient = Pick<PublicClient, "getChainId" | "getBlock" | "readContract">

function supportedSymbol(symbol: string): symbol is Symbol {
  return symbol === "ETH" || symbol === "USDC" || symbol === "DAI"
}

async function readFreshAnswer(client: OracleClient, feed: Feed, blockNumber: bigint, blockTime: bigint) {
  const request = { address: feed.address, abi: oracleAbi, blockNumber } as const
  const [decimals, [round, price, startedAt, updatedAt]] = await Promise.all([
    client.readContract({ ...request, functionName: "decimals" }),
    client.readContract({ ...request, functionName: "latestRoundData" }),
  ])
  if (decimals !== 8 || round <= 0n || price <= 0n || startedAt <= 0n || updatedAt < startedAt || updatedAt > blockTime || blockTime - updatedAt > feed.heartbeat + MAX_ROUND_DELAY) {
    throw new Error(ORACLE_UNAVAILABLE)
  }
  return price
}

/** Compare the reviewed amounts with Chainlink USD rounds read at a single recent Ethereum block. */
export async function assertMainnetOraclePrice(client: OracleClient, quote: PriceQuote) {
  const { input, output, amountIn, amountOut, minimumOut } = quote
  if (!supportedSymbol(input) || !supportedSymbol(output) || input === output || (input !== "ETH" && output !== "ETH") || amountIn <= 0n || minimumOut <= 0n || minimumOut > amountOut) {
    throw new Error(ORACLE_UNAVAILABLE)
  }

  let prices: [bigint, bigint]
  try {
    if (await client.getChainId() !== 1) throw new Error(ORACLE_UNAVAILABLE)
    const block = await client.getBlock({ blockTag: "latest" })
    const now = BigInt(Math.floor(Date.now() / 1_000))
    if (block.number === null || block.timestamp > now + MAX_CLOCK_SKEW || now - block.timestamp > MAX_BLOCK_AGE) throw new Error(ORACLE_UNAVAILABLE)
    prices = await Promise.all([
      readFreshAnswer(client, feeds[input], block.number, block.timestamp),
      readFreshAnswer(client, feeds[output], block.number, block.timestamp),
    ])
  } catch {
    throw new Error(ORACLE_UNAVAILABLE)
  }

  const [priceIn, priceOut] = prices
  // Both price feeds have 8 decimals. Cross-multiply to avoid truncation on small amounts.
  const expected = amountIn * priceIn * 10n ** feeds[output].assetDecimals
  const outputScale = priceOut * 10n ** feeds[input].assetDecimals * BPS
  const offered = amountOut * outputScale
  const minimum = minimumOut * outputScale
  if (offered < expected * (BPS - MAX_QUOTE_DEVIATION) ||
      offered > expected * (BPS + MAX_QUOTE_DEVIATION) ||
      minimum < expected * (BPS - MAX_MINIMUM_SHORTFALL)) {
    throw new Error(PRICE_OUTSIDE_LIMIT)
  }
}
