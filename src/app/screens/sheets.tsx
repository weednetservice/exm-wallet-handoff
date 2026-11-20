/** Sheets of the wallet: add an address to watch, receive. Sending lives in send.tsx. */
import { useLayoutEffect, useRef, useState } from "react"
import { UserIcon } from "@phosphor-icons/react"
import { chainData, NETWORKS, type ChainFamily, type Network } from "@/lib/chains"
import { familyOf, useAccounts, validMainnetWatch } from "../accounts"
import { IconEye, IconPaste, IconScan } from "../glyph"
import { NetworkCoin } from "../marks"
import { PrimaryButton, Sheet } from "../ui"
import { QrScanControl } from "../QrScanControl"
import { parseAddressQr } from "../qr"
import { ReceiveAddressSheet } from "./ReceiveAddressSheet"

export type SheetProps = { open: boolean; onOpenChange: (open: boolean) => void }

/* -------------------------------------------------------------------- watch */

const FAMILY_NAME: Record<ChainFamily, string> = { evm: "Ethereum и другие EVM сети", solana: "Solana", ton: "TON", bitcoin: "Bitcoin" }

export function WatchSheet({ open, onOpenChange, onBack, onAdded }: SheetProps & { onBack?: () => void; onAdded?: () => void }) {
  const { watch } = useAccounts()
  const [value, setValue] = useState("")
  const [touched, setTouched] = useState(false)
  const [pasteFailed, setPasteFailed] = useState(false)
  const [scanError, setScanError] = useState("")
  const family = familyOf(value)
  const network = family ? NETWORKS.find((n) => n.family === family)! : null
  const error = !value.trim() ? "Введите адрес" : !network ? "Введите адрес Ethereum, Solana или основной сети Bitcoin" : chainData(network).validateAddress(value) ?? (!validMainnetWatch(family!, value.trim()) ? "Добавьте свой публичный адрес. Адрес прежнего демо недоступен." : null)

  const submit = () => {
    setTouched(true)
    if (error || !family || scanError) return
    watch(family, value)
    setValue("")
    setTouched(false)
    if (onAdded) onAdded()
    else if (onBack) onBack()
    else onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} onBack={onBack} title="Добавить адрес" footer={<PrimaryButton onClick={submit}>Добавить</PrimaryButton>}>
      <form
        className="wallet-watch-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="wallet-watch-purpose"><IconEye size={24} /><p>Только просмотр</p></div>
        <label htmlFor="watch-address" className="t-label2 c-2 px-1">
          Адрес для просмотра
        </label>
        <AddressField
          id="watch-address"
          value={value}
          onChange={(next) => { setValue(next); setScanError(""); setPasteFailed(false) }}
          onBlur={() => setTouched(true)}
          placeholder="0x…, Solana или bc1…"
          invalid={!!scanError || touched && !!error}
          onPaste={(next) => { setValue(next); setScanError(""); setTouched(true); setPasteFailed(false) }}
          onPasteError={() => setPasteFailed(true)}
          describedBy="watch-hint"
        />
        <QrScanControl onScan={(raw) => { try { setValue(parseAddressQr(raw).address); setScanError(""); setTouched(true); setPasteFailed(false); return null } catch (cause) { const message = (cause as Error).message; setScanError(message); return message } }} />
        <p id="watch-hint" role={scanError || pasteFailed ? "alert" : undefined} className="t-body2 px-1" style={{ color: scanError || pasteFailed || touched && error ? "var(--red)" : "var(--label-2)" }}>
          {scanError || (pasteFailed ? "Браузер не дал прочитать буфер обмена: вставьте адрес вручную." : touched && error
            ? error
            : family
              ? `Сеть: ${FAMILY_NAME[family]}. Адрес будет только для просмотра.`
              : "Сеть определится по адресу. С него можно будет только смотреть.")}
        </p>
      </form>
    </Sheet>
  )
}

/** Keeper's address field: the card, a blue border in focus, red on error, a Вставить button inside */
export function AddressField({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  invalid,
  onPaste,
  onPasteError,
  onScan,
  describedBy,
  label,
  autoFocus = false,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder: string
  invalid: boolean
  onPaste?: (text: string) => void
  onPasteError?: () => void
  onScan?: () => void
  describedBy?: string
  label?: string
  autoFocus?: boolean
}) {
  const input = useRef<HTMLTextAreaElement>(null)
  const pasteRequest = useRef(0)
  useLayoutEffect(() => () => { pasteRequest.current += 1 }, [value])

  const paste = async () => {
    const request = ++pasteRequest.current
    const active = () => {
      const field = input.current
      return request === pasteRequest.current && field?.isConnected && !field.closest('[aria-hidden="true"], [inert], [role="dialog"][data-state="closed"]')
    }
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (active()) onPaste?.(text)
    } catch {
      if (active()) onPasteError?.()
    }
  }

  return (
    <div
      className="wallet-transfer-field wallet-transfer-address-field"
      style={invalid ? { boxShadow: "inset 0 0 0 1.5px var(--red)", background: "color-mix(in srgb, var(--red) 8%, var(--grouped))" } : undefined}
    >
      <UserIcon size={20} aria-hidden="true" className="c-2 shrink-0" />
      <textarea
        ref={input}
        id={id}
        rows={1}
        value={value}
        onChange={(e) => { pasteRequest.current += 1; onChange(e.target.value.replace(/\s+/g, "")) }}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-label={label}
        autoFocus={autoFocus}
        className="wallet-transfer-address-input"
      />
      {onPaste && !value ? (
        <button type="button" onClick={() => void paste()} aria-label="Вставить адрес" className="wallet-transfer-paste">
          <IconPaste size={16} />
        </button>
      ) : null}
      {onScan ? <button type="button" onClick={onScan} aria-label="Сканировать QR" className="wallet-transfer-scan"><IconScan size={20} /></button> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ receive */

export function ReceiveSheet({ network, watchOnly = false, ...props }: SheetProps & { network: Network; address: string; watchOnly?: boolean }) {
  return <ReceiveAddressSheet {...props} network={network} symbol={network.native.symbol} icon={<NetworkCoin network={network} size={36} />} watchOnly={watchOnly} />
}
