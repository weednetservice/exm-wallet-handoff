/**
 * Preview of the wallet's own assets (open /?c=assets-keeper): UI icons at 20/24/28 on both surfaces,
 * the account emblem sketches (waiting for the owner), and the success mark. Everything here is drawn for this project.
 */
import "@fontsource-variable/onest"
import { useState, type ComponentType, type ReactNode } from "react"
import * as I from "@/app/icons"
import { SuccessMark } from "@/app/art/SuccessMark"
import { WalletEmblem, type EmblemVariant } from "@/app/art/WalletEmblem"

const BG = "#10161F"
const CARD = "#1D2633"

type Entry = { name: string; use: string; Icon: ComponentType<I.IconProps>; filled?: boolean }

const ICONS: Entry[] = [
  { name: "IconWallet", use: "вкладка Главная", Icon: I.IconWallet, filled: true },
  { name: "IconSwap", use: "вкладка Обмен, действие", Icon: I.IconSwap, filled: true },
  { name: "IconChart", use: "вкладка Рынок", Icon: I.IconChart, filled: true },
  { name: "IconHistory", use: "вкладка История", Icon: I.IconHistory, filled: true },
  { name: "IconSend", use: "Отправить", Icon: I.IconSend },
  { name: "IconReceive", use: "Получить", Icon: I.IconReceive },
  { name: "IconBack", use: "назад", Icon: I.IconBack },
  { name: "IconClose", use: "закрыть лист", Icon: I.IconClose },
  { name: "IconChevron", use: "строка, выбор (dir)", Icon: I.IconChevron },
  { name: "IconCopy", use: "скопировать адрес", Icon: I.IconCopy },
  { name: "IconShare", use: "поделиться", Icon: I.IconShare },
  { name: "IconPaste", use: "вставить адрес", Icon: I.IconPaste },
  { name: "IconSettings", use: "настройки", Icon: I.IconSettings },
  { name: "IconCheck", use: "готово, выбрано", Icon: I.IconCheck },
  { name: "IconWarning", use: "предупреждение", Icon: I.IconWarning },
  { name: "IconPending", use: "в обработке", Icon: I.IconPending },
  { name: "IconExternal", use: "открыть в обозревателе", Icon: I.IconExternal },
  { name: "IconEye", use: "показать баланс", Icon: I.IconEye },
  { name: "IconEyeOff", use: "скрыть баланс", Icon: I.IconEyeOff },
]

const TABS = [
  { id: "home", label: "Главная", Icon: I.IconWallet },
  { id: "swap", label: "Обмен", Icon: I.IconSwap },
  { id: "market", label: "Рынок", Icon: I.IconChart },
  { id: "history", label: "История", Icon: I.IconHistory },
]

const btn =
  "cursor-pointer rounded-[12px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#3C95FA] transition-colors"

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-[20px] leading-[28px] font-semibold">{title}</h2>
      {note ? <p className="mt-1 max-w-[640px] text-[14px] leading-5 text-[#8994A3]">{note}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Sizes({ Icon, filled, surface }: { Icon: ComponentType<I.IconProps>; filled?: boolean; surface: string }) {
  return (
    <div className="flex h-12 items-center gap-4 rounded-[12px] px-3" style={{ background: surface }}>
      {[20, 24, 28].map((s) => (
        <Icon key={s} size={s} filled={filled} />
      ))}
    </div>
  )
}

function IconRow({ e }: { e: Entry }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[rgba(194,218,255,.08)] py-3">
      <div className="w-full sm:w-[200px]">
        <div className="text-[14px] leading-5 font-medium">{e.name}</div>
        <div className="text-[12px] leading-4 text-[#8994A3]">{e.use}</div>
      </div>
      <Sizes Icon={e.Icon} surface={BG} />
      <Sizes Icon={e.Icon} surface={CARD} />
      {e.filled ? (
        <>
          <Sizes Icon={e.Icon} filled surface={BG} />
          <span className="text-[12px] leading-4 text-[#8994A3]">filled</span>
        </>
      ) : null}
    </li>
  )
}

function TabBar() {
  const [active, setActive] = useState("home")
  return (
    <nav aria-label="Пример нижней панели" className="mx-auto grid max-w-[390px] grid-cols-4 border-t border-[rgba(194,218,255,.08)] bg-[rgba(16,22,31,.96)] pt-2 pb-3">
      {TABS.map(({ id, label, Icon }) => {
        const on = id === active
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => setActive(id)}
            className={`${btn} flex min-h-[52px] flex-col items-center justify-center gap-0.5 ${on ? "text-[#3C95FA]" : "text-[#8994A3] hover:text-white active:text-white/70"}`}
          >
            <Icon size={28} filled={on} />
            <span className="text-[12px] leading-4 font-medium">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

const SKETCHES: { variant: EmblemVariant; title: string; note: string }[] = [
  { variant: "glyph", title: "Эскиз 1: значок кошелька", note: "цветом текста, без круга, как у Keeper" },
  { variant: "badge", title: "Эскиз 2: значок в круге", note: "белый значок на приглушённом тоне, тон по номеру счёта" },
  { variant: "monogram", title: "Эскиз 3: монограмма", note: "первая буква имени, тот же тон по номеру счёта" },
]
const ACCOUNTS = ["Кошелёк", "Сбережения", "Тест", "Обмены"]

function Emblems() {
  return (
    <div className="flex flex-col gap-6">
      {SKETCHES.map(({ variant, title, note }) => (
        <div key={variant} className="flex flex-col gap-3">
          <div>
            <div className="text-[16px] leading-6 font-medium">{title}</div>
            <div className="text-[14px] leading-5 text-[#8994A3]">{note}</div>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            {[24, 32, 40, 64].map((s) => (
              <WalletEmblem key={s} variant={variant} name={ACCOUNTS[0]} size={s} />
            ))}
            {ACCOUNTS.map((name, i) => (
              <span key={name} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#2E3847] pr-4 pl-2 text-[16px] font-medium">
                <WalletEmblem variant={variant} name={name} index={i} size={24} />
                {name}
                <I.IconChevron dir="down" size={16} className="text-[#8994A3]" />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Success() {
  const [run, setRun] = useState(0)
  return (
    <div className="flex flex-col items-center gap-4">
      <SuccessMark key={run} play={run > 0} />
      <button type="button" onClick={() => setRun((n) => n + 1)} className={`${btn} min-h-11 bg-[#2E3847] px-4 text-[14px] font-medium hover:bg-[#384457] active:bg-[#2E3847]`}>
        Проиграть ещё раз
      </button>
    </div>
  )
}

export default function AssetsKeeper() {
  return (
    <div className="min-h-screen w-full text-white" style={{ background: BG, fontFamily: '"Onest Variable", system-ui, sans-serif' }}>
      <main className="mx-auto max-w-[1040px] px-4 py-10 sm:px-8">
        <h1 className="text-[32px] leading-10 font-semibold">Ассеты кошелька</h1>
        <p className="mt-2 max-w-[640px] text-[16px] leading-6 text-[#8994A3]">
          Нарисованы для этого проекта в языке Keeper: сетка 28, линия 2, скругления 4, стрелки под 90°.
        </p>

        <Section title="Нижняя панель" note="Нажмите вкладку: активная становится синей и заливается.">
          <TabBar />
        </Section>

        <Section title="Иконки" note="Каждая в 20, 24 и 28 px на фоне страницы и на карточке; у вкладок ещё заливка.">
          <ul className="flex flex-col">
            {ICONS.map((e) => (
              <IconRow key={e.name} e={e} />
            ))}
          </ul>
        </Section>

        <Section title="Эмблема счёта: выбор владельца" note="Вместо случайного аватара в пилюле счёта. Временно, пока не выбран один из трёх эскизов. Размеры 24, 32, 40, 64 и в пилюле.">
          <Emblems />
        </Section>

        <Section title="Отметка успеха" note="После отправки и обмена: один раз проигрывается, при «уменьшить движение» сразу в конечном виде.">
          <div className="flex flex-wrap items-end gap-10">
            <figure className="flex flex-col items-center gap-3">
              <Success />
              <figcaption className="text-[14px] text-[#8994A3]">SuccessMark</figcaption>
            </figure>
          </div>
        </Section>

      </main>
    </div>
  )
}
