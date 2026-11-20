import { backendUrl } from "./backend"

export class ApiError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly status?: number,
    /** JSON-RPC error code: the node answered and refused, so another node would refuse too */
    readonly rpcCode?: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

type Options = {
  /** short name for error messages, e.g. "CoinGecko" */
  source: string
  timeoutMs?: number
  signal?: AbortSignal
  init?: RequestInit
}

export async function getJson<T>(url: string, { source, timeoutMs = 12_000, signal, init }: Options): Promise<T> {
  signal?.throwIfAborted()
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), timeoutMs)
  const onAbort = () => timeout.abort()
  signal?.addEventListener("abort", onAbort, { once: true })
  try {
    const res = await fetch(backendUrl(url), { ...init, signal: timeout.signal })
    if (res.status === 429) throw new ApiError(`${source}: слишком много запросов, попробуйте через минуту`, source, 429)
    if (!res.ok) throw new ApiError(`${source} ответил ошибкой ${res.status}`, source, res.status)
    return (await res.json()) as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    if (signal?.aborted) throw e
    if (timeout.signal.aborted) throw new ApiError(`${source} не ответил за ${Math.round(timeoutMs / 1000)} с`, source)
    throw new ApiError(`${source} недоступен: проверьте интернет`, source)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
}

/**
 * POST a plain-text body and read a plain-text answer. `text/plain` keeps it a CORS "simple request"
 * (no preflight): mempool.space's broadcast endpoint answers OPTIONS with 404 (research/05 §1.15).
 * The server's own error text is kept in the message (it says why a transaction was refused).
 */
export async function postText(url: string, body: string, { source, timeoutMs = 20_000, signal }: Omit<Options, "init">): Promise<string> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), timeoutMs)
  const onAbort = () => timeout.abort()
  signal?.addEventListener("abort", onAbort)
  try {
    const res = await fetch(backendUrl(url), { method: "POST", headers: { "Content-Type": "text/plain" }, body, signal: timeout.signal })
    const text = await res.text()
    if (!res.ok) throw new ApiError(`${source} ответил ошибкой ${res.status}: ${text.slice(0, 300)}`, source, res.status)
    return text
  } catch (e) {
    if (e instanceof ApiError) throw e
    if (signal?.aborted) throw e
    if (timeout.signal.aborted) throw new ApiError(`${source} не ответил за ${Math.round(timeoutMs / 1000)} с`, source)
    throw new ApiError(`${source} недоступен: проверьте интернет`, source)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
}

/** the request never got an answer worth trusting (no connection, timeout, 429, 5xx): another endpoint may do better */
export function isTransient(e: unknown) {
  if (!(e instanceof ApiError)) return false
  if (e.rpcCode !== undefined) return false
  return e.status === undefined || e.status === 429 || e.status >= 500
}

/** JSON-RPC 2.0 POST (Solana, EVM RPC) */
export async function rpc<T>(url: string, method: string, params: unknown[], opts: Omit<Options, "init">): Promise<T> {
  const body = await getJson<{ result?: T; error?: { message: string; code?: number } }>(url, {
    ...opts,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    },
  })
  if (body.error) throw new ApiError(`${opts.source}: ${body.error.message}`, opts.source, undefined, body.error.code ?? 0)
  return body.result as T
}
