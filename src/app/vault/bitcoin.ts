/**
 * Bitcoin testnet4 keys and signing, from the same recovery phrase as the other networks.
 *   BIP84, m/84'/1'/0'/0/0 → native segwit P2WPKH, tb1q… (the address Sparrow, Electrum and
 *   BlueWallet show for this phrase on testnet; coin type 1 = every test network, BIP44)
 *
 * Signing is BIP143 (segwit v0) with SIGHASH_ALL, low-S RFC 6979 signatures, version 2, RBF on.
 * Coins are picked largest first; the fee rate comes from mempool.space; change below the dust
 * limit goes to the fee. Only test-network addresses are accepted as recipients.
 *
 * Crypto comes from what the app already bundles (viem's secp256k1, sha256, ripemd160 and HDKey,
 * @scure/bip39), so no new dependency.
 */
import "./polyfill"
import { mnemonicToSeedSync } from "@scure/bip39"
import { ripemd160, sha256 } from "viem"
import { HDKey, sign } from "viem/accounts"
import { BITCOIN_TESTNET4, bitcoinData, bytesToHexString, encodeSegwit, fromHex, outputVsize, testnetOutputScript, type BitcoinNetwork, type Utxo } from "@/lib/chains/bitcoin"
import { BroadcastUncertainError, isDefiniteBroadcastRejection, type SendResult, type SigningGuard } from "./signers"

export const BIP84_TESTNET_PATH = "m/84'/1'/0'/0/0"
export const BIP84_MAINNET_PATH = "m/84'/0'/0'/0/0"

export type BitcoinKeys = { privateKey: Uint8Array; publicKey: Uint8Array; address: string; path: string }

const hash160 = (b: Uint8Array) => ripemd160(sha256(b, "bytes"), "bytes")
const dsha256 = (b: Uint8Array) => sha256(sha256(b, "bytes"), "bytes")

/** testnet4 account from the BIP-39 seed (64 bytes) */
export function deriveBitcoin(seed: Uint8Array, path = BIP84_TESTNET_PATH, hrp = "tb"): BitcoinKeys {
  const node = HDKey.fromMasterSeed(seed).derive(path)
  if (!node.privateKey || !node.publicKey) throw new Error("Не удалось получить ключ Bitcoin")
  return { privateKey: node.privateKey, publicKey: node.publicKey, address: encodeSegwit(hrp, 0, hash160(node.publicKey)), path }
}

export function deriveBitcoinFromWords(words: string[]): BitcoinKeys {
  return deriveBitcoin(mnemonicToSeedSync(words.join(" ")))
}

/** Receiving address only. Mainnet signing is deliberately unavailable in EXM. */
export function deriveBitcoinMainnet(seed: Uint8Array): BitcoinKeys {
  return deriveBitcoin(seed, BIP84_MAINNET_PATH, "bc")
}

/* ------------------------------------------------------------ serialization */

class Writer {
  private parts: number[] = []
  u8(n: number) {
    this.parts.push(n & 0xff)
    return this
  }
  u32(n: number) {
    for (let i = 0; i < 4; i++) this.parts.push((n >>> (8 * i)) & 0xff)
    return this
  }
  u64(n: bigint) {
    for (let i = 0n; i < 8n; i++) this.parts.push(Number((n >> (8n * i)) & 0xffn))
    return this
  }
  varint(n: number) {
    if (n < 0xfd) return this.u8(n)
    if (n <= 0xffff) return this.u8(0xfd).u8(n).u8(n >> 8)
    return this.u8(0xfe).u32(n)
  }
  bytes(b: ArrayLike<number>) {
    for (let i = 0; i < b.length; i++) this.parts.push(b[i])
    return this
  }
  varbytes(b: ArrayLike<number>) {
    return this.varint(b.length).bytes(b)
  }
  done() {
    return Uint8Array.from(this.parts)
  }
}

/** txid as shown (big-endian hex) → the little-endian bytes inside a transaction */
const txidBytes = (txid: string) => fromHex(txid).reverse()

export type TxInput = { txid: string; vout: number; sequence: number; value: bigint }
export type TxOutput = { value: bigint; script: Uint8Array }
export type UnsignedTx = { version: number; inputs: TxInput[]; outputs: TxOutput[]; locktime: number }

/** BIP143 signature hash of input `index` spending a P2WPKH output of `pubkeyHash` (SIGHASH_ALL) */
export function segwitV0Sighash(tx: UnsignedTx, index: number, pubkeyHash: Uint8Array): Uint8Array {
  const prevouts = new Writer()
  const sequences = new Writer()
  for (const i of tx.inputs) {
    prevouts.bytes(txidBytes(i.txid)).u32(i.vout)
    sequences.u32(i.sequence)
  }
  const outputs = new Writer()
  for (const o of tx.outputs) outputs.u64(o.value).varbytes(o.script)
  const input = tx.inputs[index]
  const scriptCode = Uint8Array.from([0x76, 0xa9, 0x14, ...pubkeyHash, 0x88, 0xac])
  const preimage = new Writer()
    .u32(tx.version)
    .bytes(dsha256(prevouts.done()))
    .bytes(dsha256(sequences.done()))
    .bytes(txidBytes(input.txid))
    .u32(input.vout)
    .varbytes(scriptCode)
    .u64(input.value)
    .u32(input.sequence)
    .bytes(dsha256(outputs.done()))
    .u32(tx.locktime)
    .u32(1) // SIGHASH_ALL
    .done()
  return dsha256(preimage)
}

/** strict DER of a low-S ECDSA signature (BIP66) */
function der(r: bigint, s: bigint) {
  const int = (x: bigint) => {
    let b = fromHex(x.toString(16).padStart(64, "0"))
    while (b.length > 1 && b[0] === 0 && b[1] < 0x80) b = b.slice(1)
    return b[0] >= 0x80 ? Uint8Array.from([0, ...b]) : b
  }
  const R = int(r)
  const S = int(s)
  return Uint8Array.from([0x30, 4 + R.length + S.length, 0x02, R.length, ...R, 0x02, S.length, ...S])
}

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

async function signDigest(digest: Uint8Array, privateKey: Uint8Array) {
  const sig = await sign({ hash: `0x${bytesToHexString(digest)}`, privateKey: `0x${bytesToHexString(privateKey)}`, to: "object" })
  let s = BigInt(sig.s)
  if (s > N / 2n) s = N - s // low S (viem already signs low-S; kept for safety)
  return der(BigInt(sig.r), s)
}

/** signs every input (all P2WPKH of `keys`) and serializes with witnesses; returns hex and txid */
export async function signP2wpkh(tx: UnsignedTx, keys: BitcoinKeys, guard?: SigningGuard): Promise<{ hex: string; txid: string; vsize: number }> {
  const pkh = hash160(keys.publicKey)
  const witnesses: Uint8Array[][] = []
  for (let i = 0; i < tx.inputs.length; i++) {
    guard?.()
    const sig = await signDigest(segwitV0Sighash(tx, i, pkh), keys.privateKey)
    witnesses.push([Uint8Array.from([...sig, 0x01]), keys.publicKey])
  }
  const body = (w: Writer) => {
    w.varint(tx.inputs.length)
    for (const i of tx.inputs) w.bytes(txidBytes(i.txid)).u32(i.vout).varint(0).u32(i.sequence)
    w.varint(tx.outputs.length)
    for (const o of tx.outputs) w.u64(o.value).varbytes(o.script)
    return w
  }
  const legacy = body(new Writer().u32(tx.version)).u32(tx.locktime).done()
  const full = body(new Writer().u32(tx.version).u8(0).u8(1))
  for (const stack of witnesses) {
    full.varint(stack.length)
    for (const item of stack) full.varbytes(item)
  }
  const raw = full.u32(tx.locktime).done()
  const weight = legacy.length * 3 + raw.length
  return { hex: bytesToHexString(raw), txid: bytesToHexString(dsha256(legacy).reverse()), vsize: Math.ceil(weight / 4) }
}

/* ------------------------------------------------------------ coin selection */

/** P2WPKH spend: 41 bytes outside the witness + 108 inside → 67.75 vB, round up */
const INPUT_VSIZE = 68
/** version, locktime, counts, segwit marker: 10.5 vB, round up */
const OVERHEAD_VSIZE = 11
/** an output below this is not relayed (P2WPKH dust at 3 sat/vB); it goes to the fee instead */
export const DUST = 546n

export type Plan = { inputs: Utxo[]; fee: bigint; change: bigint; feeRate: number; vsize: number }

/**
 * Largest coins first until amount + fee is covered; change returns to our P2WPKH address when it is
 * above dust, otherwise it is left to the fee. Unconfirmed coins are used only after confirmed ones.
 */
export function planSpend(utxos: Utxo[], amount: bigint, toScript: Uint8Array, feeRate: number): Plan {
  if (amount < DUST) throw new Error(`Слишком мало: сеть Bitcoin не передаёт суммы меньше ${DUST} сатоши`)
  const coins = [...utxos].sort((a, b) => Number(b.confirmed) - Number(a.confirmed) || b.value - a.value)
  const changeVsize = 31
  const picked: Utxo[] = []
  let total = 0n
  for (const c of coins) {
    picked.push(c)
    total += BigInt(c.value)
    const base = OVERHEAD_VSIZE + picked.length * INPUT_VSIZE + outputVsize(toScript)
    const feeNoChange = BigInt(Math.ceil(base * feeRate))
    const feeWithChange = BigInt(Math.ceil((base + changeVsize) * feeRate))
    if (total >= amount + feeWithChange && total - amount - feeWithChange >= DUST) {
      return { inputs: picked, fee: feeWithChange, change: total - amount - feeWithChange, feeRate, vsize: base + changeVsize }
    }
    if (total >= amount + feeNoChange) {
      return { inputs: picked, fee: total - amount, change: 0n, feeRate, vsize: base }
    }
  }
  throw new Error("Не хватает BTC на сумму и комиссию сети")
}

/* ------------------------------------------------------------ send */

const RBF_SEQUENCE = 0xfffffffd

async function feeRateNow(network: BitcoinNetwork) {
  const r = await bitcoinData(network).feeRates()
  return Math.max(1, r.halfHourFee || r.fastestFee || 1)
}

/** what a send of `amount` satoshi would cost now (for the confirm screen) */
export async function bitcoinFee(keys: BitcoinKeys, to: string | undefined, amount: bigint, network: BitcoinNetwork = BITCOIN_TESTNET4) {
  const data = bitcoinData(network)
  const script = (to && testnetOutputScript(to)) || testnetOutputScript(keys.address)!
  const [utxos, rate] = await Promise.all([data.utxos(keys.address), feeRateNow(network)])
  return planSpend(utxos, amount, script, rate)
}

/**
 * Upper bound of the fee for the send sheet before an amount is known: every coin spent, the widest
 * output (P2TR) and a change output, at the current rate. In satoshi.
 */
export async function bitcoinFeeBound(keys: BitcoinKeys, network: BitcoinNetwork = BITCOIN_TESTNET4): Promise<bigint> {
  const data = bitcoinData(network)
  const [utxos, rate] = await Promise.all([data.utxos(keys.address), feeRateNow(network)])
  const vsize = OVERHEAD_VSIZE + Math.max(1, utxos.length) * INPUT_VSIZE + 43 + 31
  return BigInt(Math.ceil(vsize * rate))
}

export async function bitcoinSend(keys: BitcoinKeys, to: string, amount: bigint, network: BitcoinNetwork = BITCOIN_TESTNET4, guard?: SigningGuard): Promise<SendResult> {
  if (network.id !== BITCOIN_TESTNET4.id || network.rpcUrl !== BITCOIN_TESTNET4.rpcUrl) {
    throw new Error(`Сеть ${network.name} с реальными деньгами отключена: кошелёк работает только в тестовых сетях`)
  }
  const toScript = testnetOutputScript(to)
  if (!toScript) throw new Error("Это не адрес Bitcoin testnet4: кошелёк отправляет только в тестовую сеть")
  const data = bitcoinData(network)
  const [utxos, rate] = await Promise.all([data.utxos(keys.address), feeRateNow(network)])
  const plan = planSpend(utxos, amount, toScript, rate)
  const ownScript = testnetOutputScript(keys.address)!
  const tx: UnsignedTx = {
    version: 2,
    locktime: 0,
    inputs: plan.inputs.map((u) => ({ txid: u.txid, vout: u.vout, sequence: RBF_SEQUENCE, value: BigInt(u.value) })),
    outputs: [{ value: amount, script: toScript }, ...(plan.change > 0n ? [{ value: plan.change, script: ownScript }] : [])],
  }
  guard?.()
  const signed = await signP2wpkh(tx, keys, guard)
  guard?.()
  let txid: string
  try { txid = await data.broadcast(signed.hex) }
  catch (error) { if (isDefiniteBroadcastRejection(error)) throw error; throw new BroadcastUncertainError(network) }
  return { url: network.explorer.tx(txid), label: `Операция в ${network.explorer.name}`, hash: txid, status: "broadcast" }
}
