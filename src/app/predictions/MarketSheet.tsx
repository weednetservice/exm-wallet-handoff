/**
 * One Polymarket market in a sheet: every outcome as a probability bar, the leading outcome's price
 * history, a payout calculator at the real price, and the way out to Polymarket. View only: the
 * wallet places no bets.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { IconExternal } from "../glyph"
import { getPriceHistory, type PredictionMarket } from "@/lib/api/polymarket"
import { Group, Sheet, Skeleton } from "../ui"
import { LoadError } from "../market/states"
import { PriceChart } from "../market/PriceChart"
import { Segmented } from "../market/Segmented"
import { formatUsdCompact } from "../market/format"
import { closingDate, formatChanceExact, headlineIndex, outcomeIsEnglish, outcomeName } from "./util"

type Interval = "1d" | "1w" | "1m" | "max"
const INTERVALS: { value: Interval; label: string }[] = [
  { value: "1d", label: "День" },
  { value: "1w", label: "Неделя" },
  { value: "1m", label: "Месяц" },
  { value: "max", label: "Всё" },
]
const SPAN: Record<Interval, string> = { "1d": "за день", "1w": "за неделю", "1m": "за месяц", max: "за всё время" }

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", o)
const TICK: Record<Interval, Intl.DateTimeFormat> = {
  "1d": fmt({ hour: "2-digit", minute: "2-digit" }),
  "1w": fmt({ day: "numeric", month: "short" }),
  "1m": fmt({ day: "numeric", month: "short" }),
  max: fmt({ month: "2-digit", year: "2-digit" }),
}
const POINT_TIME = fmt({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const POINT_DAY = fmt({ day: "numeric", month: "short", year: "numeric" })

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shares = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 })
const cents = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const GRID = [
  { value: 0, label: "0 %" },
  { value: 0.5, label: "50 %" },
  { value: 1, label: "100 %" },
]

/** filled action on the sheet: white text 4.7:1 (see the link below) */
const ACTION_BLUE = "#0071e3"

/** systemRed with Increase Contrast (dark): 4.9:1 on the #2c2c2e group, where #ff453a gives 4.1:1 */
const ERROR_RED = "#ff6961"

/** groups inside a sheet sit one step lighter than the sheet (iOS elevated grouped colours) */
const SHEET_SURFACES = { "--grouped": "var(--elevated-2)" } as CSSProperties

export function MarketSheet({
  market,
  open,
  onOpenChange,
}: {
  market: PredictionMarket | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Прогноз"
      footer={
        market ? (
          <a
            // the market itself, not only its event page (an event holds 10+ price levels)
            href={market.slug ? `${market.url}/${market.slug}` : market.url}
            target="_blank"
            rel="noopener noreferrer"
            // same shape and type as PrimaryButton; the fill is one step darker than --blue, because
            // white 17 px text on #0a84ff is 3.65:1 and needs 4.5:1 (on #0071e3 it is 4.7:1)
            className="t-headline inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full px-6 text-white transition-[filter,transform] hover:brightness-110 active:scale-[.98]"
            style={{ background: ACTION_BLUE }}
          >
            Открыть на Polymarket
            <IconExternal size={18} />
            <span className="sr-only">(откроется в новой вкладке)</span>
          </a>
        ) : null
      }
    >
      {market ? <SheetBody key={market.id} market={market} /> : null}
    </Sheet>
  )
}

function SheetBody({ market }: { market: PredictionMarket }) {
  const lead = headlineIndex(market)
  const ref = useRef<HTMLDivElement>(null)

  // vaul does not move focus into the drawer (its autoFocus defaults to false), so the dialog's focus
  // trap never engages and Tab walks the page behind the overlay. Start focus on the sheet's close button.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const dialog = ref.current?.closest<HTMLElement>("[role=dialog]")
      if (dialog && !dialog.contains(document.activeElement)) dialog.querySelector<HTMLElement>("button")?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  // Safari reaches buttons with Option+Tab, which Radix's focus trap does not loop (it only handles a
  // bare Tab): wrap from the last control to the first and back, as plain Tab does
  useEffect(() => {
    const dialog = ref.current?.closest<HTMLElement>("[role=dialog]")
    if (!dialog) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !e.altKey) return
      const items = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex="0"]')].filter(
        (el) => !el.hasAttribute("disabled"),
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    }
    dialog.addEventListener("keydown", onKey)
    return () => dialog.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div ref={ref} className="flex flex-col gap-6 pb-2" style={SHEET_SURFACES}>
      <div className="flex flex-col gap-1 px-1">
        {market.event && market.event !== market.question ? (
          <p lang="en" className="t-footnote c-2">
            {market.event}
          </p>
        ) : null}
        <p lang="en" className="t-title3">
          {market.question}
        </p>
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-3 px-1">
        <div>
          <dt className="t-footnote c-2">Объём за сутки</dt>
          <dd className="t-subhead font-semibold tabular-nums">{formatUsdCompact(market.volume24h)}</dd>
        </div>
        <div>
          <dt className="t-footnote c-2">Объём всего</dt>
          <dd className="t-subhead font-semibold tabular-nums">{formatUsdCompact(market.volume)}</dd>
        </div>
        <div>
          <dt className="t-footnote c-2">Закрытие</dt>
          <dd className="t-subhead font-semibold">{closingDate(market.endDate)}</dd>
        </div>
      </dl>

      <Group
        header="Исходы"
        footer="Вероятность это последняя цена доли исхода на Polymarket: доля стоит от 0 до 1 $ и приносит 1 $, если исход сбудется."
      >
        {market.outcomes.map((o, i) => (
          <div key={o.name + i} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="t-headline" lang={outcomeIsEnglish(o) ? "en" : undefined}>
                {outcomeName(o)}
                {i === lead && market.outcomes.length > 2 ? <span className="t-footnote c-2 font-normal"> · лидирует</span> : null}
              </span>
              <span className="t-headline tabular-nums">{formatChanceExact(o.price)}</span>
            </div>
            {/* track one step darker than the row: the bars keep 4.7:1 (blue) and 5.9:1 (grey) against it */}
            <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-[var(--elevated)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(0, Math.min(1, o.price)) * 100}%`, background: i === lead ? "var(--blue)" : "var(--label-2)" }}
              />
            </div>
          </div>
        ))}
      </Group>

      <History market={market} leadIndex={lead} />

      <Calculator market={market} defaultIndex={lead} />

      <p className="t-footnote c-2 px-1">
        Только просмотр. Ставки делают на Polymarket в основной сети реальными деньгами. Кошелёк их не делает и к Polymarket не
        подключается: кнопка ниже просто откроет этот рынок на сайте Polymarket.
      </p>
    </div>
  )
}

function History({ market, leadIndex }: { market: PredictionMarket; leadIndex: number }) {
  const [interval, setSpan] = useState<Interval>("1w")
  const outcome = market.outcomes[leadIndex]
  const tokenId = outcome?.tokenId
  const history = useQuery({
    queryKey: ["pm-history", tokenId, interval],
    queryFn: ({ signal }) => getPriceHistory(tokenId!, interval, signal),
    enabled: !!tokenId,
    staleTime: 60_000,
  })
  // the line ends on the same number as the bar above: today's price joins the history as its last point
  const points = useMemo(() => {
    const out = (history.data ?? []).map((h) => ({ time: h.time, value: h.price }))
    const last = out[out.length - 1]
    if (last && outcome && Number.isFinite(outcome.price) && history.dataUpdatedAt > last.time)
      out.push({ time: history.dataUpdatedAt, value: outcome.price })
    return out
  }, [history.data, history.dataUpdatedAt, outcome])
  const name = outcomeName(outcome)
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="t-title3 px-1">
        История шанса «<span lang={outcomeIsEnglish(outcome) ? "en" : undefined}>{name}</span>»
      </h2>
      {!tokenId ? (
        <p className="t-subhead c-2 px-1">Polymarket не прислал идентификатор этого исхода, поэтому историю цены не загрузить.</p>
      ) : points.length > 1 ? (
        <PriceChart
          points={points}
          label={`Вероятность исхода «${name}» ${SPAN[interval]}`}
          formatValue={formatChanceExact}
          formatTime={(t) => (interval === "max" ? POINT_DAY : POINT_TIME).format(t)}
          formatTick={(t) => TICK[interval].format(t)}
          tone="neutral"
          domain={[0, 1]}
          grid={GRID}
          surface="var(--elevated)"
          height={180}
        />
      ) : history.isPending ? (
        <div className="flex h-[204px] flex-col gap-2" aria-busy="true">
          <Skeleton className="w-full flex-1 rounded-[12px]" />
          <Skeleton className="h-4 w-full" />
          <span className="sr-only">История загружается</span>
        </div>
      ) : history.isError ? (
        <div className="rounded-[var(--radius-group)] bg-[var(--grouped)]">
          <LoadError message={`История не загрузилась. ${(history.error as Error).message}`} onRetry={() => history.refetch()} />
        </div>
      ) : (
        <p className="t-subhead c-2 min-h-[120px] rounded-[var(--radius-group)] bg-[var(--grouped)] px-4 py-4">
          Polymarket не отдал ни одной точки {SPAN[interval]}: по этому исходу ещё не было сделок. Выберите период подлиннее.
        </p>
      )}
      <Segmented label="Период истории" options={INTERVALS} value={interval} onChange={setSpan} />
    </section>
  )
}

/** "12,5" or "12.5" → 12.5; null when it isn't a number */
function parseAmount(raw: string) {
  const clean = raw.trim().replace(/\s/g, "").replace(",", ".")
  if (!clean) return null
  if (!/^\d*\.?\d*$/.test(clean) || clean === ".") return NaN
  return Number(clean)
}

function Calculator({ market, defaultIndex }: { market: PredictionMarket; defaultIndex: number }) {
  const [index, setIndex] = useState(String(defaultIndex))
  const [raw, setRaw] = useState("10")
  const inputId = useId()
  const hintId = useId()
  const outcome = market.outcomes[Number(index)] ?? market.outcomes[defaultIndex]
  const name = outcomeName(outcome)
  const stake = parseAmount(raw)
  const price = outcome.price

  const problem =
    stake === null
      ? "Введите сумму ставки в долларах."
      : Number.isNaN(stake)
        ? "Нужно число, например 10 или 12,5."
        : stake <= 0
          ? "Сумма должна быть больше нуля."
          : !(price > 0)
            ? "Цена этого исхода 0: доли сейчас никто не продаёт, выплату не посчитать."
            : null
  const count = !problem && stake ? stake / price : 0
  const payout = count
  const profit = payout - (stake ?? 0)

  return (
    <Group
      header="Калькулятор выплаты"
      footer="Расчёт по последней цене, без комиссии и проскальзывания. На Polymarket итог зависит от стакана заявок в момент покупки."
    >
      <div className="flex flex-col gap-3 p-4">
        <Segmented
          label="Исход для расчёта"
          options={market.outcomes.map((o, i) => ({ value: String(i), label: outcomeName(o) }))}
          value={index}
          onChange={setIndex}
        />
        <label htmlFor={inputId} className="t-subhead c-2">
          Ставка, $
        </label>
        <input
          id={inputId}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="Например, 10"
          aria-invalid={!!problem && stake !== null}
          aria-describedby={hintId}
          className="t-body min-h-[52px] w-full rounded-[14px] bg-[var(--fill)] px-4 tabular-nums text-[var(--label)] placeholder:text-[rgba(235,235,245,.7)]"
        />
      </div>
      <div id={hintId} aria-live="polite">
        {problem ? (
          <p className="t-subhead px-4 py-3" style={{ color: stake === null ? "var(--label-2)" : ERROR_RED }}>
            {problem}
          </p>
        ) : (
          <dl className="divide-y divide-[var(--separator)]">
            <Row label="Цена доли" value={`${cents.format(price * 100)} ¢`} />
            <Row label="Долей за ставку" value={shares.format(count)} />
            <Row
              label={
                <>
                  Выплата, если «<span lang={outcomeIsEnglish(outcome) ? "en" : undefined}>{name}</span>» сбудется
                </>
              }
              value={money.format(payout)}
              strong
            />
            <Row label="Прибыль" value={(profit > 0 ? "+" : "") + money.format(profit)} />
          </dl>
        )}
      </div>
    </Group>
  )
}

function Row({ label, value, strong }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5">
      <dt className="t-subhead c-2">{label}</dt>
      <dd className={(strong ? "t-headline" : "t-body") + " shrink-0 tabular-nums"}>{value}</dd>
    </div>
  )
}
