/**
 * Отправка: сеть (4 ключа, у EVM веер), получатель, сумма → подтверждение → ожидание и готово.
 * Демо-кошелёк только смотрит: в сеть ничего не уходит, ожидание имитируется (об этом сказано в полосе прототипа).
 */
import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { IconBack, IconPaste, IconWarning, SuccessArt } from "@/app/glyph"
import { ConfirmSwipe, IconButton, PrimaryButton } from "@/app/ui"
import { toUnits } from "@/lib/format"
import { CoinLogo, NetLogo } from "./logos"
import { balanceOf, coinParts, EVM_NETS, FAMILY_NAME, familyOf, feeOf, fiatParts, keyById, netById, partsText, plural, toNumber, type KeyId, type Net } from "./model"
import { Address, Amount, EASE, KeyRing } from "./parts"
import { PRICE, SNAPSHOT_LABEL } from "./snapshot"
import type { Go } from "./index"

type Step = "form" | "confirm" | "status"
/** сколько длится имитация ожидания сети */
export const FAKE_WAIT_MS = 2600

export function Send({ initialNet, go, say, onStep }: { initialNet: string; go: Go; say: (text: string) => void; onStep: (step: Step) => void }) {
  const [netId, setNetId] = useState(initialNet)
  const [to, setTo] = useState("")
  const [raw, setRaw] = useState("")
  const [step, setStepState] = useState<Step>("form")
  const [done, setDone] = useState(false)
  const net = netById(netId)
  const key = keyById(net.key)
  const setStep = (s: Step) => {
    setStepState(s)
    onStep(s)
  }

  const balance = balanceOf(net)
  const fee = feeOf(net)
  const family = to.trim() ? familyOf(to) : undefined
  const addressOk = family === net.key
  let amount: bigint | undefined
  let amountError = ""
  if (raw.trim()) {
    try {
      amount = toUnits(raw, net.decimals)
      if (amount === 0n) amountError = "Сумма должна быть больше нуля"
      else if (balance !== undefined && amount + (fee ?? 0n) > balance) amountError = `Не хватает: в сети ${net.full} ${partsText(coinParts(balance, net.decimals), net.symbol)}`
    } catch (e) {
      amountError = (e as Error).message
    }
  }
  const ready = addressOk && amount !== undefined && !amountError && balance !== undefined

  useEffect(() => {
    if (step !== "status") return
    setDone(false)
    const t = setTimeout(() => setDone(true), FAKE_WAIT_MS)
    return () => clearTimeout(t)
  }, [step])

  const pickKey = (k: KeyId) => {
    if (k === net.key) return
    setNetId(keyById(k).nets[0].id)
  }
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) setTo(text.trim())
      else say("В буфере обмена пусто")
    } catch {
      say("Браузер не дал прочитать буфер: вставьте адрес в поле")
    }
  }

  if (step === "form") {
    return (
      <>
        <div className="ck-scroll pb-[96px]">
          <header className="grid min-h-14 grid-cols-[48px_1fr_48px] items-center">
            <IconButton label="Назад" onClick={() => go({ screen: "home" })} className="-ml-2">
              <IconBack size={24} />
            </IconButton>
            <h1 className="t-h3 text-center">Отправить</h1>
          </header>

          <h2 className="t-label2 c-2 flex min-h-8 items-center px-1">Откуда</h2>
          <KeyRing
            label="Ключ и сеть перевода"
            selected={net.key}
            net={netId}
            caption={`Адрес один, сеть выбираете вы: ${net.full}`}
            onKey={pickKey}
            onNet={setNetId}
          />

          <label htmlFor="ck-to" className="t-label2 c-2 flex min-h-8 items-center px-1 pt-3">
            Адрес получателя
          </label>
          <div className="ck-field" data-bad={family !== undefined && !addressOk}>
            <input
              id="ck-to"
              className="mono text-[14px]"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={`Адрес ${FAMILY_NAME[net.key]}`}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby="ck-to-note"
              aria-invalid={family !== undefined && !addressOk}
            />
            <IconButton label="Вставить из буфера" onClick={paste}>
              <IconPaste size={22} />
            </IconButton>
          </div>
          <div id="ck-to-note" className="min-h-[56px] px-1 pt-2" aria-live="polite">
            {family === undefined ? null : addressOk ? (
              <Address value={to.trim()} settle />
            ) : (
              <p className="t-body2 flex items-start gap-2 text-[var(--red)]">
                <IconWarning size={20} className="shrink-0" />
                {family ? `Это адрес ${FAMILY_NAME[family]}. В сеть ${net.full} перевод по нему не дойдёт.` : "Не похоже на адрес. Проверьте, что он вставлен целиком."}
              </p>
            )}
          </div>

          <label htmlFor="ck-sum" className="t-label2 c-2 flex min-h-8 items-center px-1">
            Сумма
          </label>
          <div className="ck-field pr-4" data-bad={!!amountError}>
            <input id="ck-sum" className="t-label1" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="0" autoComplete="off" aria-describedby="ck-sum-note" aria-invalid={!!amountError} />
            <span className="t-label1 c-2">{net.symbol}</span>
          </div>
          <p id="ck-sum-note" className={`t-body2 min-h-5 px-1 pt-2 ${amountError ? "text-[var(--red)]" : "c-2"}`} aria-live="polite">
            {amountError || (balance === undefined ? "В демо-кошельке нет адреса Bitcoin: отправлять нечего" : `Доступно ${partsText(coinParts(balance, net.decimals), net.symbol)}`)}
          </p>
        </div>
        <div className="ck-foot">
          <PrimaryButton disabled={!ready} onClick={() => setStep("confirm")}>
            Проверить перевод
          </PrimaryButton>
        </div>
      </>
    )
  }

  const sum = coinParts(amount!, net.decimals, 6)
  const fiat = fiatParts(toNumber(amount!, net.decimals) * PRICE[net.symbol])
  const waiting = step === "status" && !done

  return (
    <>
      <div className="ck-scroll pb-[112px]">
        <header className="grid min-h-14 grid-cols-[48px_1fr_48px] items-center">
          {step === "confirm" ? (
            <IconButton label="Назад к вводу" onClick={() => setStep("form")} className="-ml-2">
              <IconBack size={24} />
            </IconButton>
          ) : (
            <span />
          )}
          <h1 className="t-h3 text-center" aria-live="polite">
            {step === "confirm" ? "Проверьте перевод" : waiting ? "Отправляем" : "Отправлено"}
          </h1>
        </header>

        <section className="flex flex-col items-center gap-1 pt-2 pb-6 text-center">
          <div className="relative grid size-24 place-items-center">
            <AnimatePresence initial={false} mode="popLayout">
              {step === "confirm" ? (
                <motion.span key="coin" exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.16 }}>
                  <CoinLogo symbol={net.symbol} size={72} />
                </motion.span>
              ) : waiting ? (
                <motion.span key="wait" role="img" aria-label="Перевод в пути" className="ck-spinner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.16 }} />
              ) : (
                <motion.span key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
                  <SuccessArt label="Готово" />
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <p className="t-h1 pt-3">
            <Amount parts={sum} unit={net.symbol} />
          </p>
          <Amount parts={fiat} unit="$" className="t-body1 c-2" />
        </section>

        <div className="card list">
          <div className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-3">
            <span className="t-body2 c-2">Сеть</span>
            <span className="t-label2 flex items-center gap-2">
              <NetLogo id={net.id} size={24} />
              {net.full}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 px-4 py-3.5">
            <span className="t-body2 c-2">Получатель</span>
            <Address value={to.trim()} settle={step === "confirm"} />
          </div>
          <div className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-3">
            <span className="t-body2 c-2">Комиссия сети</span>
            {fee === undefined ? <span className="t-label2 c-2">в снимке нет</span> : <Amount parts={coinParts(fee, net.decimals, 6)} unit={net.symbol} className="t-label2" />}
          </div>
          {step === "status" ? (
            <div className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-3">
              <span className="t-body2 c-2">Статус</span>
              <span className="t-label2" aria-live="polite">
                {waiting ? "Ждём подтверждения сети" : "Подтверждено сетью"}
              </span>
            </div>
          ) : null}
        </div>
        <p className="t-body3 c-2 px-1 pt-2">
          {fee === undefined ? "Комиссию этой сети снимок не содержит." : net.key === "evm" ? `Комиссия: оценка для простого перевода по цене газа на ${SNAPSHOT_LABEL}.` : "Комиссия: базовая плата сети Solana за одну подпись."}
          {key.id === "evm" ? ` Получатель увидит монеты только в сети ${net.full}, хотя его адрес один на ${plural(EVM_NETS.length, "сеть", "сети", "сетей")}.` : ""}
        </p>
      </div>

      <div className="ck-foot">
        {step === "confirm" ? (
          <ConfirmSwipe label="Проведите, чтобы отправить" doneLabel="Отправляем" errorLabel="Не отправилось" onConfirm={() => new Promise((r) => setTimeout(r, 350))} onDone={() => setTimeout(() => setStep("status"), 450)} />
        ) : (
          <motion.div initial={false} animate={{ opacity: waiting ? 0 : 1 }} transition={{ duration: 0.2, ease: EASE }} inert={waiting}>
            <PrimaryButton onClick={() => go({ screen: "home" })}>Готово</PrimaryButton>
          </motion.div>
        )}
      </div>
    </>
  )
}

export type { Step as SendStep, Net as SendNet }
