/**
 * Монета: one coin across its networks. With no network chosen the light is the coin's own
 * (its home chain); a tap on a network row gives birth to that network's light at the row,
 * and it rises to the top. The rows keep their places; only the figures above narrow.
 */
import { useState } from "react"
import { IconBack, IconCheck, IconReceive, IconSend } from "@/app/glyph"
import { ActionButton, ChipButton, IconButton } from "@/app/ui"
import { coinBySymbol, held, netById, netsOf, usdOf, type Net } from "./data"
import { ReceiveSheet } from "./Home"
import { BigFigure, CoinAmount, CoinMark, coinText, midY, NetMark, Scope, UsdAmount, useProto } from "./parts"

export function CoinScreen({ symbol, netId, onBack }: { symbol: string; netId: string | null; onBack: () => void }) {
  const { go } = useProto()
  const [receive, setReceive] = useState(false)
  const coin = coinBySymbol(symbol)
  const nets = netsOf(symbol)
  const many = nets.length > 1
  const net = netId ? netById(netId) : null
  const amount = held(symbol, netId)
  const text = coinText(amount, coin.decimals)
  // sending starts in the network in view, or in the one where the coins lie
  const sendFrom = net ?? nets.find((n) => n.amount > 0n) ?? netById(coin.home)

  return (
    <div className="flex flex-col pb-10">
      <header className="grid min-h-16 grid-cols-[48px_1fr_48px] items-center">
        <IconButton label="Назад" onClick={onBack} className="-ml-2">
          <IconBack size={24} />
        </IconButton>
        <h1 className="t-h3 text-center">{coin.name}</h1>
      </header>

      <section aria-label="Баланс монеты" className="flex flex-col items-center gap-1 pt-2 pb-6 text-center">
        <CoinMark coin={coin} net={net} size={64} cut="var(--bg)" />
        <div className="pt-4">
          <BigFigure whole={text} rest={" " + coin.symbol} label={`${text} ${coin.symbol}`} />
        </div>
        <UsdAmount value={usdOf(amount, coin)} className="t-body1 c-2" />
        <div className="pt-1">
          <Scope net={net}>{net ? net.name : `В ${nets.length} сетях`}</Scope>
        </div>
      </section>

      <div className="flex justify-center gap-4 pb-6">
        <ActionButton label="Отправить" icon={<IconSend size={24} />} onClick={() => go({ screen: "send", coin: symbol, net: sendFrom.id })} />
        <ActionButton label="Получить" icon={<IconReceive size={24} />} onClick={() => setReceive(true)} />
      </div>

      <section aria-label="Сети монеты" className="flex flex-col">
        <div className="flex min-h-11 items-center justify-between">
          <h2 className="t-label1">{many ? "Сети" : "Сеть"}</h2>
          {many && net ? <ChipButton onClick={() => go({ screen: "coin", coin: symbol, net: null }, { dur: 240 })}>Все {nets.length} сетей</ChipButton> : null}
        </div>
        <div className="card list overflow-hidden">
          {nets.map((n) =>
            many ? (
              <button
                key={n.id}
                type="button"
                aria-pressed={n.id === netId}
                onClick={(e) =>
                  n.id === netId ? go({ screen: "coin", coin: symbol, net: null }, { dur: 240 }) : go({ screen: "coin", coin: symbol, net: n.id }, { fromY: midY(e.currentTarget), dur: 360 })
                }
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
              >
                <NetRow net={n} decimals={coin.decimals} on={n.id === netId} />
              </button>
            ) : (
              <div key={n.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <NetRow net={n} decimals={coin.decimals} on={false} />
              </div>
            ),
          )}
        </div>
      </section>

      <ReceiveSheet open={receive} onOpenChange={setReceive} family={sendFrom.family} />
    </div>
  )
}

/** a network's logo, name and the coin's balance there; the check has its own column, so amounts never shift */
export function NetRow({ net, decimals, on }: { net: Net; decimals: number; on: boolean }) {
  return (
    <>
      <NetMark net={net} size={32} />
      <span className="t-body1 min-w-0 flex-1 truncate">{net.name}</span>
      <CoinAmount amount={net.amount} decimals={decimals} className="t-label1" />
      <span className="grid w-5 shrink-0 place-items-center" style={{ color: net.light }}>
        {on ? <IconCheck size={20} aria-label="выбрана" /> : null}
      </span>
    </>
  )
}
