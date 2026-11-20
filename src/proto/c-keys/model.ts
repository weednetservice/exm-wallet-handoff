/** Устройство направления C: 4 ключа (адреса), их сети и монеты. Числа берутся из снимка `snapshot.ts`. */
import { ADDRESS, BALANCE, GAS_PRICE, PRICE } from "./snapshot"

export type KeyId = "evm" | "solana" | "ton" | "bitcoin"

export type Net = {
  id: string
  key: KeyId
  /** короткое имя под логотипом в веере */
  name: string
  /** полное имя тестовой сети */
  full: string
  symbol: string
  decimals: number
}

const evm = (id: string, name: string, full: string, symbol = "ETH"): Net => ({ id, key: "evm", name, full, symbol, decimals: 18 })

export const NETS: Net[] = [
  evm("sepolia", "Ethereum", "Ethereum Sepolia"),
  evm("base-sepolia", "Base", "Base Sepolia"),
  evm("arbitrum-sepolia", "Arbitrum", "Arbitrum Sepolia"),
  evm("op-sepolia", "OP", "OP Sepolia"),
  evm("unichain-sepolia", "Unichain", "Unichain Sepolia"),
  evm("polygon-amoy", "Polygon", "Polygon Amoy", "POL"),
  evm("avalanche-fuji", "Avalanche", "Avalanche Fuji", "AVAX"),
  evm("bnb-testnet", "BNB", "BNB Testnet", "BNB"),
  evm("linea-sepolia", "Linea", "Linea Sepolia"),
  evm("zksync-sepolia", "ZKsync", "ZKsync Sepolia"),
  evm("monad-testnet", "Monad", "Monad Testnet", "MON"),
  { id: "solana-devnet", key: "solana", name: "Solana", full: "Solana Devnet", symbol: "SOL", decimals: 9 },
  { id: "ton-testnet", key: "ton", name: "TON", full: "TON Testnet", symbol: "TON", decimals: 9 },
  { id: "bitcoin-testnet4", key: "bitcoin", name: "Bitcoin", full: "Bitcoin Testnet4", symbol: "BTC", decimals: 8 },
]

export const EVM_NETS = NETS.filter((n) => n.key === "evm")
export const netById = (id: string) => NETS.find((n) => n.id === id)!

export type Key = { id: KeyId; title: string; sub: string; address?: string; nets: Net[] }

const netsOf = (k: KeyId) => NETS.filter((n) => n.key === k)
export const KEYS: Key[] = [
  { id: "evm", title: "EVM", sub: `${plural(EVM_NETS.length, "сеть", "сети", "сетей")}`, address: ADDRESS.evm, nets: netsOf("evm") },
  { id: "solana", title: "Solana", sub: "Devnet", address: ADDRESS.solana, nets: netsOf("solana") },
  { id: "ton", title: "TON", sub: "Testnet", address: ADDRESS.ton, nets: netsOf("ton") },
  { id: "bitcoin", title: "Bitcoin", sub: "Testnet4", address: ADDRESS.bitcoin, nets: netsOf("bitcoin") },
]
export const keyById = (id: KeyId) => KEYS.find((k) => k.id === id)!

/** монеты в постоянном порядке ключей: строки списка не переставляются от суммы */
export const COINS = ["ETH", "POL", "AVAX", "BNB", "MON", "SOL", "TON", "BTC"].map((symbol) => ({
  symbol,
  nets: NETS.filter((n) => n.symbol === symbol),
}))
export type Coin = (typeof COINS)[number]
export const coinBySymbol = (s: string) => COINS.find((c) => c.symbol === s)!

/** баланс сети из снимка; undefined, если у ключа в демо нет адреса (Bitcoin) */
export function balanceOf(net: Net): bigint | undefined {
  return keyById(net.key).address ? (BALANCE[net.id] ?? 0n) : undefined
}

export function toNumber(amount: bigint, decimals: number) {
  return Number(amount) / 10 ** decimals
}

export function fiatOf(net: Net): number {
  const b = balanceOf(net)
  return b === undefined ? 0 : toNumber(b, net.decimals) * PRICE[net.symbol]
}

export const TOTAL_FIAT = NETS.reduce((s, n) => s + fiatOf(n), 0)

/** 1 сеть, 2 сети, 11 сетей */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
  return `${n} ${w}`
}

export type Parts = { int: string; frac: string; /** сколько первых знаков дроби это нули до первой значащей цифры */ lead: number; zero: boolean }

const nbsp = " "
const group3 = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, nbsp)

/**
 * Сумма по частям для столбца по запятой. Дробь обрезается (не округляется вверх: кошелёк не показывает
 * больше, чем есть), хвостовые нули убираются; если значащие цифры глубже `max`, дробь идёт до первых двух значащих.
 */
export function coinParts(amount: bigint, decimals: number, max = 4): Parts {
  const base = 10n ** BigInt(decimals)
  const int = (amount / base).toString()
  const raw = (amount % base).toString().padStart(decimals, "0")
  const lead = raw.match(/^0*/)![0].length
  const cut = lead >= max && lead < decimals ? Math.min(decimals, lead + 2) : max
  const frac = raw.slice(0, cut).replace(/0+$/, "")
  // тихими становятся только длинные хвосты нулей (от трёх, как 0,000 078): в «0,01» серый ноль читался бы как сбой
  return { int: group3(int), frac, lead: lead >= 3 ? Math.min(lead, frac.length) : 0, zero: amount === 0n }
}

export function fiatParts(value: number): Parts {
  const cents = Math.floor(value * 100 + 1e-9)
  return { int: group3(Math.floor(cents / 100).toString()), frac: (cents % 100).toString().padStart(2, "0"), lead: 0, zero: cents === 0 }
}

/** «0,2206 ETH» одной строкой: для подписей и читалки экрана */
export function partsText(p: Parts, unit?: string) {
  return `${p.int}${p.frac ? "," + p.frac : ""}${unit ? " " + unit : ""}`
}

/** оценка комиссии простого перевода в базовых единицах сети; undefined, если в снимке её нет */
export function feeOf(net: Net): bigint | undefined {
  if (net.key === "evm") return GAS_PRICE[net.id] * 21000n
  if (net.key === "solana") return 5000n // базовая комиссия Solana за подпись, задана протоколом
  return undefined
}

export type Family = KeyId
/** чей это адрес, по его виду; null, если на адрес не похоже */
export function familyOf(address: string): Family | null {
  const a = address.trim()
  if (/^0x[0-9a-fA-F]{40}$/.test(a)) return "evm"
  if (/^(tb1|bc1)[02-9ac-hj-np-z]{20,80}$/i.test(a) || /^[mn2][1-9A-HJ-NP-Za-km-z]{25,39}$/.test(a)) return "bitcoin"
  if (/^[EUk0][Qf][A-Za-z0-9_-]{46}$/.test(a)) return "ton"
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return "solana"
  return null
}

export const FAMILY_NAME: Record<Family, string> = { evm: "EVM", solana: "Solana", ton: "TON", bitcoin: "Bitcoin" }

/**
 * Адрес «края и середина»: группы по 4 знака в две строки; яркие первые две и последние две группы.
 * У EVM приставка 0x одинакова у всех адресов, поэтому стоит отдельно и приглушена.
 */
export function addressLines(address: string): { prefix: string; lines: { text: string; edge: boolean }[][] } {
  const prefix = address.startsWith("0x") ? "0x" : ""
  const body = address.slice(prefix.length)
  const groups = body.match(/.{1,4}/g) ?? []
  const first = Math.ceil(groups.length / 2)
  const mark = groups.map((text, i) => ({ text, edge: i < 2 || i >= groups.length - 2 }))
  return { prefix, lines: [mark.slice(0, first), mark.slice(first)] }
}
