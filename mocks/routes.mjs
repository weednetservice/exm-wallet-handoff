import { encodeAbiParameters } from 'viem'
import wallet from './wallet.json' with { type: 'json' }

const blockHash = '0x' + '1'.repeat(64)
const otherAddress = '0x' + '2'.repeat(40)
const sampleBitcoin = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
const hex = value => '0x' + BigInt(value).toString(16)
const word = value => encodeAbiParameters([{ type: 'uint256' }], [BigInt(value)])
const intervalMs = { '1m': 60e3, '15m': 900e3, '2h': 7200e3, '8h': 28800e3, '3d': 259200e3, '1w': 604800e3 }
const coingecko = { ethereum: 'ETH', bitcoin: 'BTC', solana: 'SOL', 'the-open-network': 'TON', dai: 'DAI', tether: 'USDT', 'usd-coin': 'USDC', weth: 'WETH', monad: 'MON', binancecoin: 'BNB', 'avalanche-2': 'AVAX', 'polygon-ecosystem-token': 'POL' }
const sameAsset = (network, a, b) => network === 'solana' ? a === b : a?.toLowerCase() === b?.toLowerCase()

function mockCall(network, call, amount) {
  const data = typeof call?.data === 'string' ? call.data.toLowerCase() : ''
  const asset = wallet.tokens.find(token => token.network === network && sameAsset(network, token.contract, call?.to))
  if (data.startsWith('0x70a08231')) return word(amount(asset?.amount))
  if (data.startsWith('0xdd62ed3e')) return word(0)
  if (data.startsWith('0x313ce567')) return word(asset?.decimals ?? 18)
  if (data.startsWith('0xc6a5026a') && data.length >= 202) {
    const tokenIn = '0x' + data.slice(34, 74)
    const tokenOut = '0x' + data.slice(98, 138)
    const input = wallet.tokens.find(token => token.contract === tokenIn)
    const output = wallet.tokens.find(token => token.contract === tokenOut)
    if (!input || !output) return '0x'
    const amountIn = BigInt('0x' + data.slice(138, 202))
    const [priceIn] = wallet.prices[input.symbol]
    const [priceOut] = wallet.prices[output.symbol]
    const amountOut = amountIn * BigInt(Math.round(priceIn * 100)) * 10n ** BigInt(output.decimals) /
      (BigInt(Math.round(priceOut * 100)) * 10n ** BigInt(input.decimals))
    return encodeAbiParameters([{ type: 'uint256' }, { type: 'uint160' }, { type: 'uint32' }, { type: 'uint256' }], [amountOut, 1n << 96n, 1, 130000n])
  }
  return '0x'
}

function rpc(network, entry, amount) {
  const id = entry?.id ?? null
  const result = value => ({ jsonrpc: '2.0', id, result: value })
  const params = Array.isArray(entry?.params) ? entry.params : []
  switch (entry?.method) {
    case 'eth_chainId': return result(network === 'base' ? '0x2105' : '0x1')
    case 'eth_blockNumber': return result('0x100')
    case 'eth_getBalance': return result(hex(amount(wallet.balances[network])))
    case 'eth_getCode': return result('0x')
    case 'eth_getTransactionCount': return result('0x0')
    case 'eth_estimateGas': return result('0xea60')
    case 'eth_gasPrice':
    case 'eth_maxPriorityFeePerGas': return result('0x3b9aca00')
    case 'eth_feeHistory': return result({ oldestBlock: '0xff', baseFeePerGas: ['0x3b9aca00', '0x3b9aca00'], gasUsedRatio: [0.5], reward: [['0x3b9aca00']] })
    case 'eth_getBlockByNumber': return result({ number: '0x100', hash: blockHash, parentHash: '0x' + '0'.repeat(64), baseFeePerGas: '0x3b9aca00', gasLimit: '0x1c9c380', gasUsed: '0x5208', timestamp: hex(Math.floor(Date.now() / 1000)), transactions: [] })
    case 'eth_call': return result(mockCall(network, params[0], amount))
    case 'eth_getTransactionByHash':
    case 'eth_getTransactionReceipt': return result(null)
    case 'getGenesisHash': return result('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')
    case 'getBalance': return result({ context: { slot: 256 }, value: Number(amount(wallet.balances.solana)) })
    case 'getTokenAccountsByOwner': {
      const token = wallet.tokens.find(item => item.network === 'solana' && item.contract === params[1]?.mint)
      return result({ context: { slot: 256 }, value: token ? [{ account: { data: { parsed: { info: { tokenAmount: { amount: amount(token.amount) } } } } } }] : [] })
    }
    case 'getSignaturesForAddress': return result([])
    default: return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Operation unavailable in the frontend mock' } }
  }
}

function market(path, query) {
  const now = Date.now()
  const symbol = query.get('symbol')?.replace(/USDT$/, '') ?? path.match(/\/products\/([^-]+)-USD/)?.[1] ?? 'ETH'
  const [price, change] = wallet.prices[symbol] ?? wallet.prices.ETH
  if (path.endsWith('/ticker/24hr')) return Object.entries(wallet.prices).map(([token, [lastPrice, priceChangePercent]]) => ({
    symbol: token + 'USDT', lastPrice: String(lastPrice), priceChangePercent: String(priceChangePercent), closeTime: now,
  }))
  if (path.endsWith('/stats')) return { open: String(price / (1 + change / 100)), last: String(price) }
  if (path.endsWith('/simple/price')) return Object.fromEntries(Object.entries(coingecko).map(([id, token]) => [id, { usd: wallet.prices[token][0], usd_24h_change: wallet.prices[token][1] }]))
  if (path.endsWith('/OHLC')) return { error: [], result: { DAIUSD: Array.from({ length: 96 }, (_, i) => [Math.floor(now / 1000) - (95 - i) * 900, '1', '1.01', '.99', '1', '1', '100', 5]) } }
  if (path.endsWith('/klines') || path.endsWith('/candles')) {
    const coinbase = path.endsWith('/candles')
    const step = coinbase ? Number(query.get('granularity') || '900') * 1000 : intervalMs[query.get('interval')] ?? 900000
    const count = Math.min(300, Math.max(2, Number(query.get('limit') || '96')))
    return Array.from({ length: count }, (_, i) => {
      const at = Math.floor(now / step) * step - (count - 1 - i) * step
      const close = price * (0.95 + 0.052 * i / (count - 1) + Math.sin(i / 4.3) * 0.015 + Math.sin(i / 13) * 0.019)
      const open = close * 0.999, low = close * 0.997, high = close * 1.003
      return coinbase ? [Math.floor(at / 1000), low, high, open, close, 350] : [at, open, high, low, close, 350]
    })
  }
  return undefined
}

function history(path, amount, empty) {
  const address = path.split('/').at(-2)
  if (path.endsWith('/token-balances')) {
    const network = path.includes('/base-history/') ? 'base' : 'ethereum'
    return wallet.tokens.filter(token => token.network === network).map(token => ({
      token: { address_hash: token.contract, type: 'ERC-20', symbol: token.symbol, decimals: token.decimals }, value: amount(token.amount),
    }))
  }
  if (path.endsWith('/transactions') && !empty) {
    const tx = (digit, from, to, value, minutesAgo, status) => ({
      hash: '0x' + digit.repeat(64), timestamp: new Date(Date.now() - minutesAgo * 60000).toISOString(),
      status, value, method: null, block_number: 256, fee: { value: '31500000000000' },
      from: { hash: from }, to: { hash: to }, transaction_types: ['coin_transfer'],
    })
    return { items: [
      tx('a', otherAddress, address, '730000000000000000', 37, 'ok'),
      tx('b', address, otherAddress, '28400000000000000', 1600, 'ok'),
      tx('c', address, otherAddress, '120000000000000000', 3500, 'error'),
    ], next_page_params: null }
  }
  return { items: [], next_page_params: null }
}

function portfolio(path, input, amount) {
  if (path.endsWith('/capabilities')) return { indexer: null, networks: wallet.portfolioNetworks }
  const assets = wallet.portfolioNetworks.flatMap(network => {
    const native = { network: network.id, chain: network.name, family: network.family, contract: null, amount: amount(wallet.balances[network.id]), symbol: network.symbol, decimals: network.decimals, name: network.name }
    return [native, ...wallet.tokens.filter(token => token.network === network.id).map(token => ({
      ...token, chain: network.name, family: network.family, amount: amount(token.amount),
    }))]
  })
  if (path.endsWith('/scan')) return { source: 'rpc', assets: assets.filter(asset => asset.family === input?.family && asset.amount !== '0'), cursor: null, partial: false }
  if (path.endsWith('/check')) {
    const asset = assets.find(item => item.network === input?.network && sameAsset(item.network, item.contract, input.contract))
    return asset ? { asset } : undefined
  }
  return undefined
}

const emptyStats = { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 }

export function mockResponse(path, query, input, scenario) {
  const empty = scenario === 'empty'
  const amount = value => empty ? '0' : value ?? '0'
  if (path === '/api/health') return { status: 'ok', mode: 'mock' }
  const network = /^\/api\/rpc\/(ethereum|base|solana)$/.exec(path)?.[1]
  if (network) return Array.isArray(input) ? input.map(entry => rpc(network, entry, amount)) : rpc(network, input, amount)
  if (path.startsWith('/api/portfolio/')) return portfolio(path, input, amount)
  if (/^\/api\/data\/(ethereum|base)-history\//.test(path)) return history(path, amount, empty)
  if (path.startsWith('/api/data/bitcoin/')) {
    if (path.endsWith('/txs') || path.endsWith('/utxo')) return []
    if (path.includes('/api/address/')) return {
      address: path.split('/').at(-1),
      chain_stats: empty || !path.endsWith('/' + sampleBitcoin) ? emptyStats : { ...emptyStats, funded_txo_sum: Number(wallet.balances.bitcoin), tx_count: 1 },
      mempool_stats: emptyStats,
    }
  }
  return market(path, query)
}

export function mockMiddleware(scenario) {
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://fixture.local')
    if (!url.pathname.startsWith('/api/')) return next()
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(data))
    }
    if (scenario === 'offline' && url.pathname !== '/api/health') return reply(503, { error: 'Mock provider is unavailable' })
    if (!['GET', 'POST'].includes(req.method)) return reply(405, { error: 'Method unavailable in the frontend mock' })
    try {
      let input
      if (req.method === 'POST') {
        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += chunk.length
          if (size > 65536) return reply(413, { error: 'Mock request too large' })
          chunks.push(chunk)
        }
        input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }
      const payload = mockResponse(url.pathname, url.searchParams, input, scenario)
      if (payload === undefined) return reply(404, { error: 'Fixture not available' })
      return reply(200, payload)
    } catch {
      return reply(400, { error: 'Invalid mock request' })
    }
  }
}
