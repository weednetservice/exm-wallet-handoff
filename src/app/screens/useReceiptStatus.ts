import { useEffect, useState } from "react"
import { evmRpc } from "@/lib/chains/evm"
import type { Network } from "@/lib/chains/networks"
import type { SendResult } from "../vault/signers"
import { validateEvmReceipt, type ReceiptStatus } from "./receiptStatus"

type Observation = { key: string; status: ReceiptStatus | null; unavailable: boolean }

export function useReceiptStatus({ open, network, result, owner, destination }: { open: boolean; network: Network; result: SendResult | null; owner: string; destination: string }) {
  const hash = result?.hash ?? ""
  const eligible = open && network.family === "evm" && result?.status === "broadcast" && /^0x[0-9a-f]{64}$/i.test(hash)
  const key = JSON.stringify([network.id, hash.toLowerCase(), owner.toLowerCase(), destination.toLowerCase()])
  const [observation, setObservation] = useState<Observation | null>(null)

  useEffect(() => {
    setObservation(null)
    if (!eligible) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const abort = new AbortController()
    const poll = async () => {
      let terminal = false
      try {
        const receipt = await evmRpc<unknown>(network, "eth_getTransactionReceipt", [hash], abort.signal)
        if (cancelled) return
        const status = validateEvmReceipt(receipt, { hash, owner, destination })
        terminal = status !== null
        setObservation({ key, status, unavailable: receipt !== null && status === null })
      } catch {
        if (cancelled) return
        setObservation({ key, status: null, unavailable: true })
      } finally {
        if (!cancelled && !terminal) timer = setTimeout(() => void poll(), 4_500)
      }
    }
    void poll()
    return () => {
      cancelled = true
      abort.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [eligible, key, network, hash, owner, destination])

  return eligible && observation?.key === key ? observation : { status: null, unavailable: false }
}
