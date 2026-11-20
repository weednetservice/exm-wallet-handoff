/** Получение: QR и адрес выбранного ключа. У EVM под ключами веер: 11 сетей принимают монеты на этот адрес. */
import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { IconBack, IconCheck, IconCopy, IconShare } from "@/app/glyph"
import { copyText, IconButton, PrimaryButton } from "@/app/ui"
import { EVM_NETS, keyById, plural, type KeyId } from "./model"
import { Address, KeyRing, Swap } from "./parts"
import type { Go } from "./index"

export function Receive({ initial, go, say }: { initial: KeyId; go: Go; say: (text: string) => void }) {
  const [id, setId] = useState<KeyId>(initial)
  const [copied, setCopied] = useState(false)
  const key = keyById(id)
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  const copy = async () => {
    if (!key.address) return
    if (await copyText(key.address)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } else say("Не скопировалось: выделите адрес вручную")
  }

  return (
    <>
      <div className="ck-scroll pb-[96px]">
        <header className="grid min-h-14 grid-cols-[48px_1fr_48px] items-center">
          <IconButton label="Назад" onClick={() => go({ screen: "home" })} className="-ml-2">
            <IconBack size={24} />
          </IconButton>
          <h1 className="t-h3 text-center">Получить</h1>
          {canShare && key.address ? (
            <IconButton label="Поделиться адресом" onClick={() => navigator.share({ text: key.address }).catch(() => {})} className="-mr-2 justify-self-end">
              <IconShare size={24} />
            </IconButton>
          ) : null}
        </header>

        <Swap id={id} className="flex flex-col items-center gap-4 pt-1 pb-5">
          {key.address ? (
            <>
              <Qr value={key.address} label={`QR-код адреса ${key.title}`} />
              <Address value={key.address} size="lg" lit={copied} />
            </>
          ) : (
            <div className="card flex h-[284px] w-full flex-col items-center justify-center gap-2 px-8 text-center">
              <h2 className="t-label1">В демо нет адреса Bitcoin</h2>
              <p className="t-body2 c-2">Демо-кошелёк смотрит на три чужих публичных адреса. В своём кошельке адрес Bitcoin появляется сразу после создания.</p>
            </div>
          )}
        </Swap>

        <KeyRing label="Чей адрес показать" selected={id} caption={`Этот адрес принимает монеты в ${plural(EVM_NETS.length, "сети", "сетях", "сетях")}`} onKey={setId} />
        {id !== "evm" ? <p className="t-body2 c-2 px-1 pt-3 text-center">{key.address ? `Принимает монеты только в сети ${key.nets[0].full}` : "Выберите другой ключ, чтобы увидеть адрес"}</p> : null}
      </div>

      <div className="ck-foot">
        <PrimaryButton onClick={copy} disabled={!key.address} aria-live="polite">
          {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
          {copied ? "Адрес скопирован" : "Скопировать адрес"}
        </PrimaryButton>
      </div>
    </>
  )
}

/** QR на белой карточке: тёмные модули цвета страницы, 18:1 */
function Qr({ value, label }: { value: string; label: string }) {
  const [svg, setSvg] = useState("")
  useEffect(() => {
    let live = true
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#10161f", light: "#ffffff" } }).then(
      (s) => live && setSvg(s),
      () => live && setSvg(""),
    )
    return () => {
      live = false
    }
  }, [value])
  return <div role="img" aria-label={label} className="size-[216px] rounded-[var(--radius-qr)] bg-white p-5 [&>svg]:block [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
}
