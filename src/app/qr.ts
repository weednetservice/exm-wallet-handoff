import type { ChainFamily, Network } from "@/lib/chains"

export type QrAddress = { address: string; family?: ChainFamily; chainId?: number }

/** Extract only a recipient. Payment amounts and arbitrary URLs are never acted on from a QR. */
export function parseAddressQr(raw: string): QrAddress {
  const text = raw.trim()
  if (!text || text.length > 2048) throw new Error("QR-код не содержит адрес кошелька.")
  if (!/^[a-z][a-z\d+.-]*:/i.test(text)) return { address: text }

  try {
    if (/^ethereum:/i.test(text)) {
      const body = text.slice(text.indexOf(":") + 1).split("?")[0]
      // EIP-681 token transfers use a contract address followed by /transfer; never mistake it for a recipient.
      if (body.includes("/")) throw new Error("QR токена содержит вызов контракта. Нужен QR адреса получателя.")
      const match = /^(?:pay-)?(0x[\da-fA-F]{40})(?:@(\d+))?$/.exec(decodeURIComponent(body))
      if (!match) throw new Error("Не удалось прочитать адрес Ethereum из QR.")
      return { address: match[1], family: "evm", chainId: match[2] ? Number(match[2]) : undefined }
    }
    if (/^bitcoin:/i.test(text)) {
      const address = decodeURIComponent(text.slice(text.indexOf(":") + 1).split("?")[0])
      if (!address || address.includes("/")) throw new Error("Не удалось прочитать адрес Bitcoin из QR.")
      return { address, family: "bitcoin" }
    }
    if (/^solana:/i.test(text)) {
      const address = decodeURIComponent(text.slice(text.indexOf(":") + 1).split("?")[0])
      if (!address || address.includes("/")) throw new Error("Не удалось прочитать адрес Solana из QR.")
      return { address, family: "solana" }
    }
    if (/^ton:\/\/transfer\//i.test(text)) {
      const url = new URL(text)
      const address = decodeURIComponent(url.pathname.slice(1))
      if (!address || address.includes("/")) throw new Error("Не удалось прочитать адрес TON из QR.")
      return { address, family: "ton" }
    }
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("Не удалось") || error.message.startsWith("QR токена"))) throw error
    throw new Error("Не удалось прочитать адрес из QR.")
  }
  throw new Error("QR содержит ссылку, а не адрес кошелька.")
}

export function addressForNetwork(raw: string, network: Network): string {
  const parsed = parseAddressQr(raw)
  if (parsed.family && parsed.family !== network.family) throw new Error("QR относится к другой сети.")
  if (parsed.chainId !== undefined && parsed.chainId !== network.chainId) throw new Error("QR относится к другой сети Ethereum.")
  return parsed.address
}
