/**
 * Прогнозы: Polymarket's busiest open crypto markets, view only. Each row: the question as published
 * (English), the chance of its first answer ("Да", "Вверх"), 24 h volume and when the market closes;
 * a row opens the market in a sheet. Rows are ordered by the 24 h volume they show.
 */
import { useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { getMarkets, type PredictionMarket } from "@/lib/api/polymarket"
import { Group, Skeleton } from "../ui"
import { LoadError, TextButton } from "../market/states"
import { formatClock, formatUsdCompact } from "../market/format"
import { MarketSheet } from "../predictions/MarketSheet"
import { closingText, formatChance, headlineIndex, outcomeIsEnglish, outcomeName } from "../predictions/util"

/** kept while App.tsx still registers a Прогнозы tab; the wallet now shows the section inside Рынок */
export function PredictionsScreen() {
  return (
    <div className="mx-auto w-full max-w-[480px] px-4 pt-[max(16px,env(safe-area-inset-top))] pb-36">
      <header className="pt-10 pb-5">
        <h1 className="t-large-title">Прогнозы</h1>
      </header>
      <PredictionsSection />
    </div>
  )
}

/** the "Прогнозы" section of Рынок: no title of its own, the screen's "Рынок" is the one title */
export function PredictionsSection() {
  const markets = useQuery({
    queryKey: ["polymarket", "crypto"],
    queryFn: ({ signal }) => getMarkets("crypto", 12, signal),
    refetchInterval: 60_000,
    staleTime: 50_000,
  })
  // the sheet keeps the market it opened with while it slides away; live odds win while it is open
  const [picked, setPicked] = useState<PredictionMarket | null>(null)
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement | null>(null)
  const shown = picked ? (markets.data?.find((m) => m.id === picked.id) ?? picked) : null
  // Gamma orders by the event's volume, the row shows the market's: sort by the number people see
  const list = useMemo(() => (markets.data ? [...markets.data].sort((a, b) => b.volume24h - a.volume24h) : undefined), [markets.data])

  return (
    <div className="flex flex-col gap-5">
      <p className="t-subhead c-2 px-1">
        Самые активные рынки Polymarket о криптовалютах. Только просмотр: ставки делают на Polymarket в основной сети реальными деньгами,
        кошелёк их не делает.
      </p>

      <Group
        footer={
          markets.data?.length
            ? `Шанс это последняя цена доли этого ответа на Polymarket. По объёму торгов за сутки, обновлено в ${formatClock(markets.dataUpdatedAt).slice(0, 5)}, раз в минуту.`
            : undefined
        }
      >
        {list ? (
          list.length ? (
            list.map((m) => (
              <MarketRow
                key={m.id}
                market={m}
                onOpen={(el) => {
                  opener.current = el
                  setPicked(m)
                  setOpen(true)
                }}
              />
            ))
          ) : (
            <div className="flex flex-col items-start gap-3 px-4 py-4">
              <p className="t-subhead c-2">
                Polymarket сейчас не показывает открытых рынков о криптовалютах. Обычно новые появляются в течение дня.
              </p>
              <TextButton onClick={() => markets.refetch()}>Проверить снова</TextButton>
            </div>
          )
        ) : markets.isError ? (
          <LoadError message={`Рынки не загрузились. ${(markets.error as Error).message}`} onRetry={() => markets.refetch()} />
        ) : (
          [0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3" aria-hidden="true">
              <span className="flex flex-1 flex-col gap-2 pt-0.5">
                <Skeleton className="h-[18px] w-full" />
                <Skeleton className="h-[18px] w-3/5" />
                <Skeleton className="h-3.5 w-2/5" />
              </span>
              <span className="flex flex-col items-end gap-1.5">
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-3.5 w-8" />
              </span>
            </div>
          ))
        )}
        {markets.isPending ? <span className="sr-only">Рынки загружаются</span> : null}
      </Group>

      <MarketSheet
        market={shown}
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          // vaul returns focus to the trigger only when it opened the sheet itself
          if (!o) requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }))
        }}
      />
    </div>
  )
}

function MarketRow({ market, onOpen }: { market: PredictionMarket; onOpen: (el: HTMLButtonElement) => void }) {
  const lead = market.outcomes[headlineIndex(market)]
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors first:rounded-t-[var(--radius-group)] last:rounded-b-[var(--radius-group)] hover:bg-white/5 focus-visible:outline-offset-[-3px] active:bg-white/10"
    >
      <span className="min-w-0 flex-1">
        <span lang="en" className="t-headline block break-words">
          {market.question}
        </span>
        {/* each fact stays whole; a narrow row breaks only at the separator */}
        <span className="t-footnote c-2 mt-1 block">
          <span className="whitespace-nowrap">{formatUsdCompact(market.volume24h)} за сутки</span> ·{" "}
          <span className="whitespace-nowrap">{closingText(market.endDate)}</span>
        </span>
      </span>
      {lead ? (
        <span className="flex shrink-0 flex-col items-end pt-0.5">
          <span className="t-title3 tabular-nums">{formatChance(lead.price)}</span>
          <span className="t-footnote c-2 whitespace-nowrap">
            шанс «<span lang={outcomeIsEnglish(lead) ? "en" : undefined}>{outcomeName(lead)}</span>»
          </span>
        </span>
      ) : null}
    </button>
  )
}
