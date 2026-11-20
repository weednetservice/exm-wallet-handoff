/**
 * Монета: one coin across its networks. One network at a time is listened to: its line shows the newest
 * block and its hairline carries the beats. Tapping another network moves the ear there, tapping the
 * same one again stops listening (the pause control for a motion that otherwise runs as long as the chain does).
 */
import { useState } from "react"
import { IconReceive, IconSend } from "@/app/glyph"
import { ActionButton, Group, Screen, ScreenHeader } from "@/app/ui"
import { Amount, AmountCell, columnOf, usdText } from "../amount"
import { BeatStrip } from "../BeatStrip"
import { useClock } from "../clock"
import type { WalletData } from "../data"
import { netsOf, stepOf, type Net } from "../networks"
import { AddressSheet, ClockLine, CoinMark, COIN_NAME, NetMark, tempoLine } from "../parts"

export function CoinScreen({
  coin,
  wallet,
  tuned,
  onTune,
  onBack,
  onSend,
}: {
  coin: string
  wallet: WalletData
  /** the network being listened to, or null */
  tuned: string | null
  onTune: (netId: string | null) => void
  onBack: () => void
  onSend: () => void
}) {
  const [receive, setReceive] = useState(false)
  const nets = netsOf(coin)
  const decimals = nets[0].decimals
  const total = nets.reduce((s, n) => s + wallet.balances[n.id], 0n)
  const price = wallet.prices[nets[0].cg]
  const col = columnOf(nets.map((n) => ({ units: wallet.balances[n.id], decimals })))
  const many = nets.length > 1

  return (
    <Screen className="pb-10">
      <ScreenHeader title={COIN_NAME[coin]} onBack={onBack} backLabel="На главную" />

      <section aria-label="Остаток" className="flex flex-col items-center gap-3 pt-2 pb-6 text-center">
        <CoinMark symbol={coin} size={64} ring="var(--bg)" />
        <div className="flex flex-col items-center">
          <Amount units={total} decimals={decimals} unit={coin} className="t-h1" />
          <p className="t-body2 c-2">{price ? `${usdText((Number(total) / 10 ** decimals) * price.usd)} по курсу основной сети` : "курс недоступен"}</p>
        </div>
      </section>

      <div className="flex justify-center gap-4 pb-6">
        <ActionButton label="Отправить" icon={<IconSend size={24} />} onClick={onSend} />
        <ActionButton label="Получить" icon={<IconReceive size={24} />} onClick={() => setReceive(true)} />
      </div>

      <Group
        header={many ? `Сети · ${nets.length}` : "Сеть"}
        footer={many ? "Блоки видны у одной сети за раз. Нажмите на сеть, чтобы слушать её; ещё раз, чтобы остановить." : "Нажмите на сеть, чтобы остановить или снова слушать её блоки."}
      >
        <div role="radiogroup" aria-label="Сеть, блоки которой показаны" className="list">
          {nets.map((n) => (
            <NetRow key={n.id} net={n} units={wallet.balances[n.id]} tempo={wallet.tempo[n.id]} col={col} on={tuned === n.id} onClick={() => onTune(tuned === n.id ? null : n.id)} />
          ))}
        </div>
      </Group>
      <AddressSheet open={receive} onOpenChange={setReceive} />
    </Screen>
  )
}

function NetRow({ net, units, tempo, col, on, onClick }: { net: Net; units: bigint; tempo: number | undefined; col: { intCh: number; fracCh: number }; on: boolean; onClick: () => void }) {
  const clock = useClock(on ? net.id : null, tempo)
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className="eb-net flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left">
      <NetMark net={net} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-label1 truncate">{net.name}</span>
        <span className="t-body2 c-2 truncate">{on ? <ClockLine net={net} clock={clock} tempo={tempo} /> : tempoLine(net, tempo)}</span>
      </span>
      <AmountCell units={units} decimals={net.decimals} {...col} className="t-label1 shrink-0" />
      {on ? <BeatStrip style={{ left: 64 }} size="row" head={clock.height} step={stepOf(tempo)} tempo={tempo} /> : null}
    </button>
  )
}
