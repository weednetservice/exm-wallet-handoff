import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import QRCode from "qrcode"
import { canBroadcastFromNetwork, networkLabel, type Network } from "@/lib/chains"
import { shortAddress } from "@/lib/format"
import { IconCopy, IconShare } from "../glyph"
import { NetworkMark } from "../marks"
import { copyText, Group, PrimaryButton, SecondaryButton, Sheet } from "../ui"
import { TransferAssetCard } from "./TransferAssetCard"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  network: Network
  address: string
  symbol: string
  icon: ReactNode
  watchOnly: boolean
  networks?: readonly Network[]
  onSelectNetwork?: (networkId: string) => void
}

export function ReceiveAddressSheet({ open, onOpenChange, network, address, symbol, icon, watchOnly, networks, onSelectNetwork }: Props) {
  const networkName = networkLabel(network)
  const [selectingNetwork, setSelectingNetwork] = useState(false)
  const networkControl = useRef<HTMLDivElement>(null)
  const currentNetworkButton = useRef<HTMLButtonElement>(null)
  const [qr, setQr] = useState<{ address: string; svg: string | null }>()
  const addressElement = useRef<HTMLParagraphElement>(null)
  const statusElement = useRef<HTMLParagraphElement>(null)
  const [feedback, setFeedback] = useState<{ text: string; reveal?: boolean } | null>(null)

  useLayoutEffect(() => {
    if (feedback?.reveal) statusElement.current?.scrollIntoView({ block: "nearest", behavior: "instant" })
  }, [feedback])

  useEffect(() => {
    if (!open) return
    let active = true
    QRCode.toString(address, { type: "svg", margin: 4, errorCorrectionLevel: "M" }).then(
      (svg) => { if (active) setQr({ address, svg }) },
      () => { if (active) setQr({ address, svg: null }) },
    )
    return () => { active = false }
  }, [open, address])

  const currentQr = qr?.address === address ? qr : undefined
  const returnToAddress = () => {
    setSelectingNetwork(false)
    requestAnimationFrame(() => networkControl.current?.querySelector("button")?.focus({ preventScroll: true }))
  }
  const changeOpen = (next: boolean) => {
    if (!next && selectingNetwork) returnToAddress()
    else onOpenChange(next)
  }
  const openNetworkPicker = () => {
    setSelectingNetwork(true)
    setFeedback(null)
    requestAnimationFrame(() => currentNetworkButton.current?.focus({ preventScroll: true }))
  }
  const copy = async () => {
    const element = addressElement.current
    const copied = await copyText(address)
    if (!element?.isConnected || element.textContent !== address) return
    if (copied) return setFeedback({ text: "Адрес скопирован", reveal: true })
    element.scrollIntoView({ block: "nearest" })
    const selection = window.getSelection()
    selection?.selectAllChildren(element)
    setFeedback({ text: selection?.toString() === address ? "Адрес выделен. Скопируйте его вручную." : "Не удалось скопировать адрес. Выделите его вручную." })
  }

  const share = async () => {
    setFeedback(null)
    try {
      const title = `Адрес ${symbol} в сети ${networkName}`
      await navigator.share({ title, text: `${title}\n${address}` })
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setFeedback({ text: "Не удалось поделиться. Скопируйте адрес.", reveal: true })
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={changeOpen}
      className="wallet-receive-sheet"
      fullscreen
      fitDesktop
      minimumBodyRem={selectingNetwork ? 5 : 9}
      onBack={() => changeOpen(false)}
      returnFocusLabel="Получить"
      title={selectingNetwork ? "Сеть получения" : "Получить"}
      footer={selectingNetwork ? undefined : (<>
        <div className="wallet-receive-actions">
          {typeof navigator.share === "function" ? (
            <SecondaryButton onClick={share}><IconShare size={20} /><span>Поделиться</span></SecondaryButton>
          ) : null}
          <PrimaryButton onClick={copy}><IconCopy size={20} /><span>Скопировать адрес</span></PrimaryButton>
        </div>
        <p ref={statusElement} className="wallet-receive-status" role="status">{feedback?.text}</p>
      </>)}
    >
      {selectingNetwork ? (
        <div className="wallet-receive-network-picker">
          <p className="t-body2 c-2">Выберите сеть, из которой вам отправят {symbol}.</p>
          <Group>{networks?.map((option) => (
            <button
              key={option.id}
              ref={option.id === network.id ? currentNetworkButton : undefined}
              type="button"
              className="wallet-receive-network-option"
              aria-pressed={option.id === network.id}
              onClick={() => { onSelectNetwork?.(option.id); returnToAddress() }}
            >
              <NetworkMark networkId={option.id} size={28} />
              <span>{networkLabel(option)}</span>
              {option.id === network.id ? <small>Текущая</small> : null}
            </button>
          ))}</Group>
        </div>
      ) : <div className="wallet-receive-content">
        <div ref={networkControl} className="w-full">
          <TransferAssetCard icon={icon} symbol={symbol} network={networkName} selectLabel={`Сменить сеть. Сейчас ${networkName}`} onSelect={onSelectNetwork && networks && networks.length > 1 ? openNetworkPicker : undefined} />
        </div>
        <p className="wallet-receive-network-note">Только <strong>{symbol}</strong> в сети <strong>{networkName}</strong>.</p>
        {watchOnly ? (
          <p role="note" className="wallet-receive-caution">Адрес только для просмотра. Перед пополнением проверьте, что можете отправлять с него.</p>
        ) : !canBroadcastFromNetwork(network) ? (
          <p role="note" className="wallet-receive-caution">EXM пока не отправляет {symbol} в этой сети. Проверьте доступ к адресу в другом кошельке.</p>
        ) : null}
        <div className="wallet-receive-ticket">
          <div className="wallet-transfer-qr wallet-receive-qr">
            {currentQr?.svg ? (
              <div className="aspect-square w-full [&_svg]:size-full" role="img" aria-label={`QR-код адреса ${shortAddress(address)}`} dangerouslySetInnerHTML={{ __html: currentQr.svg }} />
            ) : (
              <p role="status" className="wallet-receive-qr-status">{currentQr ? "QR недоступен. Используйте адрес ниже." : "Создаём QR…"}</p>
            )}
          </div>
          <div className="wallet-receive-address-block">
            <p className="wallet-receive-address-label">Адрес получения</p>
            <p ref={addressElement} className="wallet-receive-address mono select-all">{address}</p>
          </div>
        </div>
      </div>}
    </Sheet>
  )
}
