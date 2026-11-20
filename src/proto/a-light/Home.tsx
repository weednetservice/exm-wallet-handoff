/**
 * Главная: Keeper's four blocks, and under the actions one ruler of all 14 networks.
 * A finger on the ruler picks a network: the light takes its colour, the figures narrow to it,
 * the rows stay where they are (the ones outside the network go quiet). Nothing is recoloured.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { motion } from "motion/react"
import QRCode from "qrcode"
import { RoundMark } from "@/app/marks"
import { IconChevronDown, IconCopy, IconReceive, IconSend, IconWallet } from "@/app/glyph"
import { ActionButton, ChipButton, copyText, IconButton, SecondaryButton, Sheet, useToast } from "@/app/ui"
import { shortAddress } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ADDRESS, COINS, EVM_COUNT, held, netById, NETS, netsOf, totalUsd, usdOf, type Family } from "./data"
import { BigFigure, CoinAmount, CoinMark, midY, Scope, UsdAmount, usdParts, useProto } from "./parts"

/** one order everywhere: by value, then the list order; it never changes while the screen is open */
const ORDER = [...COINS].sort((a, b) => usdOf(held(b.symbol), b) - usdOf(held(a.symbol), a))

export function Home({ filter }: { filter: string | null }) {
  const { go } = useProto()
  const [sheet, setSheet] = useState<null | "addresses" | "receive">(null)
  const net = filter ? netById(filter) : null
  const total = usdParts(totalUsd(filter))
  const setFilter = (id: string | null) => go({ screen: "home", filter: id })
  // "Отправить" sends the coin of the network in view, otherwise the largest holding in the network it lies in
  const send = () => {
    if (net) return go({ screen: "send", coin: net.coin, net: net.id })
    const top = ORDER[0]
    const from = netsOf(top.symbol).find((n) => n.amount > 0n) ?? netById(top.home)
    go({ screen: "send", coin: top.symbol, net: from.id })
  }

  return (
    <div className="flex flex-col pb-10">
      <header className="flex min-h-16 items-center justify-center">
        <button
          type="button"
          onClick={() => setSheet("addresses")}
          aria-label="Демо: адреса кошелька"
          className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--fill)] py-2 pr-3 pl-3.5 transition-colors hover:bg-[var(--fill-press)] active:bg-[var(--tint)]"
        >
          <IconWallet size={20} />
          <span className="t-label1">Демо</span>
          <IconChevronDown size={16} className="c-2" />
        </button>
      </header>

      <section aria-label="Баланс" className="flex flex-col items-center gap-1 pt-6 pb-6 text-center">
        <BigFigure whole={total.whole} rest={total.frac} label={total.whole + total.frac} />
        <Scope net={net}>{net ? net.name : `Во всех ${NETS.length} сетях`}</Scope>
      </section>

      <div className="flex justify-center gap-4 pb-6">
        <ActionButton label="Отправить" icon={<IconSend size={24} />} onClick={send} />
        <ActionButton label="Получить" icon={<IconReceive size={24} />} onClick={() => setSheet("receive")} />
      </div>

      <section aria-label="Сети и монеты" className="flex flex-col">
        <div className="flex min-h-11 items-center justify-between">
          <h2 className="t-label1">{net ? net.name : "Сети"}</h2>
          {net ? <ChipButton onClick={() => setFilter(null)}>Все сети</ChipButton> : <span className="t-body2 c-2">
              <span className="al-touch">Проведите по ряду</span>
              <span className="al-fine">{NETS.length}</span>
            </span>}
        </div>
        <Ruler value={filter} onChange={setFilter} />

        <div className="card list mt-2 overflow-hidden">
          {ORDER.map((coin) => {
            const nets = netsOf(coin.symbol)
            const inView = !net || net.coin === coin.symbol
            const amount = held(coin.symbol, inView ? filter : null)
            return (
              <button
                key={coin.symbol}
                type="button"
                disabled={!inView}
                onClick={(e) =>
                  go(
                    {
                      screen: "coin",
                      coin: coin.symbol,
                      net: net ? net.id : nets.length === 1 ? nets[0].id : null,
                    },
                    { fromY: midY(e.currentTarget), dur: 360 },
                  )
                }
                className={cn("al-row flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left", !inView && "al-row-dim")}
              >
                <CoinMark coin={coin} net={inView ? net : null} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="t-label1">{coin.symbol}</span>
                  <span className="t-body2 c-2 truncate">{inView && net ? net.name : nets.length > 1 ? `${nets.length} сетей` : nets[0].name}</span>
                </span>
                <span className="flex flex-col items-end">
                  <CoinAmount amount={amount} decimals={coin.decimals} className="t-label1" />
                  <UsdAmount value={usdOf(amount, coin)} className="t-body2 c-2" />
                </span>
              </button>
            )
          })}
        </div>
        <p className="t-body3 c-2 px-1 pt-3">Монеты тестовые. Сумма в долларах посчитана по курсу основной сети.</p>
      </section>

      <AddressSheet open={sheet === "addresses"} onOpenChange={(o) => setSheet(o ? "addresses" : null)} />
      <ReceiveSheet open={sheet === "receive"} onOpenChange={(o) => setSheet(o ? "receive" : null)} family={net?.family ?? "evm"} />
    </div>
  )
}

/* ------------------------------------------------------------------------------------ ruler */

/**
 * All 14 networks in one row, 44 px high. Logos are one-colour (white where the address holds
 * coins, grey where it holds none), so 14 brands do not become 14 spots; only the chosen one shows
 * its own logo, inside a ring of its light. Works as a scrubber under a finger and as a radio
 * group from the keyboard (arrows move, Enter or Space picks, Escape shows all networks).
 */
function Ruler({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    first: string
    was: string | null
    moved: boolean
  } | null>(null)
  const current = useRef(value)
  current.current = value

  const at = (x: number) => {
    const r = box.current!.getBoundingClientRect()
    return NETS[Math.min(NETS.length - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * NETS.length)))].id
  }
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const id = at(e.clientX)
    drag.current = { first: id, was: current.current, moved: false }
    if (id !== current.current) onChange(id)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const id = at(e.clientX)
    if (id !== drag.current.first) drag.current.moved = true
    if (id !== current.current) onChange(id)
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    // a tap on the network already chosen lets it go
    if (d && !d.moved && d.was === d.first) onChange(null)
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = NETS.findIndex((n) => n.id === (current.current ?? (e.target as HTMLElement).dataset.net))
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (step) {
      e.preventDefault()
      const next = NETS[(i + step + NETS.length) % NETS.length]
      onChange(next.id)
      box.current?.querySelector<HTMLElement>(`[data-net="${next.id}"]`)?.focus()
    } else if (e.key === "Escape" && current.current) {
      onChange(null)
    }
  }

  return (
    <div ref={box} role="radiogroup" aria-label="Сеть" className="al-ruler" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => (drag.current = null)} onKeyDown={key}>
      {NETS.map((n, i) => {
        const on = n.id === value
        const M = n.mark
        return (
          <button key={n.id} type="button" role="radio" aria-checked={on} aria-label={n.name} data-net={n.id} tabIndex={on || (!value && i === 0) ? 0 : -1} onClick={() => onChange(on ? null : n.id)}>
            {on ? (
              <>
                <motion.span
                  layoutId="al-ring"
                  className="absolute size-7 rounded-full"
                  style={{ boxShadow: `inset 0 0 0 2px ${n.light}` }}
                  transition={{ type: "spring", stiffness: 520, damping: 42 }}
                />
                <span className="relative block size-5 overflow-hidden rounded-full">
                  <RoundMark mark={n.mark} size={20} base={n.id === "base-sepolia"} />
                </span>
              </>
            ) : (
              <span className={n.amount > 0n ? "text-[var(--label)]" : "c-2"}>
                <M variant="mono" size={20} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ----------------------------------------------------------------------------------- sheets */

const FAMILY: { family: Family; title: string; note: string }[] = [
  { family: "evm", title: "Адрес EVM", note: `один на ${EVM_COUNT} сетей` },
  { family: "solana", title: "Адрес Solana", note: "Solana Devnet" },
  { family: "ton", title: "Адрес TON", note: "TON Testnet" },
]

function AddressSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [toast, show] = useToast()
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Демо" subtitle="Адреса только для просмотра">
      <div className="card list overflow-hidden">
        {FAMILY.map((f) => {
          const address = ADDRESS[f.family]!
          return (
            <div key={f.family} className="flex min-h-16 items-center gap-3 py-2 pr-2 pl-4">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="t-label1">
                  {f.title} <span className="t-body2 c-2">{f.note}</span>
                </span>
                <span className="mono t-body2 c-2">{shortAddress(address, 8, 6)}</span>
              </span>
              <IconButton label={`Скопировать ${f.title.toLowerCase()}`} onClick={async () => show((await copyText(address)) ? "Адрес скопирован" : "Не удалось скопировать")}>
                <IconCopy size={22} />
              </IconButton>
            </div>
          )
        })}
      </div>
      <p className="t-body3 c-2 px-1 pt-3">Адреса Bitcoin у демо-кошелька нет, поэтому в Bitcoin Testnet4 показан ноль.</p>
      {toast}
    </Sheet>
  )
}

export function ReceiveSheet({ open, onOpenChange, family }: { open: boolean; onOpenChange: (o: boolean) => void; family: Family }) {
  const [svg, setSvg] = useState("")
  const [toast, show] = useToast()
  const address = ADDRESS[family]
  const info = FAMILY.find((f) => f.family === family)
  useEffect(() => {
    if (!open || !address) return
    QRCode.toString(address, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#10161f", light: "#ffffff" },
    }).then(setSvg, () => setSvg(""))
  }, [open, address])
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Получить" subtitle={info ? `${info.title}: ${info.note}` : "Bitcoin Testnet4"}>
      {address ? (
        <div className="flex flex-col items-center gap-5 pb-2">
          <div className="grid size-[232px] place-items-center rounded-[var(--radius-qr)] bg-white p-5" role="img" aria-label="QR-код адреса" dangerouslySetInnerHTML={{ __html: svg }} />
          <p id="al-address" className="mono t-body2 max-w-[300px] text-center break-all">
            {address}
          </p>
          <SecondaryButton onClick={async () => show((await copyText(address)) ? "Адрес скопирован" : "Не удалось скопировать")}>
            <IconCopy size={20} />
            Скопировать адрес
          </SecondaryButton>
        </div>
      ) : (
        <p className="t-body2 c-2 px-1 pb-4 text-center">У демо-кошелька нет адреса Bitcoin: получить монеты в этой сети некуда.</p>
      )}
      {toast}
    </Sheet>
  )
}
