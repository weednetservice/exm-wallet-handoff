/**
 * The portfolio: every coin the wallet holds across the switched-on networks, valued at main-network
 * prices. Testnet coins have no market price of their own; the value is a reference, labelled as
 * such in the UI. A coin without a reliable price (custom networks) shows no USD value at all.
 */
import { useQueries, useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { chainData, tokensOf, useEnabledNetworks, type Activity, type Network, type Token } from "@/lib/chains"
import { getCandles, getQuotes, type CandleRange } from "@/lib/api/market"
import { fromUnits } from "@/lib/format"
import { useAccounts, type Source } from "../accounts"
import { useQuotes } from "../data"
import { DEMO_ADDRESSES } from "../demo"
import { getAddressTokenTransfers, getTokenTransfers } from "../tokens/activity"
import { discoverEvmTokens } from "../tokens/discovery"
import { removePendingActivity, usePendingActivity } from "../history/pending"
import { useBitcoinMainnetActivity, useBitcoinMainnetDiscovery } from "../bitcoin/hooks"

export type Holding = {
  network: Network
  address: string
  source: Source
  /** base units; undefined while loading */
  amount?: bigint
  /** amount × price, USD */
  value?: number
  price?: number
  change24h?: number
  loading: boolean
  error?: Error
}

/** a token on one network ("USDC · Arbitrum Sepolia"); `amount` in the token's base units */
export type TokenHolding = Holding & { token: Token; verified: boolean; catalogQuote?: { loading: boolean; retry: () => void } }

/** the network's native coin has a reference price source at all */
export const hasPrice = (network: Network) => !!network.coingeckoId

/** reference prices of the tokens we read (USDC): one shared query, like `useQuotes` for native coins */
function useTokenQuotes(ids: string[]) {
  const key = [...new Set(ids)].sort()
  return useQuery({
    queryKey: ["quotes", "tokens", key.join(",")],
    queryFn: () => getQuotes(key),
    enabled: key.length > 0,
    refetchInterval: 60_000,
    staleTime: 50_000,
  })
}

export function useHoldings() {
  const { accountForNetwork, bitcoinMainnetXpub } = useAccounts()
  const networks = useEnabledNetworks()
  const rows = networks.flatMap((network) => {
    const a = accountForNetwork(network)
    // The public demo addresses only represent testnet activity. Showing one as a
    // mainnet deposit address would invite an irreversible transfer to a stranger.
    return a && !(network.environment === "mainnet" && DEMO_ADDRESSES.includes(a.address))
      ? [{ network, address: a.address, source: a.source }]
      : []
  })
  const quotes = useQuotes(rows.length > 0)
  const bitcoinDiscovery = useBitcoinMainnetDiscovery(rows.some((row) => row.network.id === "bitcoin-mainnet") && !!bitcoinMainnetXpub)
  const balances = useQueries({
    queries: rows.map((r) => ({
      queryKey: ["balance", r.network.id, r.address],
      queryFn: ({ signal }: { signal: AbortSignal }) => chainData(r.network).getBalance(r.address, signal),
      enabled: !(r.network.id === "bitcoin-mainnet" && !!bitcoinMainnetXpub),
      refetchInterval: 20_000,
      staleTime: 10_000,
    })),
  })
  const holdings: Holding[] = rows.map((r, i) => {
    const q = hasPrice(r.network) ? quotes.data?.[r.network.coingeckoId] : undefined
    const b = balances[i]
    const discovered = r.network.id === "bitcoin-mainnet" && !!bitcoinMainnetXpub
    const amount = discovered ? bitcoinDiscovery.error ? undefined : bitcoinDiscovery.data?.balance : b.data?.native
    const coins = amount !== undefined ? Number(fromUnits(amount, r.network.native.decimals)) : undefined
    return {
      ...r,
      amount,
      price: q?.usd,
      change24h: q?.change24h,
      value: coins !== undefined && q ? coins * q.usd : undefined,
      loading: discovered ? bitcoinDiscovery.isLoading : b.isLoading,
      error: (discovered ? bitcoinDiscovery.error : b.error) as Error | undefined,
    }
  })

  // Contracts in tokensOf() are reviewed separately from explorer-discovered tokens.
  const tokenRows = rows.flatMap((r) => tokensOf(r.network).map((token) => ({ ...r, token })))
  const tokenBalances = useQueries({
    queries: tokenRows.map((r) => ({
      queryKey: ["token-balance", r.network.id, r.token.address, r.address],
      queryFn: ({ signal }: { signal: AbortSignal }) => chainData(r.network).getTokenBalance!(r.address, r.token, signal),
      enabled: !!chainData(r.network).getTokenBalance,
      refetchInterval: 30_000,
      staleTime: 15_000,
    })),
  })
  const tokenQuotes = useTokenQuotes(tokenRows.map((r) => r.token.coingeckoId))
  const tokens: TokenHolding[] = tokenRows.map((r, i) => {
    const q = tokenQuotes.data?.[r.token.coingeckoId]
    const b = tokenBalances[i]
    const amount = b.data
    const coins = amount !== undefined ? Number(fromUnits(amount, r.token.decimals)) : undefined
    return {
      ...r,
      verified: true,
      amount,
      price: q?.usd,
      change24h: q?.change24h,
      value: coins !== undefined && q ? coins * q.usd : undefined,
      loading: b.isLoading,
      error: (b.error as Error) ?? undefined,
    }
  })

  const discoverRows = rows.filter((r) => r.network.family === "evm" && r.network.history?.kind === "blockscout")
  const discoveries = useQueries({
    queries: discoverRows.map((r) => ({
      queryKey: ["discovered-tokens", r.network.id, r.address],
      queryFn: ({ signal }: { signal: AbortSignal }) => discoverEvmTokens(r.network, r.address, signal),
      refetchInterval: 60_000,
      staleTime: 30_000,
    })),
  })
  const catalogIds = discoveries.flatMap((result) => (result.data?.items ?? []).flatMap(({ token }) => token.coingeckoId ? [token.coingeckoId] : []))
  const catalogQuotes = useTokenQuotes(catalogIds)
  const unverifiedTokens: TokenHolding[] = discoveries.flatMap((result, index) => (result.data?.items ?? []).map(({ token, amount }) => {
    const quote = catalogQuotes.data?.[token.coingeckoId]
    const value = quote && Number(fromUnits(amount, token.decimals)) * quote.usd
    return {
      ...discoverRows[index], token, amount, verified: false, loading: false,
      catalogQuote: token.coingeckoId ? { loading: catalogQuotes.isLoading || catalogQuotes.isFetching, retry: catalogQuotes.refetch } : undefined,
      price: quote?.usd,
      value: value !== undefined && Number.isFinite(value) ? value : undefined,
    }
  }))
  const hiddenUnverifiedByEnvironment = {
    mainnet: discoveries.reduce((sum, result, index) => sum + (discoverRows[index].network.environment === "mainnet" ? result.data?.hiddenCount ?? 0 : 0), 0),
    testnet: discoveries.reduce((sum, result, index) => sum + (discoverRows[index].network.environment === "testnet" ? result.data?.hiddenCount ?? 0 : 0), 0),
  }
  const discoveryLoadingByEnvironment = {
    mainnet: discoveries.some((result, index) => discoverRows[index].network.environment === "mainnet" && result.isLoading),
    testnet: discoveries.some((result, index) => discoverRows[index].network.environment === "testnet" && result.isLoading),
  }
  const discoveryErrors = discoveries.flatMap((result, index) => result.error ? [{ network: discoverRows[index].network, retry: result.refetch }] : [])

  // the total waits for every coin that has a price source; coins without one are left out of it
  const priced = holdings.filter((h) => hasPrice(h.network))
  const ready = holdings.length > 0 && priced.every((h) => h.value !== undefined)
  const total = ready ? priced.reduce((s, h) => s + (h.value ?? 0), 0) : undefined
  // what the same coins were worth 24 h ago: value / (1 + change)
  const change24h = ready
    ? priced.reduce((s, h) => s + (h.value ?? 0) - (h.value ?? 0) / (1 + (h.change24h ?? 0) / 100), 0)
    : undefined
  // prices come back partial when one source knows a coin and the rest are down: say so instead of waiting forever
  const heldNative = priced.filter((holding) => holding.amount !== undefined && holding.amount > 0n)
  const unpriced = quotes.isSuccess ? heldNative.find((holding) => holding.price === undefined) : undefined
  const priceError = unpriced ? new Error(`Курс ${unpriced.network.native.symbol} сейчас недоступен`) : undefined
  // Include held tokens in the headline balance once every priced token has loaded.
  const heldTokens = tokens.filter((t) => t.amount !== undefined && t.amount > 0n)
  const unpricedToken = tokenQuotes.isSuccess && heldTokens.find((token) => token.value === undefined)
  const tokenPriceError = unpricedToken ? new Error(`Курс ${unpricedToken.token.symbol} сейчас недоступен`) : undefined
  const tokensReady = heldTokens.every((t) => t.value !== undefined) && tokens.every((t) => !t.loading && !t.error)
  const tokensTotal = tokensReady ? heldTokens.reduce((s, t) => s + (t.value ?? 0), 0) : undefined
  const environmentBalance = (environment: Network["environment"]) => {
    const rows = [...holdings, ...tokens].filter((row) => row.network.environment === environment)
    const missing = rows.filter((row) => row.amount === undefined || (row.amount !== 0n && row.value === undefined))
    const known = rows.filter((row) => row.amount === 0n || row.value !== undefined)
    const value = known.length ? known.reduce((sum, row) => sum + (row.value ?? 0), 0) : undefined
    return { total: rows.length && !missing.length ? value : undefined, partial: missing.length ? value : undefined, missing: missing.length }
  }
  const mainnetBalance = environmentBalance("mainnet")
  const testnetBalance = environmentBalance("testnet")
  return {
    holdings,
    /** every token row (zero balances included); show the ones with `amount > 0n` */
    tokens,
    unverifiedTokens,
    hiddenUnverifiedByEnvironment,
    discoveryLoadingByEnvironment,
    discoveryErrors,
    /** native coins only, kept for consumers that need that subtotal */
    nativeTotal: total,
    tokensTotal,
    /** native coins plus tokens */
    total: total !== undefined && tokensTotal !== undefined ? total + tokensTotal : undefined,
    totalWithTokens: total !== undefined && tokensTotal !== undefined ? total + tokensTotal : undefined,
    /** Real funds and test coins must never share one headline balance. */
    mainnetTotal: mainnetBalance.total,
    testnetReferenceTotal: testnetBalance.total,
    partialBalanceByEnvironment: { mainnet: mainnetBalance.partial, testnet: testnetBalance.partial },
    missingBalanceByEnvironment: { mainnet: mainnetBalance.missing, testnet: testnetBalance.missing },
    change24h,
    quoteSource: quotes.data ? Object.values(quotes.data)[0]?.source : undefined,
    loading: holdings.some((holding) => holding.loading) || tokens.some((token) => token.loading)
      || heldNative.length > 0 && quotes.isLoading || heldTokens.length > 0 && tokenQuotes.isLoading,
    error: holdings.find((holding) => holding.error)?.error
      ?? tokens.find((token) => token.error)?.error
      ?? (heldNative.length ? quotes.error ?? priceError : undefined)
      ?? (heldTokens.length ? tokenQuotes.error ?? tokenPriceError : undefined),
    refetch: () => {
      quotes.refetch()
      if (bitcoinMainnetXpub) bitcoinDiscovery.refetch()
      balances.forEach((b) => b.refetch())
      tokenBalances.forEach((b) => b.refetch())
      discoveries.forEach((result) => result.refetch())
      if (tokenRows.length) tokenQuotes.refetch()
      if (catalogIds.length) catalogQuotes.refetch()
    },
  }
}

/** value of the coins held now, over a past period: Σ amount × close, candle by candle */
export function usePortfolioHistory(holdings: Holding[], range: CandleRange) {
  // only coins with a chart and a price: a custom network's coin has neither
  const held = holdings.filter((h) => h.amount !== undefined && h.amount > 0n && !!h.network.binanceSymbol && h.value !== undefined)
  const symbols = [...new Set(held.map((h) => h.network.binanceSymbol))]
  const key = held.map((h) => `${h.network.id}:${h.amount}`).join("|")
  return useQuery({
    queryKey: ["portfolio-history", range, key],
    enabled: held.length > 0,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const series = await Promise.all(symbols.map((s) => getCandles(s, range, signal)))
      const bySymbol = Object.fromEntries(symbols.map((s, i) => [s, series[i]]))
      // coins can come from different exchanges with different candle steps (TON from Coinbase):
      // walk the timeline of the most valuable coin and take every other coin's last close at that time
      const base = [...held].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]
      const timeline = bySymbol[base.network.binanceSymbol].map((c) => c.time)
      const start = Math.max(...series.map((s) => s[0]?.time ?? 0))
      const closeAt = (candles: { time: number; close: number }[], t: number) => {
        let lo = 0,
          hi = candles.length - 1,
          found = candles[0]
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (candles[mid].time <= t) {
            found = candles[mid]
            lo = mid + 1
          } else hi = mid - 1
        }
        return found.close
      }
      return timeline
        .filter((t) => t >= start)
        .map((time) => ({
          time,
          value: held.reduce((sum, h) => sum + Number(fromUnits(h.amount!, h.network.native.decimals)) * closeAt(bySymbol[h.network.binanceSymbol], time), 0),
        }))
    },
  })
}

/** every switched-on network's latest operations, newest first */
export function useAllActivity() {
  const { accountForNetwork, bitcoinMainnetXpub } = useAccounts()
  const pending = usePendingActivity()
  const networks = useEnabledNetworks()
  const withAccount = networks.filter((n) => {
    const account = accountForNetwork(n)
    return account && !(n.environment === "mainnet" && DEMO_ADDRESSES.includes(account.address))
  })
  const bitcoinActivityEnabled = !!bitcoinMainnetXpub && withAccount.some((network) => network.id === "bitcoin-mainnet")
  const bitcoinActivity = useBitcoinMainnetActivity(bitcoinActivityEnabled)
  // networks without a keyless history API are not asked: the UI names them instead ("история недоступна")
  const rows = withAccount.flatMap((network) => (network.history && !(network.id === "bitcoin-mainnet" && bitcoinActivityEnabled) ? [{ network, address: accountForNetwork(network)!.address }] : []))
  const results = useQueries({
    queries: rows.map((r) => ({
      queryKey: ["activity", r.network.id, r.address],
      queryFn: ({ signal }: { signal: AbortSignal }) => chainData(r.network).getActivity(r.address, signal),
      refetchInterval: 30_000,
      staleTime: 15_000,
    })),
  })
  const tokenRows = withAccount.flatMap((network) => network.history?.kind === "blockscout"
    ? tokensOf(network).map((token) => ({ network, token, address: accountForNetwork(network)!.address }))
    : [])
  const tokenResults = useQueries({
    queries: tokenRows.map((row) => ({
      queryKey: ["token-activity", row.network.id, row.token.address, row.address],
      queryFn: ({ signal }: { signal: AbortSignal }) => getTokenTransfers(row.network, row.token, row.address, signal),
      refetchInterval: 30_000,
      staleTime: 15_000,
    })),
  })
  const addressTokenRows = withAccount.flatMap((network) => network.history?.kind === "blockscout"
    ? [{ network, address: accountForNetwork(network)!.address }]
    : [])
  const addressTokenResults = useQueries({
    queries: addressTokenRows.map((row) => ({
      queryKey: ["all-token-activity", row.network.id, row.address],
      queryFn: ({ signal }: { signal: AbortSignal }) => getAddressTokenTransfers(row.network, row.address, signal),
      refetchInterval: 30_000,
      staleTime: 15_000,
    })),
  })
  const nativeItems = [...results.flatMap((r) => r.data ?? []), ...(bitcoinActivityEnabled ? bitcoinActivity.data ?? [] : [])]
  const tokenItems: Activity[] = tokenResults.flatMap((result, index) => (result.data ?? []).map((transfer) => {
    const row = tokenRows[index]
    const out = transfer.from.toLowerCase() === row.address.toLowerCase()
    const incoming = transfer.to.toLowerCase() === row.address.toLowerCase()
    const direction = out && incoming ? "self" : out ? "out" : "in"
    return {
      id: transfer.id,
      hash: transfer.hash,
      direction,
      title: direction === "self" ? "Перевод себе" : direction === "out" ? "Отправка" : "Получение",
      counterparty: direction === "out" ? transfer.to : transfer.from,
      amount: transfer.value,
      token: row.token,
      status: "confirmed",
      time: transfer.time,
      network: row.network,
      explorerUrl: transfer.url,
    }
  }))
  const unverifiedItems: Activity[] = addressTokenResults.flatMap((result, index) => (result.data ?? []).filter((transfer) => !transfer.verified).flatMap((transfer) => {
    const row = addressTokenRows[index]
    const out = transfer.from.toLowerCase() === row.address.toLowerCase()
    const incoming = transfer.to.toLowerCase() === row.address.toLowerCase()
    if (!out && !incoming) return []
    const direction = out && incoming ? "self" : out ? "out" : "in"
    return [{
      id: transfer.id,
      hash: transfer.hash,
      direction,
      title: direction === "self" ? "Перевод себе" : direction === "out" ? "Отправка" : "Получение",
      counterparty: direction === "out" ? transfer.to : transfer.from,
      amount: transfer.value,
      token: transfer.token,
      unverified: true,
      status: "confirmed" as const,
      time: transfer.time,
      network: row.network,
      explorerUrl: transfer.url,
    }]
  }))
  // A direct ERC-20 transfer also has a zero-native-value contract transaction. Show the
  // asset movement once, carrying its network fee into the token row where available.
  const indexed = [...nativeItems, ...tokenItems]
  const nativeByHash = new Map(nativeItems.map((item) => [`${item.network.id}:${item.hash.toLowerCase()}`, item]))
  const tokenByHash = new Map(tokenItems.filter((item) => item.direction === "out").map((item) => [`${item.network.id}:${item.hash.toLowerCase()}`, item]))
  const localItems: Activity[] = pending.flatMap((item) => {
    const network = withAccount.find((candidate) => candidate.id === item.networkId && accountForNetwork(candidate)?.address.toLowerCase() === item.owner.toLowerCase())
    const key = `${item.networkId}:${item.hash.toLowerCase()}`
    if (!network || (item.tokenAddress ? tokenByHash.has(key) : nativeByHash.has(key))) return []
    const token = item.tokenAddress ? tokensOf(network).find((known) => known.address.toLowerCase() === item.tokenAddress?.toLowerCase()) : undefined
    if (item.tokenAddress && !token) return []
    return [{ id: `local:${item.hash}`, hash: item.hash, direction: "out" as const, title: "Отправка", counterparty: item.recipient,
      amount: BigInt(item.amount), token, status: nativeByHash.get(key)?.status === "failed" ? "failed" as const : "pending" as const,
      time: new Date(item.createdAt), network, explorerUrl: network.explorer.tx(item.hash) }]
  })
  useEffect(() => {
    for (const item of pending) {
      if (indexed.some((row) => row.network.id === item.networkId && row.hash.toLowerCase() === item.hash.toLowerCase() && row.status !== "pending" && (item.tokenAddress ? !!row.token : !row.token))) {
        removePendingActivity(item.networkId, item.hash)
      }
    }
  }, [pending, results, tokenResults])
  for (const item of localItems) if (item.token && item.direction === "out") tokenByHash.set(`${item.network.id}:${item.hash.toLowerCase()}`, item)
  const items: Activity[] = [
    ...nativeItems.filter((item) => {
      const token = tokenByHash.get(`${item.network.id}:${item.hash.toLowerCase()}`)
      if (!token || item.title !== "Перевод токена" || item.amount !== 0n) return true
      token.fee = item.fee
      return false
    }),
    ...tokenItems,
    ...localItems,
  ]
    .sort((a, b) => (b.time?.getTime() ?? Date.now()) - (a.time?.getTime() ?? Date.now()))
  return {
    items,
    unverifiedItems,
    unverifiedLoading: addressTokenResults.some((r) => r.isLoading),
    unverifiedErrors: addressTokenResults.flatMap((r, i) => r.error ? [{ network: addressTokenRows[i].network, retry: r.refetch }] : []),
    loading: results.some((r) => r.isLoading) || tokenResults.some((r) => r.isLoading) || bitcoinActivityEnabled && bitcoinActivity.isLoading,
    errors: [
      ...results.flatMap((r, i) => (r.error ? [{ network: rows[i].network, error: r.error as Error, retry: r.refetch }] : [])),
      ...tokenResults.flatMap((r, i) => (r.error ? [{ network: tokenRows[i].network, error: r.error as Error, retry: r.refetch }] : [])),
      ...(bitcoinActivityEnabled && bitcoinActivity.error ? [{ network: withAccount.find((network) => network.id === "bitcoin-mainnet")!, error: bitcoinActivity.error as Error, retry: bitcoinActivity.refetch }] : []),
    ],
    /** switched-on networks with an account whose history cannot be read without a key */
    noHistory: withAccount.filter((n) => !n.history),
    empty: withAccount.length === 0,
  }
}
