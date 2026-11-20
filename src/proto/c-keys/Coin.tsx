/** Монета: одна монета во всех своих сетях, ровным столбцом, и один адрес, на котором она лежит. */
import { useState } from "react"
import { IconBack, IconCheck, IconCopy, IconReceive, IconSend } from "@/app/glyph"
import { ActionButton, copyText, IconButton } from "@/app/ui"
import { CoinLogo, NetLogo } from "./logos"
import { balanceOf, coinBySymbol, coinParts, EVM_NETS, fiatOf, fiatParts, keyById, plural } from "./model"
import { Address, Amount, KeyStack } from "./parts"
import type { Go } from "./index"

export function Coin({ symbol, go, say }: { symbol: string; go: Go; say: (text: string) => void }) {
  const coin = coinBySymbol(symbol)
  const key = keyById(coin.nets[0].key)
  const [copied, setCopied] = useState(false)
  const held = coin.nets.map(balanceOf)
  const total = held[0] === undefined ? undefined : held.reduce<bigint>((s, b) => s + (b ?? 0n), 0n)
  const fiat = coin.nets.reduce((s, n) => s + fiatOf(n), 0)
  const funded = coin.nets.find((n) => (balanceOf(n) ?? 0n) > 0n) ?? coin.nets[0]

  const copy = async () => {
    if (!key.address) return
    if (await copyText(key.address)) {
      setCopied(true)
      say("Адрес скопирован")
      setTimeout(() => setCopied(false), 1400)
    } else say("Не скопировалось: выделите адрес вручную")
  }

  return (
    <div className="ck-scroll pb-8">
      <header className="grid min-h-14 grid-cols-[48px_1fr_48px] items-center">
        <IconButton label="Назад" onClick={() => go({ screen: "home" })} className="-ml-2">
          <IconBack size={24} />
        </IconButton>
        <h1 className="t-h3 text-center">{symbol}</h1>
      </header>

      <section aria-label="Баланс монеты" className="flex flex-col items-center gap-1 pt-3 pb-5 text-center">
        <CoinLogo symbol={symbol} size={64} />
        {total === undefined ? (
          <p className="t-h3 pt-3">Адреса нет</p>
        ) : (
          <>
            <p className="t-balance pt-3">
              <Amount parts={coinParts(total, coin.nets[0].decimals)} unit={symbol} />
            </p>
            <Amount parts={fiatParts(fiat)} unit="$" className="t-body1 c-2" />
          </>
        )}
      </section>

      <div className="flex justify-center gap-4 pb-6">
        <ActionButton label="Отправить" icon={<IconSend size={24} />} onClick={() => go({ screen: "send", net: funded.id })} />
        <ActionButton label="Получить" icon={<IconReceive size={24} />} onClick={() => go({ screen: "receive", key: key.id })} />
      </div>

      <section aria-label="Адрес" className="card flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <KeyStack id={key.id} surface="var(--grouped)" />
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="t-label1">Адрес {key.title}</h2>
            {key.id === "evm" ? <p className="t-body2 c-2">общий для {plural(EVM_NETS.length, "сети", "сетей", "сетей")}</p> : null}
          </div>
          {key.address ? (
            <IconButton label="Скопировать адрес" round onClick={copy} className="-my-1.5 -mr-1.5">
              {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
            </IconButton>
          ) : null}
        </div>
        {key.address ? <Address value={key.address} lit={copied} /> : <p className="t-body2 c-2">В демо-кошельке адреса Bitcoin нет. В своём кошельке он появляется сразу после создания.</p>}
      </section>

      <section aria-label="По сетям" className="flex flex-col gap-2 pt-6">
        <h2 className="t-label1 flex min-h-8 items-center">{coin.nets.length > 1 ? `В ${coin.nets.length} сетях` : "В сети"}</h2>
        <div className="card list overflow-hidden">
          {coin.nets.map((n) => {
            const b = balanceOf(n)
            return (
              <div key={n.id} className="ck-row ck-row-net">
                <NetLogo id={n.id} size={32} />
                <span className="t-label1 truncate">{n.full}</span>
                {b === undefined ? <span className="t-body2 c-2">нет адреса</span> : <Amount parts={coinParts(b, n.decimals)} fracWidth={58} className="t-label1" />}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
