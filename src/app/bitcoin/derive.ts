import { HDKey } from "@scure/bip32"
import { ripemd160, sha256 } from "viem"
import { encodeSegwit } from "@/lib/chains/bitcoin"

/** Standard xpub serialization is used only inside this device; no extended key goes to Esplora. */
export function bip84AccountXpub(seed: Uint8Array): string {
  return HDKey.fromMasterSeed(seed).derive("m/84'/0'/0'").publicExtendedKey
}

export function bip84Address(xpub: string, chain: 0 | 1, index: number): string {
  if (!/^xpub/.test(xpub) || !Number.isSafeInteger(index) || index < 0 || index >= 0x80000000) throw new Error("Неверный публичный ключ Bitcoin")
  const node = HDKey.fromExtendedKey(xpub).deriveChild(chain).deriveChild(index)
  if (!node.publicKey || node.privateKey) throw new Error("Не удалось получить публичный адрес Bitcoin")
  const program = ripemd160(sha256(node.publicKey, "bytes"), "bytes")
  return encodeSegwit("bc", 0, program)
}
