/**
 * Главная. Still by default: nothing here ticks unless an operation is waiting for a block (08 §4 E).
 * Fourteen networks are folded twice: coins you hold (ETH is one row for its seven networks), and the
 * networks themselves in four lines by tempo, the one property in which they really differ for the person:
 * how long a transfer will wait.
 */
import { useRef, useState } from "react"
import { IconChevronDown, IconChevronRight, IconReceive, IconSend, IconWallet } from "@/app/glyph"
import { ActionButton, Group, Screen, ScreenHeader, Sheet } from "@/app/ui"
import { AmountCell, Balance, group, columnOf, priceText, UsdCell, usdIntCh } from "../amount"
import { BeatStrip, Ruler } from "../BeatStrip"
import { useClock } from "../clock"
import { refresh, type WalletData } from "../data"
import type { Op } from "../index"
import { classOf, COINS, netById, netsOf, stepOf, TEMPO_CLASSES, type Net } from "../networks"
import { AddressSheet, CoinMark, NetMark, NetworkSheet, plural, shortName, tempoNumber } from "../parts"
import { SNAPSHOT_DATE } from "../snapshot"

type CoinLine = { coin: string; nets: Net[]; units: bigint; decimals: number; usd: number }

export function HomeScreen({ wallet, op, onSend, onCoin }: { wallet: WalletData; op: Op | null; onSend: () => void; onCoin: (coin: string, netId?: string) => void }) {
  const [sheet, setSheet] = useState<"wallet" | "zero" | string | null>(null)

  const lines: CoinLine[] = COINS.map((coin) => {
    const nets = netsOf(coin)
    const units = nets.reduce((s, n) => s + wallet.balances[n.id], 0n)
    const decimals = nets[0].decimals
    return { coin, nets, units, decimals, usd: (Number(units) / 10 ** decimals) * (wallet.prices[nets[0].cg]?.usd ?? 0) }
  })
  // the order is fixed when the screen opens and does not change under the eye (08 §4 B: rows never jump)
  const order = useRef<string[] | null>(null)
  order.current ??= [...lines].sort((a, b) => b.usd - a.usd).map((l) => l.coin)
  const held = order.current.map((c) => lines.find((l) => l.coin === c)!).filter((l) => l.units > 0n)
  const empty = order.current.map((c) => lines.find((l) => l.coin === c)!).filter((l) => l.units === 0n)
  const total = lines.reduce((s, l) => s + l.usd, 0)
  const col = columnOf(held)
  const usdCh = usdIntCh(held.map((l) => l.usd))

  return (
    <Screen className="pb-10">
      <ScreenHeader>
        <button
          type="button"
          onClick={() => setSheet("wallet")}
          aria-label="Демо: адреса кошелька"
          className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--fill)] py-2 pr-3 pl-3.5 transition-colors hover:bg-[var(--fill-press)] active:bg-[var(--tint)]"
        >
          <IconWallet size={20} />
          <span className="t-label1">Демо</span>
          <IconChevronDown size={16} className="c-2" />
        </button>
      </ScreenHeader>

      <section aria-label="Баланс" className="flex flex-col items-center gap-1 pt-6 pb-6 text-center">
        <Balance value={total} />
        <p className="t-body2 c-2">Тестовые монеты по курсу основной сети</p>
      </section>

      <div className="flex justify-center gap-4 pb-6">
        <ActionButton label="Отправить" icon={<IconSend size={24} />} onClick={onSend} />
        <ActionButton label="Получить" icon={<IconReceive size={24} />} onClick={() => setSheet("wallet")} />
      </div>

      <div className="flex flex-col gap-5">
        <Group
          header="Монеты"
          footer={
            wallet.phase === "partial" ? (
              <>
                Не обновилось: {wallet.stale.join(", ")}. Вместо этого снимок от {SNAPSHOT_DATE}.{" "}
                <button type="button" onClick={() => refresh()} className="t-label3 relative text-[var(--blue)] before:absolute before:-inset-x-2 before:-inset-y-3.5">
                  Повторить
                </button>
              </>
            ) : undefined
          }
        >
          {held.length === 0 ? (
            <div className="px-4 py-5">
              <p className="t-label1">Монет пока нет</p>
              <p className="t-body2 c-2">Тестовые монеты бесплатно раздают краны. Адреса для пополнения: кнопка «Получить».</p>
            </div>
          ) : null}
          {held.map((l) => (
            <CoinRow key={l.coin} line={l} wallet={wallet} col={col} usdCh={usdCh} op={op && netById(op.netId).symbol === l.coin ? op : null} onClick={() => onCoin(l.coin)} />
          ))}
          {empty.length ? (
            <button type="button" onClick={() => setSheet("zero")} className="flex min-h-14 w-full items-center gap-3 px-4 text-left">
              <span className="flex w-11 shrink-0 justify-center" aria-hidden="true">
                <span className="flex -space-x-1.5">
                  {empty.slice(0, 3).map((l) => (
                    <span key={l.coin} className="rounded-full" style={{ boxShadow: "0 0 0 2px var(--grouped)" }}>
                      <CoinMark symbol={l.coin} size={20} />
                    </span>
                  ))}
                </span>
              </span>
              <span className="t-body2 c-2 flex-1">
                Ещё {empty.length} {plural(empty.length, "монета", "монеты", "монет")} без остатка
              </span>
              <IconChevronRight size={18} className="c-2 shrink-0" />
            </button>
          ) : null}
        </Group>

        <section className="flex flex-col gap-2">
          <div className="flex min-h-8 items-center justify-between">
            <h2 className="t-label1">Сети по такту</h2>
            <span className="t-body2 c-2">секунд на блок</span>
          </div>
          <div className="card list overflow-hidden">
            {TEMPO_CLASSES.map((c) => {
              const nets = NETS_SORTED(wallet.tempo).filter((n) => classOf(wallet.tempo[n.id]).id === c.id)
              if (!nets.length) return null
              const ts = nets.map((n) => wallet.tempo[n.id]).filter((t): t is number => t !== undefined)
              const range = ts.length === 0 ? "неровно" : ts.length === 1 || tempoNumber(ts[0]) === tempoNumber(ts[ts.length - 1]) ? tempoNumber(ts[0]) : `${tempoNumber(ts[0])}–${tempoNumber(ts[ts.length - 1])}`
              const step = stepOf(ts[0])
              return (
                <button key={c.id} type="button" onClick={() => setSheet(c.id)} aria-label={`${c.title}: ${nets.map((n) => n.name).join(", ")}`} className="flex min-h-[68px] w-full items-center gap-3 px-4 py-2.5 text-left">
                  <Ruler step={step} ticks={Math.floor(44 / step) + 1} className="shrink-0" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="t-label1">{nets.length === 1 ? nets[0].name : c.title}</span>
                    <span className="flex gap-1">
                      {nets.map((n) => (
                        <NetMark key={n.id} net={n} size={18} />
                      ))}
                    </span>
                  </span>
                  <span className={"shrink-0 text-right " + (ts.length ? "t-label1" : "t-body2 c-2")}>{range}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <AddressSheet open={sheet === "wallet"} onOpenChange={(o) => setSheet(o ? "wallet" : null)} />

      <Sheet open={sheet === "zero"} onOpenChange={(o) => setSheet(o ? "zero" : null)} title="Монеты без остатка" subtitle="Сети подключены, монет в них пока нет">
        <div className="card list overflow-hidden">
          {empty.map((l) => (
            <button key={l.coin} type="button" onClick={() => onCoin(l.coin)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2 text-left">
              <CoinMark symbol={l.coin} size={36} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="t-label1">{l.coin}</span>
                <span className="t-body2 c-2 truncate">{l.nets.length > 1 ? `${l.nets.length} сетей` : l.nets[0].name}</span>
              </span>
              <span className="t-label1 c-2">0</span>
            </button>
          ))}
        </div>
      </Sheet>

      {TEMPO_CLASSES.map((c) => (
        <NetworkSheet
          key={c.id}
          open={sheet === c.id}
          onOpenChange={(o) => setSheet(o ? c.id : null)}
          title={c.title}
          subtitle={c.id === "min" ? "В основной сети Bitcoin блок выходит в среднем раз в 10 минут" : "Время между двумя блоками, измерено сейчас"}
          tempo={wallet.tempo}
          only={c.id}
          onPick={(n) => onCoin(n.symbol, n.id)}
        />
      ))}
    </Screen>
  )
}

const NETS_SORTED = (tempo: Record<string, number>) => COINS.flatMap((c) => netsOf(c)).sort((a, b) => (tempo[a.id] ?? 1e9) - (tempo[b.id] ?? 1e9))

/** a coin row; while its operation waits for a block, the row's own hairline carries the beats, and the row does not move */
function CoinRow({ line, wallet, col, usdCh, op, onClick }: { line: CoinLine; wallet: WalletData; col: { intCh: number; fracCh: number }; usdCh: number; op: Op | null; onClick: () => void }) {
  const net = op ? netById(op.netId) : null
  const tempo = net ? wallet.tempo[net.id] : undefined
  const clock = useClock(op && !op.hit ? op.netId : null, tempo)
  const price = wallet.prices[line.nets[0].cg]
  const where = line.nets.length > 1 ? `${line.nets.length} сетей` : line.nets[0].name.replace(/^(Solana|TON) /, "")
  return (
    <button type="button" onClick={onClick} className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left">
      <CoinMark symbol={line.coin} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-1.5">
          <span className="t-label1">{line.coin}</span>
          <span className="t-body2 c-2 truncate">{where}</span>
        </span>
        {op && net ? (
          <span key={op.hit ? "hit" : "wait"} role="status" className="eb-word t-body2 truncate !gap-0 whitespace-pre">
            {op.hit ? <span className="text-[var(--green)]">В блоке {group(String(op.hit.height))}</span> : <span className="text-[var(--blue)]">Ждёт блок</span>}
            {op.hit ? null : <span className="c-2"> · {shortName(net)}</span>}
          </span>
        ) : (
          <span className="t-body2 c-2 truncate">
            {price ? priceText(price.usd) : "курс недоступен"}
            {price ? <span className={price.change24h < 0 ? "text-[var(--red)]" : "text-[var(--green)]"}> {(price.change24h < 0 ? "−" : "+") + Math.abs(price.change24h).toFixed(2).replace(".", ",")} %</span> : null}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <AmountCell units={line.units} decimals={line.decimals} {...col} className="t-label1" />
        <span className="t-body2 c-2">
          <UsdCell value={line.usd} intCh={usdCh} />
        </span>
      </span>
      {op && net ? (
        <BeatStrip key={op.sentAt} style={{ left: 72 }} size="row" head={op.hit?.height ?? clock.height} step={stepOf(tempo)} tempo={tempo} sentHeight={op.sentHeight} hit={op.hit?.height} slot={!op.hit} />
      ) : null}
    </button>
  )
}
