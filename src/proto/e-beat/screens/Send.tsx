/**
 * Отправка: the confirmation and the wait. The wait is the heart of direction E: it moves in the rhythm
 * of the network's real blocks instead of a spinner.
 *
 * What is real and what is not: every beat, block number and duration on these screens is real
 * (clock.ts). The transfer itself is not sent: the prototype has no keys. After the swipe the operation
 * is counted as taken by the first real block that arrives at least 600 ms later (a transfer needs that
 * long to reach a block producer), so the wait is as long as that network really makes you wait.
 */
import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { IconCheck, IconChevronRight, IconClose, IconPending, IconWarning } from "@/app/glyph"
import { ConfirmSwipe, IconButton, Notice, PrimaryButton, Row, Screen, ScreenHeader, SecondaryButton, Skeleton } from "@/app/ui"
import { shortAddress } from "@/lib/format"
import { Amount, group, priceText, Ticker } from "../amount"
import { BeatStrip } from "../BeatStrip"
import { useClock, type ClockState } from "../clock"
import { feeOf, type WalletData } from "../data"
import type { Op } from "../index"
import { netById, stepOf, type Net } from "../networks"
import { beatsText, ClockLine, CoinMark, NetMark, NetworkSheet, spanText, tempoLine, useSeconds } from "../parts"

/** the prototype always sends 0,001 of the network's coin */
export const sendUnits = (net: Net) => 10n ** BigInt(net.decimals - 3)

type Fee = { state: "loading" } | { state: "ok"; units: bigint | null } | { state: "failed" }

export function SendScreen({
  netId,
  wallet,
  op,
  onNet,
  onSent,
  onAgain,
  onClose,
}: {
  netId: string
  wallet: WalletData
  op: Op | null
  onNet: (netId: string) => void
  onSent: (op: Op) => void
  onAgain: () => void
  onClose: () => void
}) {
  const net = netById(op?.netId ?? netId)
  const tempo = wallet.tempo[net.id]
  // after the block took the operation nothing is listened to: the strip stands on the beats it had
  const clock = useClock(op?.hit ? null : net.id, tempo)
  return op ? (
    <Waiting key={op.sentAt} net={net} tempo={tempo} op={op} clock={clock} wallet={wallet} onAgain={onAgain} onClose={onClose} />
  ) : (
    <Confirm net={net} tempo={tempo} clock={clock} wallet={wallet} onNet={onNet} onSent={onSent} onClose={onClose} />
  )
}

function Hero({ net, title, sub }: { net: Net; title: React.ReactNode; sub: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-3 pt-2 pb-6 text-center">
      <CoinMark symbol={net.symbol} net={net} size={64} ring="var(--bg)" />
      <div className="flex flex-col items-center gap-0.5">
        <h1 className="t-h2">{title}</h1>
        <p className="t-body2 c-2">{sub}</p>
      </div>
    </section>
  )
}

/** the prototype sends to the demo wallet's own address; Bitcoin has none in the demo set */
function Recipient({ net }: { net: Net }) {
  return (
    <>
      себе{net.address ? <>, <span className="mono">{shortAddress(net.address, 6, 4)}</span></> : null}
    </>
  )
}

function Confirm({ net, tempo, clock, wallet, onNet, onSent, onClose }: { net: Net; tempo: number | undefined; clock: ClockState; wallet: WalletData; onNet: (id: string) => void; onSent: (op: Op) => void; onClose: () => void }) {
  const [pick, setPick] = useState(false)
  const [fee, setFee] = useState<Fee>({ state: "loading" })
  const [feeTry, setFeeTry] = useState(0)
  useEffect(() => {
    let live = true
    setFee({ state: "loading" })
    feeOf(net).then(
      (units) => live && setFee({ state: "ok", units }),
      () => live && setFee({ state: "failed" }),
    )
    return () => {
      live = false
    }
  }, [net, feeTry])

  const units = sendUnits(net)
  const price = wallet.prices[net.cg]
  const ready = clock.height !== undefined && clock.status !== "offline"
  return (
    <Screen className="min-h-[calc(100svh-var(--eb-nav,0px))] pb-[max(16px,env(safe-area-inset-bottom))]">
      <ScreenHeader title="Отправка" onBack={onClose} />
      <Hero net={net} title={<Amount units={units} decimals={net.decimals} unit={net.symbol} />} sub={price ? `≈ ${priceText((Number(units) / 10 ** net.decimals) * price.usd)}` : "Подтвердите перевод"} />

      <div className="flex flex-1 flex-col gap-4">
        <div className="card list overflow-hidden">
          <Row label="Получатель">
            <Recipient net={net} />
          </Row>
          {/* the network row: the one place on this screen that lives, so you feel the network before you send */}
          <button type="button" onClick={() => setPick(true)} aria-label={`Сеть: ${net.name}. Сменить`} className="flex min-h-[76px] w-full flex-col justify-center gap-1 py-3 pr-2 pl-4 text-left">
            <span className="flex w-full items-center gap-2">
              <span className="t-body2 c-2 flex-1">Сеть</span>
              <NetMark net={net} size={20} />
              <span className="t-label2">{net.name}</span>
              <IconChevronRight size={18} className="c-2 shrink-0" />
            </span>
            <span className="t-body2 c-2 truncate pb-1.5">
              <ClockLine net={net} clock={clock} tempo={tempo} />
            </span>
            <BeatStrip key={net.id} style={{ left: 16 }} size="row" head={clock.height} step={stepOf(tempo)} tempo={tempo} />
          </button>
          <Row label="Комиссия сети">
            {fee.state === "loading" ? (
              <Skeleton className="w-28" />
            ) : fee.state === "failed" ? (
              <button type="button" onClick={() => setFeeTry((n) => n + 1)} className="min-h-11 text-[var(--blue)]">
                Не загрузилась. Повторить
              </button>
            ) : fee.units === null ? (
              "считается при подписи"
            ) : (
              <FeeAmount units={fee.units} net={net} />
            )}
          </Row>
        </div>
        <Notice tone="info">Прототип: перевод не уходит в сеть. Блоки на экране настоящие, и ждать придётся столько, сколько ждёт эта сеть.</Notice>
      </div>

      <div className="pt-4">
        {ready ? (
          <ConfirmSwipe
            label="Проведите, чтобы отправить"
            doneLabel="Отправлено"
            errorLabel="Не получилось отправить"
            onConfirm={async () => {}}
            onDone={() => onSent({ netId: net.id, units, fee: fee.state === "ok" ? fee.units : undefined, sentAt: Date.now(), sentHeight: clock.height! })}
          />
        ) : (
          <SecondaryButton disabled>{clock.status === "offline" ? "Сеть недоступна" : "Соединяемся с сетью…"}</SecondaryButton>
        )}
      </div>

      <NetworkSheet
        open={pick}
        onOpenChange={setPick}
        title="Сеть перевода"
        subtitle="От быстрых к медленным"
        tempo={wallet.tempo}
        current={net.id}
        onPick={(n) => {
          setPick(false)
          onNet(n.id)
        }}
      />
    </Screen>
  )
}

/** a fee below a millionth of a coin is said so: twelve zeros in a row inform nobody (Sepolia's gas costs 21 wei) */
function FeeAmount({ units, net }: { units: bigint; net: Net }) {
  const floor = 10n ** BigInt(net.decimals - 6)
  return units < floor ? (
    <>
      меньше <Amount units={floor} decimals={net.decimals} unit={net.symbol} />
    </>
  ) : (
    <>
      ≈ <Amount units={units} decimals={net.decimals} sig={3} unit={net.symbol} />
    </>
  )
}

function Waiting({ net, tempo, op, clock, wallet, onAgain, onClose }: { net: Net; tempo: number | undefined; op: Op; clock: ClockState; wallet: WalletData; onAgain: () => void; onClose: () => void }) {
  const done = !!op.hit
  const slow = tempo === undefined || tempo >= 3
  const now = useSeconds(!done && (slow || clock.status !== "live"))
  const head = op.hit?.height ?? clock.height ?? op.sentHeight
  const passed = Math.max(0, head - op.sentHeight)
  const price = wallet.prices[net.cg]
  const trouble = !done && (clock.status === "silent" || clock.status === "offline")
  const amount = <Amount units={op.units} decimals={net.decimals} unit={net.symbol} />

  return (
    <Screen className="min-h-[calc(100svh-var(--eb-nav,0px))] pb-[max(16px,env(safe-area-inset-bottom))]">
      <ScreenHeader
        right={
          <IconButton label={done ? "Закрыть" : "Свернуть: перевод останется на главной"} onClick={onClose} className="-mr-2">
            <IconClose size={24} />
          </IconButton>
        }
      />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className="flex flex-1 flex-col">
        <Hero
          net={net}
          title={
            <>
              <span key={done ? "done" : "wait"} className="eb-word">
                {done ? "Отправлено" : "Отправляем"}
              </span>{"\u00a0"}
              {amount}
            </>
          }
          sub={`${net.name}${price ? ` · ≈ ${priceText((Number(op.units) / 10 ** net.decimals) * price.usd)}` : ""}`}
        />

        <div className="card flex flex-col px-4 pt-4 pb-3.5">
          <div className="flex items-center justify-between gap-3">
            <p role="status" key={done ? "done" : trouble ? clock.status : "wait"} className="eb-word t-label1">
              {done ? (
                <>
                  <IconCheck size={20} className="text-[var(--green)]" />
                  <span className="text-[var(--green)]">В блоке {group(String(op.hit!.height))}</span>
                </>
              ) : clock.status === "offline" ? (
                <>
                  <IconWarning size={20} className="text-[var(--orange)]" />
                  <span className="text-[var(--orange)]">Узел сети не отвечает</span>
                </>
              ) : clock.status === "silent" ? (
                <>
                  <IconWarning size={20} className="text-[var(--orange)]" />
                  <span className="text-[var(--orange)]">Сеть молчит {Math.round((now - (clock.lastAt ?? now)) / 1000)} с</span>
                </>
              ) : (
                <>
                  <IconPending size={20} className="text-[var(--blue)]" />
                  <span>Ждёт {net.unit === "слот" ? "слот" : "блок"}</span>
                </>
              )}
            </p>
            <p className="t-body2 c-2 shrink-0">{tempoLine(net, tempo)}</p>
          </div>

          <BeatStrip className="mt-4 border-b border-[var(--separator)]" head={head} step={stepOf(tempo)} tempo={tempo} sentHeight={op.sentHeight} hit={op.hit?.height} slot={!done} />

          <div className="t-body2 c-2 flex items-center justify-between gap-3 pt-3">
            <p>
              {done ? (
                <>С блока {group(String(op.sentHeight))}</>
              ) : (
                <>
                  {net.unit === "слот" ? "Слот" : "Блок"} <Ticker value={head} slide={tempo === undefined || tempo >= 0.95} />
                </>
              )}
            </p>
            <p className="text-right text-[var(--label)]">
              {done ? `${beatsText(passed, net.unit)} · ${spanText(op.hit!.at - op.sentAt)}` : `С отправки: ${beatsText(passed, net.unit)}${slow ? ` · ${spanText(now - op.sentAt)}` : ""}`}
            </p>
          </div>
        </div>

        <p className="t-body2 c-2 px-1 pt-3">
          {done
            ? "Полоса остановилась на блоке с переводом: зелёная черта. Синяя точка отмечает момент отправки."
            : trouble
              ? "Тестовые сети иногда встают. Перевод не потерян: он попадёт в первый же новый блок. Экран можно свернуть."
              : net.family === "bitcoin"
                ? "В основной сети Bitcoin блок выходит в среднем раз в 10 минут, testnet4 идёт неровно: то несколько блоков подряд, то долгая пауза. Экран можно свернуть, перевод останется на главной."
                : `Каждая черта: настоящий ${net.unit} сети ${net.name}. Перевод попадёт в один из ближайших.`}
        </p>

        <div className="card list mt-4 overflow-hidden">
          <Row label="Получатель">
            <Recipient net={net} />
          </Row>
          {op.fee !== undefined ? <Row label="Комиссия сети">{op.fee === null ? "считается при подписи" : <FeeAmount units={op.fee} net={net} />}</Row> : null}
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-6">
          {done ? (
            <>
              <PrimaryButton onClick={onClose}>Готово</PrimaryButton>
              <SecondaryButton onClick={onAgain}>Отправить ещё раз</SecondaryButton>
            </>
          ) : (
            <SecondaryButton onClick={onClose}>Свернуть</SecondaryButton>
          )}
        </div>
      </motion.div>
    </Screen>
  )
}
