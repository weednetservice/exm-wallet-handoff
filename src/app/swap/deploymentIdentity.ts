import { encodeAbiParameters, getCreate2Address, isAddress, keccak256, parseAbi, type Address, type PublicClient } from "viem"
import { ETHEREUM_UNISWAP_DEPLOYMENTS as deployment } from "./deployment-artifacts/ethereum"

type IdentityClient = Pick<PublicClient, "getChainId" | "getBlockNumber" | "getCode" | "readContract">
type Route = { tokenIn: Address; tokenOut: Address; feeTier: number }
const abi = parseAbi([
  "function factory() view returns (address)",
  "function WETH9() view returns (address)",
  "function factoryV2() view returns (address)",
  "function positionManager() view returns (address)",
  "function getPool(address,address,uint24) view returns (address)",
  "function feeAmountTickSpacing(uint24) view returns (int24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
  "function maxLiquidityPerTick() view returns (uint128)",
])
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
function reject(): never { throw new Error("Контракты маршрута не прошли проверку. Обмен остановлен; обновите расчёт.") }

/** One selected pool, one fresh block, no successful-check cache and no write methods. */
export async function assertMainnetDeploymentIdentity(client: IdentityClient, route: Route) {
  if (!isAddress(route.tokenIn) || !isAddress(route.tokenOut)) reject()
  const [token0, token1] = BigInt(route.tokenIn) < BigInt(route.tokenOut) ? [route.tokenIn, route.tokenOut] : [route.tokenOut, route.tokenIn]
  const pool = deployment.pools.find((candidate) => candidate.fee === route.feeTier && same(candidate.token0, token0) && same(candidate.token1, token1))
  if (!pool) reject()
  const salt = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }], [token0, token1, route.feeTier]))
  if (!same(getCreate2Address({ from: deployment.addresses.factory, salt, bytecodeHash: deployment.poolInitCodeHash }), pool.address)) reject()
  if (await client.getChainId() !== deployment.chainId) throw new Error("RPC отвечает за другую сеть. Проверка контрактов Ethereum не выполнена.")
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
  const codeMatches = async (identity: { address: Address; codeHash: string; codeBytes: number }) => {
    const code = await client.getCode({ address: identity.address, blockNumber })
    if (!code || !/^0x(?:[\da-f]{2})+$/i.test(code) || (code.length - 2) / 2 !== identity.codeBytes || keccak256(code) !== identity.codeHash) reject()
  }
  await Promise.all([deployment.router, deployment.quoter, deployment.factory, pool].map(codeMatches))

  const { factory, weth, factoryV2, positionManager } = deployment.addresses
  const addressMatches = async (address: Address, functionName: "factory" | "WETH9" | "factoryV2" | "positionManager" | "token0" | "token1", expected: string) => {
    const actual = await client.readContract({ address, abi, functionName, blockNumber })
    if (!same(actual, expected)) reject()
  }
  await Promise.all([
    addressMatches(deployment.router.address, "factory", factory),
    addressMatches(deployment.router.address, "WETH9", weth),
    addressMatches(deployment.router.address, "factoryV2", factoryV2),
    addressMatches(deployment.router.address, "positionManager", positionManager),
    addressMatches(deployment.quoter.address, "factory", factory),
    addressMatches(deployment.quoter.address, "WETH9", weth),
    addressMatches(pool.address, "factory", factory),
    addressMatches(pool.address, "token0", token0),
    addressMatches(pool.address, "token1", token1),
    (async () => {
      const actual = await client.readContract({ address: factory, abi, functionName: "getPool", args: [token0, token1, route.feeTier], blockNumber })
      if (!same(actual, pool.address)) reject()
    })(),
    (async () => {
      const [fee, spacing, maximum, factorySpacing] = await Promise.all([
        client.readContract({ address: pool.address, abi, functionName: "fee", blockNumber }),
        client.readContract({ address: pool.address, abi, functionName: "tickSpacing", blockNumber }),
        client.readContract({ address: pool.address, abi, functionName: "maxLiquidityPerTick", blockNumber }),
        client.readContract({ address: factory, abi, functionName: "feeAmountTickSpacing", args: [route.feeTier], blockNumber }),
      ])
      if (fee !== pool.fee || spacing !== pool.tickSpacing || factorySpacing !== pool.tickSpacing || maximum !== BigInt(pool.maxLiquidityPerTick)) reject()
    })(),
  ])
  return { blockNumber, pool: pool.address }
}
