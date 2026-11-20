/** Mainnet reads through Esplora. Legacy parameters remain for stored-data recognition. */
import { sha256 } from "viem"
import { getJson } from "../api/http"
import type { Network } from "./networks"
import type { Activity } from "./types"

export type BitcoinNetwork = Network & { family: "bitcoin" }
export type BitcoinActivity = Omit<Activity, "network"> & { network: BitcoinNetwork }

export const BITCOIN_TESTNET4: BitcoinNetwork = {
  id: "bitcoin-testnet4",
  family: "bitcoin",
  environment: "testnet",
  name: "Bitcoin",
  testnetName: "Testnet4",
  native: { symbol: "BTC", decimals: 8, name: "Bitcoin" },
  coingeckoId: "bitcoin",
  binanceSymbol: "BTCUSDT",
  rpcUrl: "https://mempool.space/testnet4/api",
  explorer: {
    name: "mempool.space",
    url: "https://mempool.space/testnet4",
    tx: (h) => `https://mempool.space/testnet4/tx/${h}`,
    address: (a) => `https://mempool.space/testnet4/address/${a}`,
  },
  faucets: [
    { name: "mempool.space", url: "https://mempool.space/testnet4/faucet" },
    { name: "coinfaucet.eu", url: "https://coinfaucet.eu/en/btc-testnet4/" },
  ],
  history: { kind: "node" },
  icons: { network: "NetworkBitcoin", coin: "TokenBTC" },
}

export const BITCOIN_MAINNET: BitcoinNetwork = {
  id: "bitcoin-mainnet",
  family: "bitcoin",
  environment: "mainnet",
  name: "Bitcoin",
  testnetName: "Mainnet",
  native: { symbol: "BTC", decimals: 8, name: "Bitcoin" },
  coingeckoId: "bitcoin",
  binanceSymbol: "BTCUSDT",
  rpcUrl: "https://blockstream.info/api",
  explorer: {
    name: "Blockstream Explorer",
    url: "https://blockstream.info",
    tx: (h) => `https://blockstream.info/tx/${h}`,
    address: (a) => `https://blockstream.info/address/${a}`,
  },
  faucets: [],
  history: { kind: "node" },
  icons: { network: "NetworkBitcoin", coin: "TokenBTC" },
}

/* ------------------------------------------------------------ bech32 / bech32m (BIP173, BIP350) */

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
const BECH32M = 0x2bc830a3

function polymod(values: number[]) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const top = chk >>> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i]
  }
  return chk >>> 0
}
const hrpExpand = (hrp: string) => [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)]

function convertBits(data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] | null {
  let acc = 0
  let bits = 0
  const out: number[] = []
  const maxv = (1 << to) - 1
  for (let i = 0; i < data.length; i++) {
    const value = data[i]
    if (value < 0 || value >> from) return null
    acc = (acc << from) | value
    bits += from
    while (bits >= to) {
      bits -= to
      out.push((acc >> bits) & maxv)
    }
  }
  if (pad) {
    if (bits) out.push((acc << (to - bits)) & maxv)
  } else if (bits >= from || (acc << (to - bits)) & maxv) return null
  return out
}

/** segwit address for a witness program: v0 uses bech32, v1+ bech32m */
export function encodeSegwit(hrp: string, version: number, program: Uint8Array): string {
  const data = [version, ...convertBits(program, 8, 5, true)!]
  const constant = version === 0 ? 1 : BECH32M
  const mod = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ constant
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31)
  return hrp + "1" + [...data, ...checksum].map((d) => CHARSET[d]).join("")
}

export function decodeSegwit(address: string, hrp: string): { version: number; program: Uint8Array } | null {
  const a = address.trim()
  if (a !== a.toLowerCase() && a !== a.toUpperCase()) return null
  const s = a.toLowerCase()
  const pos = s.lastIndexOf("1")
  if (pos < 1 || pos + 7 > s.length || s.length > 90 || s.slice(0, pos) !== hrp) return null
  const data: number[] = []
  for (const c of s.slice(pos + 1)) {
    const d = CHARSET.indexOf(c)
    if (d < 0) return null
    data.push(d)
  }
  const check = polymod([...hrpExpand(hrp), ...data])
  const version = data[0]
  if (check !== (version === 0 ? 1 : BECH32M)) return null
  const program = convertBits(data.slice(1, -6), 5, 8, false)
  if (!program || program.length < 2 || program.length > 40 || version > 16) return null
  if (version === 0 && program.length !== 20 && program.length !== 32) return null
  return { version, program: Uint8Array.from(program) }
}

/* ------------------------------------------------------------ base58check (legacy test addresses) */

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

function base58check(address: string): Uint8Array | null {
  let n = 0n
  for (const c of address) {
    const d = B58.indexOf(c)
    if (d < 0) return null
    n = n * 58n + BigInt(d)
  }
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n >>= 8n
  }
  for (const c of address) {
    if (c !== "1") break
    bytes.unshift(0)
  }
  if (bytes.length !== 25) return null
  const body = Uint8Array.from(bytes.slice(0, 21))
  const sum = sha256(sha256(body, "bytes"), "bytes")
  for (let i = 0; i < 4; i++) if (sum[i] !== bytes[21 + i]) return null
  return body
}

/* ------------------------------------------------------------ addresses → output scripts */

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
export const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16))

/** scriptPubKey of a test-network address, or null for anything else (mainnet addresses included) */
export function testnetOutputScript(address: string): Uint8Array | null {
  const seg = decodeSegwit(address, "tb")
  if (seg) {
    const op = seg.version === 0 ? 0x00 : 0x50 + seg.version
    return Uint8Array.from([op, seg.program.length, ...seg.program])
  }
  const legacy = base58check(address.trim())
  if (!legacy) return null
  const [version, ...h] = legacy
  if (version === 0x6f) return Uint8Array.from([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]) // m… / n… P2PKH
  if (version === 0xc4) return Uint8Array.from([0xa9, 0x14, ...h, 0x87]) // 2… P2SH
  return null
}

/** virtual size an output adds, by script length (P2WPKH 31, P2TR/P2WSH 43, P2PKH 34, P2SH 32) */
export const outputVsize = (script: Uint8Array) => 8 + 1 + script.length

export function validateBitcoinAddress(address: string): string | null {
  const a = address.trim()
  if (!a) return "Введите адрес"
  if (/^(bc1|[13])/i.test(a)) return "Это адрес основной сети Bitcoin: кошелёк работает только в тестовой сети (tb1…)"
  return testnetOutputScript(a) ? null : "Это не похоже на адрес Bitcoin testnet4: обычно он начинается с tb1"
}

export function validateBitcoinMainnetAddress(address: string): string | null {
  const a = address.trim()
  if (!a) return "Введите адрес"
  if (decodeSegwit(a, "bc")) return null
  const legacy = base58check(a)
  if (legacy && (legacy[0] === 0x00 || legacy[0] === 0x05)) return null
  return "Это не адрес основной сети Bitcoin (bc1…, 1… или 3…)"
}

/* ------------------------------------------------------------ Esplora */

export type EsploraTx = {
  txid: string
  fee: number
  status: { confirmed: boolean; block_time?: number }
  vin: { prevout: { scriptpubkey_address?: string; value: number } | null }[]
  vout: { scriptpubkey_address?: string; value: number }[]
}
type AddressStats = { funded_txo_sum: number; spent_txo_sum: number; tx_count: number }

export type Utxo = { txid: string; vout: number; value: number; confirmed: boolean }
export type FeeRates = { fastestFee: number; halfHourFee: number; hourFee: number; economyFee: number; minimumFee: number }

export function bitcoinData(network: BitcoinNetwork = BITCOIN_MAINNET) {
  const api = network.rpcUrl
  const source = network.explorer.name
  const validateAddress = network.id === BITCOIN_MAINNET.id ? validateBitcoinMainnetAddress : validateBitcoinAddress
  const assertAddress = (address: string) => {
    if (network.id !== BITCOIN_MAINNET.id || network.environment !== "mainnet") throw new Error("Доступна только основная сеть Bitcoin")
    const error = validateAddress(address)
    if (error) throw new Error(error)
  }
  return {
    async getAddressSummary(address: string, signal?: AbortSignal) {
      assertAddress(address)
      const a = await getJson<{ chain_stats: AddressStats; mempool_stats: AddressStats }>(`${api}/address/${address}`, { source, signal })
      const sum = (s: AddressStats) => BigInt(s.funded_txo_sum) - BigInt(s.spent_txo_sum)
      if (!Number.isSafeInteger(a.chain_stats.tx_count) || !Number.isSafeInteger(a.mempool_stats.tx_count)) throw new Error(`${source}: неполные данные адреса`)
      return { balance: sum(a.chain_stats) + sum(a.mempool_stats), used: a.chain_stats.tx_count + a.mempool_stats.tx_count > 0 }
    },
    /** confirmed plus unconfirmed, in satoshi */
    async getBalance(address: string, signal?: AbortSignal) {
      const summary = await this.getAddressSummary(address, signal)
      return { network, address, native: summary.balance, at: Date.now() }
    },

    /** the newest 25 transactions (mempool first), as net movements of this address */
    async getRawActivity(address: string, signal?: AbortSignal): Promise<EsploraTx[]> {
      assertAddress(address)
      return getJson<EsploraTx[]>(`${api}/address/${address}/txs`, { source, signal })
    },
    async getActivity(address: string, signal?: AbortSignal): Promise<BitcoinActivity[]> {
      const txs = await this.getRawActivity(address, signal)
      return txs.map((tx) => {
        const spent = tx.vin.reduce((s, i) => s + (i.prevout?.scriptpubkey_address === address ? i.prevout.value : 0), 0)
        const received = tx.vout.reduce((s, o) => s + (o.scriptpubkey_address === address ? o.value : 0), 0)
        const net = received - spent
        const ours = spent > 0
        // what left for someone else: outputs to other addresses when we paid, else what came in
        const direction: Activity["direction"] = net > 0 ? "in" : tx.vout.every((o) => o.scriptpubkey_address === address) ? "self" : "out"
        const amount = direction === "in" ? net : direction === "out" ? tx.vout.reduce((s, o) => s + (o.scriptpubkey_address !== address ? o.value : 0), 0) : 0
        const other = direction === "in" ? tx.vin.find((i) => i.prevout?.scriptpubkey_address && i.prevout.scriptpubkey_address !== address)?.prevout?.scriptpubkey_address : tx.vout.find((o) => o.scriptpubkey_address !== address)?.scriptpubkey_address
        return {
          id: tx.txid,
          hash: tx.txid,
          direction,
          title: direction === "out" ? "Отправка" : direction === "in" ? "Получение" : "Перевод себе",
          counterparty: other,
          amount: BigInt(amount),
          fee: ours ? BigInt(tx.fee) : undefined,
          status: tx.status.confirmed ? "confirmed" : "pending",
          // testnet4 block times run ahead of the clock (min-difficulty blocks): never later than now
          time: tx.status.block_time ? new Date(Math.min(tx.status.block_time * 1000, Date.now())) : undefined,
          network,
          explorerUrl: network.explorer.tx(tx.txid),
        }
      })
    },

    async utxos(address: string, signal?: AbortSignal): Promise<Utxo[]> {
      assertAddress(address)
      const raw = await getJson<{ txid: string; vout: number; value: number; status: { confirmed: boolean } }[]>(`${api}/address/${address}/utxo`, { source, signal })
      return raw.map((u) => ({ txid: u.txid, vout: u.vout, value: u.value, confirmed: u.status.confirmed }))
    },

    /** sat/vB; testnet4 usually sits at 1 */
    feeRates(signal?: AbortSignal) {
      if (network.id !== BITCOIN_MAINNET.id) throw new Error("Доступна только основная сеть Bitcoin")
      return getJson<FeeRates>(`${api}/v1/fees/recommended`, { source, signal })
    },

    /** raw transaction hex → txid; text/plain on purpose (no CORS preflight) */
    async broadcast(_txHex: string, _signal?: AbortSignal): Promise<string> {
      throw new Error("Отправка Bitcoin в основной сети недоступна")
    },

    validateAddress,
  }
}

export { hex as bytesToHexString }
