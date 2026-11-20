/**
 * Words people read instead of what the system calls things: contract names, operation titles,
 * the reason behind a failed request, and one short time format.
 */
import type { Activity } from "@/lib/chains"
import { ApiError } from "@/lib/api/http"
import { shortAddress } from "@/lib/format"

/** contracts the demo and swap meet, by the names explorers return, said the way a person would */
const KNOWN: [RegExp, string][] = [
  [/^(SwapRouter|UniversalRouter|NonfungiblePositionManager|QuoterV2)/i, "Uniswap"],
  [/^FiatTokenProxy$|^USD Coin$|^USDC$/i, "USDC"],
  [/^WETH9?$|^Wrapped Ether$/i, "Wrapped Ether"],
  [/^LinkToken$|^ChainLink Token$/i, "LINK"],
]

const looksLikeAddress = (s: string) =>
  /^0x[0-9a-f]{40}$/i.test(s) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) || /^[EUk0][Qf][\w-]{46}$/.test(s) || /^-?\d+:[0-9a-f]{64}$/i.test(s)

/** the other side of an operation: a known name, a short address, or the name as the explorer gives it */
export function partyName(party?: string) {
  if (!party) return ""
  const known = KNOWN.find(([re]) => re.test(party))
  if (known) return known[1]
  return looksLikeAddress(party) ? shortAddress(party) : party
}

const WRAP = "Обёртка ETH в WETH"
const UNWRAP = "Возврат из WETH"
export const isWrap = (a: Activity) => a.title === WRAP || a.title === UNWRAP

/** one noun per kind of operation, with the token named when it is known: "Разрешение USDC" */
export function opTitle(a: Activity) {
  if (a.token) return `${a.title} ${a.token.symbol}`
  if (a.title === WRAP) return "ETH → WETH"
  if (a.title === UNWRAP) return "WETH → ETH"
  const party = partyName(a.counterparty)
  const token = party === "USDC" || party === "LINK" ? party : null
  if (a.title === "Разрешение на токен") return token ? `Разрешение ${token}` : "Разрешение"
  if (a.title === "Перевод токена") return token ? `Перевод ${token}` : "Перевод токена"
  return a.title
}

/** the line under the title: the other side, except where the title already says it (ETH → WETH) */
export function opParty(a: Activity) {
  return isWrap(a) ? "" : partyName(a.counterparty)
}

export type OpKind = "in" | "out" | "self" | "swap" | "call"

/** 0.001 ETH: up to this, a demo address's swaps, wraps and transfers to itself are its bots' dust, not a story */
const DUST = 10n ** 15n

/**
 * A service operation: hidden from the lists until asked for. Calls that moved no coins, and, for the
 * demo addresses, the bots' wraps, swaps and transfers to themselves of dust size, every minute.
 */
export function isService(a: Activity, demo: boolean) {
  // A token approval grants a contract spending rights. Keep it visible even though it transfers 0 coins.
  if (a.title === "Разрешение на токен") return false
  const kind = opKind(a)
  if (a.amount === 0n && kind !== "swap") return true
  if (demo && (isWrap(a) || kind === "swap" || kind === "self") && a.amount <= DUST) return true
  return false
}

export function opKind(a: Activity): OpKind {
  if (a.title === "Обмен" || isWrap(a)) return "swap"
  if (a.title === "Получение") return "in"
  if (a.title === "Отправка") return "out"
  if (a.title === "Перевод себе") return "self"
  return "call"
}

/** why a request failed, in a few words, without the raw technical text */
export function reason(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? "")
  const status = e instanceof ApiError ? e.status : undefined
  if (status === 429 || /429|too many|rate/i.test(msg)) return "сервис ограничил запросы, повторите через минуту"
  if (/недоступен|failed to fetch|network|load failed|timeout|timed out|abort/i.test(msg)) return "нет связи с сервисом"
  if (status && status >= 500) return "сервис временно не отвечает"
  return "сервис ответил ошибкой"
}

const clock = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" })
const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })

/** today "14:05", otherwise "12 нояб." */
export function shortWhen(d: Date, now = new Date()) {
  return d.toDateString() === now.toDateString() ? clock.format(d) : day.format(d)
}
export const clockTime = (d: Date) => clock.format(d)
