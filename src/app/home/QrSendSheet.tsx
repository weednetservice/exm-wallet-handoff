import { useState } from "react"
import { canBroadcastFromNetwork, chainData, networkLabel } from "@/lib/chains"
import { formatCoin } from "@/lib/format"
import { CoinIcon, NetworkMark } from "../marks"
import { assetName } from "../assetNames"
import { IconChevronRight } from "../glyph"
import { addressForNetwork, parseAddressQr } from "../qr"
import { QrScanControl } from "../QrScanControl"
import { Group, SecondaryButton, Sheet } from "../ui"
import type { Holding, TokenHolding } from "./portfolio"

type Asset = Holding | TokenHolding

/** A scanned QR identifies a recipient, never an amount or an asset. */
export function QrSendSheet({ open, assets, onClose, onPick }: {
  open: boolean
  assets: Asset[]
  onClose: () => void
  onPick: (asset: Asset, recipient: string) => void
}) {
  const [recipient, setRecipient] = useState("")
  const [networkId, setNetworkId] = useState<string | null>(null)
  const [matching, setMatching] = useState<string[]>([])
  const [scanKey, setScanKey] = useState(0)
  const reset = () => { setRecipient(""); setNetworkId(null); setMatching([]); setScanKey((key) => key + 1) }
  const close = () => { reset(); onClose() }
  const own = assets.filter((asset) => asset.source === "wallet")
  const networks = [...new Map(own.map((asset) => [asset.network.id, asset.network])).values()]

  const scan = (raw: string): string | null => {
    try {
      const parsed = parseAddressQr(raw)
      const compatible = networks.filter((network) => {
        try { return !chainData(network).validateAddress(addressForNetwork(raw, network)) }
        catch { return false }
      })
      if (!compatible.length) return "Адрес из QR не подходит ни к одной включённой сети кошелька. Проверьте сеть или отмените сканирование."
      if (!compatible.some(canBroadcastFromNetwork)) {
        return `${compatible.map(networkLabel).join(", ")}: отправка из EXM недоступна. Выберите другой QR.`
      }
      setRecipient(parsed.address)
      setMatching(compatible.map((network) => network.id))
      setNetworkId(null)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : "Не удалось прочитать адрес из QR."
    }
  }

  const matchingNetworks = networks.filter((network) => matching.includes(network.id))
  const sendableNetworks = matchingNetworks.filter(canBroadcastFromNetwork)
  const blockedNetworks = matchingNetworks.filter((network) => !canBroadcastFromNetwork(network))
  const selected = sendableNetworks.find((network) => network.id === networkId)
  const choices = selected ? own.filter((asset) => asset.network.id === selected.id) : []
  return <Sheet open={open} onOpenChange={(next) => !next && close()} title={recipient ? selected ? "Что отправить" : "Выберите сеть" : "Сканировать QR"} onBack={recipient ? () => { if (selected) setNetworkId(null); else reset() } : undefined}>
    {recipient ? <div className="wallet-qr-result wallet-asset-picker">
      <div className="wallet-picker-address"><span>Адрес из QR</span><p className="mono select-all">{recipient}</p></div>
      <p className="t-body2 c-2">Сверьте сеть и актив перед отправкой. Сумма из QR не подставляется.</p>
      {!selected ? <>
        <Group header="Сети для отправки">
          {sendableNetworks.map((network) => <button key={network.id} type="button" onClick={() => setNetworkId(network.id)} className="wallet-picker-row wallet-picker-network"><NetworkMark networkId={network.id} size={32} /><span className="wallet-picker-copy">{networkLabel(network)}</span><IconChevronRight size={18} /></button>)}
        </Group>
        {blockedNetworks.length ? <p className="t-body2 c-2">{blockedNetworks.map(networkLabel).join(", ")}: отправка из EXM недоступна.</p> : null}
      </> : <Group header={`В сети ${networkLabel(selected)}`}>
        {choices.map((asset) => {
          const symbol = "token" in asset ? asset.token.symbol : asset.network.native.symbol
          const decimals = "token" in asset ? asset.token.decimals : asset.network.native.decimals
          return <button key={`${asset.network.id}:${"token" in asset ? asset.token.address : "native"}`} type="button" onClick={() => { onPick(asset, recipient); reset() }} className="wallet-picker-row">
            <CoinIcon symbol={symbol} networkId={asset.network.id} size={40} />
            <span className="wallet-picker-copy"><span>{assetName(symbol)}</span><small>{symbol}</small></span>
            <span className="wallet-picker-balance">{asset.amount !== undefined ? formatCoin(asset.amount, decimals, symbol, 4) : "Проверяем…"}</span>
          </button>
        })}
      </Group>}
      <SecondaryButton onClick={close}>Отменить</SecondaryButton>
    </div> : <div className="wallet-qr-start">
      {open ? <QrScanControl key={scanKey} onScan={scan} autoStart /> : null}
      <SecondaryButton onClick={close}>Отменить</SecondaryButton>
    </div>}
  </Sheet>
}
