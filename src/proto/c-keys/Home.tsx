/** Главная: баланс, под ним четыре ключа (фильтр списка и веер сетей EVM), действия Keeper, монеты. */
import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { IconChevronDown, IconHistory, IconMarket, IconReceive, IconSend, IconSwap, IconWallet } from "@/app/glyph"
import { ActionButton } from "@/app/ui"
import { CoinLogo } from "./logos"
import { balanceOf, COINS, coinParts, EVM_NETS, fiatOf, fiatParts, keyById, netById, partsText, plural, TOTAL_FIAT, type KeyId } from "./model"
import { Amount, EASE, KeyRing } from "./parts"
import { SNAPSHOT_LABEL } from "./snapshot"
import type { Go } from "./index"

/** место под дробь: «,2206» кеглем 16; запятые всех строк стоят на одной вертикали */
const FRAC = 58

export function Home({ go, say }: { go: Go; say: (text: string) => void }) {
  const [key, setKey] = useState<KeyId | null>(null)
  const [net, setNet] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const total = fiatParts(TOTAL_FIAT)

  const rows = COINS.flatMap((coin) => {
    const nets = coin.nets.filter((n) => (!key || n.key === key) && (!net || n.id === net))
    if (!nets.length) return []
    const held = nets.map(balanceOf)
    const amount = held[0] === undefined ? undefined : held.reduce<bigint>((s, b) => s + (b ?? 0n), 0n)
    return [{ coin, nets, amount, fiat: nets.reduce((s, n) => s + fiatOf(n), 0) }]
  })
  // монеты с остатком стоят первыми в порядке ключей; пустые свёрнуты в одну строку, если есть что показать кроме них
  const funded = rows.filter((r) => (r.amount ?? 0n) > 0n)
  const empty = rows.filter((r) => !((r.amount ?? 0n) > 0n))
  const fold = funded.length > 0 && empty.length > 1
  const shown = fold && !more ? funded : [...funded, ...empty]
  const filter = net ? netById(net).full : key ? keyById(key).title : null
  const subtotal = fiatParts(rows.reduce((s, r) => s + r.fiat, 0))

  return (
    <>
      <div className="ck-scroll pb-[96px]">
        <header className="flex min-h-16 items-center justify-center">
          <div className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--fill)] py-2 pr-4 pl-3.5">
            <IconWallet size={20} />
            <span className="t-label1">Демо</span>
          </div>
        </header>

        <section aria-label="Баланс" className="pt-8 pb-8 text-center">
          <p className="t-balance">
            <span className="sr-only">{partsText(total, "$")}</span>
            <span aria-hidden="true">{total.int}</span>
            <span aria-hidden="true" className="ck-q text-[26px] font-medium tracking-normal">
              ,{total.frac} $
            </span>
          </p>
        </section>

        <KeyRing
          label="Ключи кошелька"
          selected={key}
          net={net}
          caption={`Один адрес на ${plural(EVM_NETS.length, "сеть", "сети", "сетей")}`}
          onKey={(k) => {
            setNet(null)
            setKey(key === k ? null : k)
          }}
          onNet={(id) => setNet(net === id ? null : id)}
        />

        <div className="flex justify-center gap-4 pt-6 pb-6">
          <ActionButton label="Отправить" icon={<IconSend size={24} />} onClick={() => go({ screen: "send" })} />
          <ActionButton label="Получить" icon={<IconReceive size={24} />} onClick={() => go({ screen: "receive", key: key ?? "evm" })} />
          <ActionButton label="Обмен" icon={<IconSwap size={24} />} onClick={() => say("Обмен в этот прототип не входит")} />
        </div>

        <section aria-label="Монеты" className="flex flex-col gap-2">
          <div className="flex min-h-8 items-center justify-between gap-3">
            <h2 className="t-label1 truncate">
              Монеты
              {filter ? <span className="c-2"> · {filter}</span> : null}
            </h2>
            {filter ? <Amount parts={subtotal} unit="$" className="t-label2" /> : null}
          </div>
          <div className="card list overflow-hidden">
            <AnimatePresence initial={false}>
              {shown.map(({ coin, nets, amount, fiat }) => (
                <motion.div key={coin.symbol} initial={{ height: 0, opacity: 0 }} animate={{ height: 72, opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: EASE }} className="overflow-hidden">
                  <button type="button" className="ck-row" onClick={() => go({ screen: "coin", coin: coin.symbol })}>
                    <CoinLogo symbol={coin.symbol} />
                    <span className="flex min-w-0 flex-col">
                      <span className="t-label1">{coin.symbol}</span>
                      <span className="t-body2 c-2 truncate">{nets.length > 1 ? `в ${nets.length} сетях` : nets[0].full}</span>
                    </span>
                    {amount === undefined ? (
                      <span className="t-body2 c-2">в демо нет адреса</span>
                    ) : (
                      <span className="flex flex-col items-end">
                        <Amount parts={coinParts(amount, nets[0].decimals)} fracWidth={FRAC} className="t-label1" />
                        <Amount parts={fiatParts(fiat)} unit="$" fracWidth={FRAC} className="t-body2 c-2" />
                      </span>
                    )}
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {fold ? (
              <button type="button" className="ck-row ck-row-more" aria-expanded={more} onClick={() => setMore(!more)}>
                <span aria-hidden="true" className="relative block h-6">
                  {empty.slice(0, 3).map((r, i) => (
                    <span key={r.coin.symbol} className="absolute top-0 rounded-full" style={{ left: i * 10, zIndex: 3 - i, boxShadow: "0 0 0 2px var(--grouped)" }}>
                      <CoinLogo symbol={r.coin.symbol} size={24} />
                    </span>
                  ))}
                </span>
                <span className="t-body2 c-2">{more ? "Свернуть монеты без остатка" : `Ещё ${plural(empty.length, "монета", "монеты", "монет")} без остатка`}</span>
                <IconChevronDown size={18} className="c-2 transition-transform duration-200" style={{ transform: more ? "rotate(180deg)" : undefined }} />
              </button>
            ) : null}
          </div>
          <p className="t-body3 c-2 px-1 pt-1">Монеты тестовые. Оценка по ценам основных сетей, снимок от {SNAPSHOT_LABEL}.</p>
        </section>
      </div>

      <nav aria-label="Разделы" className="ck-tabbar tabbar">
        <button type="button" aria-current="page">
          <IconWallet size={28} filled />
          <span className="t-label3">Главная</span>
        </button>
        {(
          [
            ["Обмен", IconSwap],
            ["Рынок", IconMarket],
            ["История", IconHistory],
          ] as const
        ).map(([name, Icon]) => (
          <button key={name} type="button" onClick={() => say(`Раздел «${name}» в этот прототип не входит`)}>
            <Icon size={28} />
            <span className="t-label3">{name}</span>
          </button>
        ))}
      </nav>
    </>
  )
}
