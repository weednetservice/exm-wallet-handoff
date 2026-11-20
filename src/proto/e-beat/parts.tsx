/** Small shared pieces of the prototype: marks, words, the clock line, the network sheet. */
import { useEffect, useState, type ReactNode } from "react"
import { RoundMark } from "@/app/marks"
import { DEMO_ADDRESSES } from "@/app/demo"
import { IconCheck, IconCopy } from "@/app/icons"
import { copyText, IconButton, Sheet, useToast } from "@/app/ui"
import { shortAddress } from "@/lib/format"
import { Ticker } from "./amount"
import type { ClockState } from "./clock"
import { classOf, COIN_MARK, NETS, TEMPO_CLASSES, type Net } from "./networks"

/** a network's own mark in a circle (@web3icons/react, MIT) */
export function NetMark({ net, size = 36 }: { net: Net; size?: number }) {
  return (
    <span aria-hidden="true" className="inline-block shrink-0 overflow-hidden rounded-full bg-[var(--tint)]" style={{ width: size, height: size }}>
      <RoundMark mark={net.mark} size={size} base={net.id === "base-sepolia"} />
    </span>
  )
}

/** a coin's mark; with `net`, the network badge on its corner (Keeper's USDT on TRON) */
export function CoinMark({ symbol, net, size = 44, ring = "var(--grouped)" }: { symbol: string; net?: Net; size?: number; ring?: string }) {
  const M = COIN_MARK[symbol]
  const badge = Math.max(16, Math.round(size * 0.4))
  return (
    <span aria-hidden="true" className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span className="block size-full overflow-hidden rounded-full bg-[var(--tint)]">
        <M variant="background" size={size} />
      </span>
      {net && net.id !== HOME_NET[symbol] ? (
        <span className="absolute overflow-hidden rounded-full" style={{ width: badge, height: badge, right: -2, bottom: -2, boxShadow: `0 0 0 2px ${ring}` }}>
          <RoundMark mark={net.mark} size={badge} base={net.id === "base-sepolia"} />
        </span>
      ) : null}
    </span>
  )
}

/** where a coin is at home: no badge there (Keeper shows TON bare, USDT with a TRON badge) */
const HOME_NET: Record<string, string> = { ETH: "sepolia", SOL: "solana-devnet", TON: "ton-testnet", POL: "polygon-amoy", AVAX: "avalanche-fuji", BNB: "bnb-testnet", MON: "monad-testnet", BTC: "bitcoin-testnet4" }

export const COIN_NAME: Record<string, string> = { ETH: "Ether", SOL: "Solana", TON: "Toncoin", POL: "POL", AVAX: "Avalanche", BNB: "BNB", MON: "Monad", BTC: "Bitcoin" }

/** a network in one word, for a tight line: Sepolia, Base, Arbitrum, Solana */
export const shortName = (net: Net) => (net.id === "sepolia" ? "Sepolia" : net.name.split(" ")[0])

/** 1 блок, 2 блока, 5 блоков */
export function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10
  const b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}
export const beatsText = (n: number, unit: Net["unit"]) =>
  `${n.toLocaleString("ru-RU")} ${unit === "слот" ? plural(n, "слот", "слота", "слотов") : plural(n, "блок", "блока", "блоков")}`

const trim = (n: number, digits: number) => n.toFixed(digits).replace(/\.?0+$/, "").replace(".", ",")
/** seconds per block as a number: 0,2 · 0,24 · 1,6 · 12 */
export const tempoNumber = (t: number) => (t < 0.95 ? trim(t, 2) : t < 9.5 ? trim(t, 1) : String(Math.round(t)))
/** "блок раз в 0,2 с"; a network without a steady rhythm says so */
export const tempoLine = (net: Net, t: number | undefined) => (t === undefined ? "блоки идут неровно" : `${net.unit} раз в ${tempoNumber(t)} с`)

/** a duration that was measured: 0,8 с · 12 с · 2 мин 10 с */
export function spanText(ms: number) {
  const s = ms / 1000
  if (s < 10) return `${trim(s, 1)} с`
  if (s < 60) return `${Math.round(s)} с`
  return `${Math.floor(s / 60)} мин ${Math.round(s % 60)} с`
}

/** re-renders once a second while `on`: for "N с назад", which is a number, not motion */
export function useSeconds(on: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => set((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [on])
  return Date.now()
}

/**
 * The one line a network says about itself while it is listened to: its newest block, and for slow networks
 * how long ago it came. A silent or unreachable network says that in words (08 §4 E, the main risk of E).
 */
export function ClockLine({ net, clock, tempo }: { net: Net; clock: ClockState; tempo: number | undefined }) {
  const slow = tempo === undefined || tempo >= 3
  const now = useSeconds(slow || clock.status === "silent")
  if (clock.status === "offline") return <span className="text-[var(--orange)]">Узел сети не отвечает, пробуем снова</span>
  if (clock.height === undefined) return <span>Соединяемся с сетью…</span>
  if (clock.status === "silent") return <span className="text-[var(--orange)]">Сеть молчит {Math.round((now - (clock.lastAt ?? now)) / 1000)} с</span>
  const ago = Math.max(0, Math.round((now - (clock.lastAt ?? now)) / 1000))
  return (
    <span>
      {net.unit === "слот" ? "Слот" : "Блок"} <Ticker value={clock.height} slide={tempo === undefined || tempo >= 0.95} />
      {/* how long ago is known only for a block this browser saw arrive */}
      {tempo === undefined ? null : slow && clock.beats.length ? ` · ${ago} с назад` : ` · раз в ${tempoNumber(tempo)} с`}
    </span>
  )
}

/** all networks, folded by tempo: the same four classes as on the home screen */
export function NetworkSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  tempo,
  only,
  current,
  onPick,
  right,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: ReactNode
  tempo: Record<string, number>
  /** one class only (the home screen's rows) */
  only?: string
  current?: string
  onPick: (net: Net) => void
  right?: (net: Net) => ReactNode
}) {
  const classes = TEMPO_CLASSES.filter((c) => !only || c.id === only)
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} subtitle={subtitle}>
      <div className="flex flex-col gap-4 pb-2">
        {classes.map((c) => {
          const nets = NETS.filter((n) => classOf(tempo[n.id]).id === c.id).sort((a, b) => (tempo[a.id] ?? 1e9) - (tempo[b.id] ?? 1e9))
          if (!nets.length) return null
          return (
            <section key={c.id} className="flex flex-col gap-2">
              {only ? null : <h3 className="t-label2 c-2 px-1">{c.title}</h3>}
              <div className="card list overflow-hidden">
                {nets.map((n) => (
                  <button key={n.id} type="button" onClick={() => onPick(n)} aria-current={n.id === current ? "true" : undefined} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left">
                    <NetMark net={n} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="t-label1 truncate">{n.name}</span>
                      <span className="t-body2 c-2">{n.symbol}</span>
                    </span>
                    <span className="t-body2 c-2 shrink-0 text-right">{right ? right(n) : tempoLine(n, tempo[n.id])}</span>
                    {n.id === current ? <IconCheck size={20} className="shrink-0 text-[var(--blue)]" aria-label="выбрана" /> : null}
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </Sheet>
  )
}

/** «Получить» and the account pill: the demo wallet's addresses, to copy */
export function AddressSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [toast, showToast] = useToast()
  const copy = async (text: string) => showToast((await copyText(text)) ? "Скопировано" : "Не удалось скопировать")
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title="Демо-кошелёк" subtitle="Открытые тестовые адреса, только просмотр">
        <div className="card list overflow-hidden">
          {[
            { title: "11 сетей EVM", sub: "Ethereum, Base, Arbitrum и ещё 8: один адрес", address: DEMO_ADDRESSES[0] },
            { title: "Solana Devnet", sub: null, address: DEMO_ADDRESSES[1] },
            { title: "TON Testnet", sub: null, address: DEMO_ADDRESSES[2] },
          ].map((a) => (
            <div key={a.address} className="flex min-h-[64px] items-center gap-3 py-2 pr-2 pl-4">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="t-label1">{a.title}</span>
                <span className="t-body2 c-2 mono truncate">{shortAddress(a.address, 8, 6)}</span>
                {a.sub ? <span className="t-body3 c-2">{a.sub}</span> : null}
              </span>
              <IconButton label={`Скопировать адрес: ${a.title}`} onClick={() => copy(a.address)}>
                <IconCopy size={22} />
              </IconButton>
            </div>
          ))}
        </div>
        <p className="t-body3 c-2 px-1 pt-3">Адреса Bitcoin в демо-наборе нет, поэтому баланс BTC здесь ноль.</p>
      </Sheet>
      {toast}
    </>
  )
}
