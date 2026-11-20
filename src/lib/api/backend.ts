const rpcHosts: Record<string, string> = {
  "ethereum-rpc.publicnode.com": "ethereum",
  "mainnet.base.org": "base",
  "base-rpc.publicnode.com": "base",
  "solana-rpc.publicnode.com": "solana",
  "api.mainnet-beta.solana.com": "solana",
}
const dataHosts: Record<string, string> = {
  "eth.blockscout.com": "ethereum-history",
  "base.blockscout.com": "base-history",
  "blockstream.info": "bitcoin",
  "api.binance.com": "binance",
  "api.exchange.coinbase.com": "coinbase",
  "api.coingecko.com": "coingecko",
  "api.kraken.com": "kraken",
}

/** Only known public data services are translated; there is no arbitrary URL proxy. */
export function backendUrl(value: string): string {
  if (typeof window === "undefined") return value
  const url = new URL(value, window.location.origin)
  if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) return url.href
  const rpc = rpcHosts[url.hostname]
  if (rpc) return new URL(`/api/rpc/${rpc}`, window.location.origin).href
  const data = dataHosts[url.hostname]
  if (data) return new URL(`/api/data/${data}${url.pathname}${url.search}`, window.location.origin).href
  throw new Error("Сервис не подключён к backend EXM")
}
