/**
 * EXM keys: one BIP-39 recovery phrase (24 words) → one account per network family,
 * except Bitcoin, whose mainnet and testnet4 accounts use different BIP84 coin types.
 *   Ethereum / Base   m/44'/60'/0'/0/0   (the same address MetaMask, Rabby, Trust give for this phrase)
 *   Solana            m/44'/501'/0'/0'   (SLIP-0010 ed25519; the same address as Phantom, Solflare)
 *   TON               m/44'/607'/0'      (SLIP-0010 ed25519, wallet contract v4R2)
 * Nothing here touches the network or storage.
 */
import "./polyfill"
import { generateMnemonic as genWords, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"
import { hmac } from "@noble/hashes/hmac.js"
import { sha512 } from "@noble/hashes/sha2.js"
import { mnemonicToAccount } from "viem/accounts"
import { ed25519 } from "@noble/curves/ed25519.js"
import { base58 } from "@scure/base"
import { deriveBitcoin, deriveBitcoinMainnet, type BitcoinKeys } from "./bitcoin"
import { legacyTonAddress } from "./tonAddress"
import { bip84AccountXpub } from "../bitcoin/derive"

export const WORDS = 24

export function newMnemonic(): string[] {
  return genWords(wordlist, WORDS === 24 ? 256 : 128).split(" ")
}

/** normalises what people type or paste: case, extra spaces, numbering ("1. word") */
export function cleanWords(input: string[] | string): string[] {
  const raw = Array.isArray(input) ? input.join(" ") : input
  return raw
    .toLowerCase()
    .replace(/\d+[.)]/g, " ")
    .split(/[\s,]+/)
    .filter(Boolean)
}

/** null when the phrase is valid, otherwise what is wrong, in Russian */
export function checkMnemonic(words: string[]): string | null {
  if (words.length !== 12 && words.length !== 24) return `Нужно 12 или 24 слова, сейчас ${words.length}`
  const unknown = words.filter((w) => !wordlist.includes(w))
  if (unknown.length) return `Таких слов нет в словаре BIP-39: ${unknown.slice(0, 3).join(", ")}`
  if (!validateMnemonic(words.join(" "), wordlist)) return "Слова верные, но порядок или одно из слов не сходится: проверьте фразу"
  return null
}

/** A local hint for a misspelled BIP-39 word; no phrase is sent to a service or changed automatically. */
export function mnemonicWordHint(word: string): { word: string; suggestions: string[] } | null {
  if (word.length < 4 || wordlist.includes(word)) return null
  const oneEdit = (a: string, b: string) => {
    if (Math.abs(a.length - b.length) > 1) return false
    let i = 0, j = 0, edits = 0
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue }
      if (++edits > 1) return false
      if (a.length >= b.length) i++
      if (a.length <= b.length) j++
    }
    return edits + (a.length - i) + (b.length - j) <= 1
  }
  const suggestions = wordlist.filter((candidate) => candidate.startsWith(word.slice(0, 4)) || oneEdit(word, candidate)).slice(0, 3)
  return { word, suggestions }
}

/** SLIP-0010 ed25519 derivation (hardened only) */
function ed25519FromSeed(seed: Uint8Array, path: number[]): Uint8Array {
  let I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed)
  for (const index of path) {
    const data = new Uint8Array(37)
    data.set(I.subarray(0, 32), 1)
    const i = (index | 0x80000000) >>> 0
    data[33] = (i >>> 24) & 0xff
    data[34] = (i >>> 16) & 0xff
    data[35] = (i >>> 8) & 0xff
    data[36] = i & 0xff
    const child = hmac(sha512, I.subarray(32), data)
    I.fill(0)
    data.fill(0)
    I = child
  }
  const key = I.slice(0, 32)
  I.fill(0)
  return key
}

export type DerivedKeys = {
  evm: ReturnType<typeof mnemonicToAccount>
  solana: string
  ton: { address: string }
  bitcoin: BitcoinKeys
  bitcoinMainnet: BitcoinKeys
  bitcoinMainnetXpub: string
}

export function deriveKeys(words: string[]): DerivedKeys {
  const phrase = words.join(" ")
  const seed = mnemonicToSeedSync(phrase)
  const solanaSeed = ed25519FromSeed(seed, [44, 501, 0, 0])
  const tonSeed = ed25519FromSeed(seed, [44, 607, 0])
  try {
    const evm = {
      ...mnemonicToAccount(phrase, { path: "m/44'/60'/0'/0/0" }),
      async signTransaction(): Promise<never> {
        throw new Error("В макете транзакции не подписываются")
      },
    }
    const solana = base58.encode(ed25519.getPublicKey(solanaSeed))
    const bitcoin = deriveBitcoin(seed)
    const bitcoinMainnet = deriveBitcoinMainnet(seed)
    const bitcoinMainnetXpub = bip84AccountXpub(seed)
    return {
      evm, solana, bitcoin, bitcoinMainnet, bitcoinMainnetXpub,
      ton: { address: legacyTonAddress(ed25519.getPublicKey(tonSeed)) },
    }
  } finally {
    seed.fill(0)
    solanaSeed.fill(0)
    tonSeed.fill(0)
  }
}

export function addressesOf(keys: DerivedKeys) {
  return { evm: keys.evm.address, solana: keys.solana, ton: keys.ton.address, bitcoin: keys.bitcoin.address, bitcoinMainnet: keys.bitcoinMainnet.address, bitcoinMainnetXpub: keys.bitcoinMainnetXpub }
}
