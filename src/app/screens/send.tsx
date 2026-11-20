/**
 * Send form and confirmation. EXM signs with
 * its own keys (../vault); the sheet only prepares the transfer and shows what will happen.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { chainData, isBroadcastDisabled, networkLabel, type Network } from "@/lib/chains"
import { formatCoin, formatUsd, fromUnits, shortAddress, toUnits } from "@/lib/format"
import { useSigner } from "../vault"
import { BroadcastUncertainError, type SendResult } from "../vault/signers"
import { recordPendingActivity } from "../history/pending"
import { AddressBookSheet } from "../addressBook/AddressBookSheet"
import { recipientInBook, useAddressBook } from "../addressBook/store"
import { IconChevronDown, IconExternal } from "../glyph"
import { NetworkCoin } from "../marks"
import { ErrorNote, Group, PrimaryButton, Row, SecondaryButton, Sheet } from "../ui"
import { type SheetProps } from "./sheets"
import { TransferRecipientField } from "./TransferRecipientField"
import { TransferAssetCard, TransferFeeCard, TransferHelp, TransferHelpButton, TransferReceipt, TransferReviewAddress, TransferReviewSummary } from "./TransferAssetCard"
import { QrScanControl } from "../QrScanControl"
import { addressForNetwork } from "../qr"
import { useReceiptStatus } from "./useReceiptStatus"
import { guardedTransfer, TransferPreflightCancelledError, TRANSFER_UNCERTAIN_MESSAGE } from "../transfers/guard"
import { TransferRecoveryNotice, useTransferRecovery } from "../transfers/recovery"
import { isInterruptedPreparation } from "../transfers/pending"

export type Sender = {
  /** upper bound of the network fee, in base units */
  fee: (to?: string, amount?: bigint) => Promise<bigint>
  /** shown under the fee when it is only a bound */
  feeNote?: string
  /** smallest amount this recipient can receive, or null; e.g. a brand-new Solana account */
  minFor?: (to: string) => Promise<bigint | null>
  /** signs and broadcasts; the result distinguishes RPC acceptance from chain confirmation */
  send: (to: string, value: bigint, maxNetworkFee?: bigint) => Promise<SendResult>
  placeholder: string
}

type Props = SheetProps & { network: Network; address: string; balance?: bigint; usdPrice?: number; initialRecipient?: string; onChangeAsset?: (recipient?: string) => void; choosingAsset?: boolean }

export function SendUnavailableSheet({ open, onOpenChange, network, onReceive }: SheetProps & { network: Network; onReceive: () => void }) {
  const reason = network.id === "ethereum-mainnet" && isBroadcastDisabled()
    ? "На этом сервере отправка отключена. Доступны баланс и получение."
    : network.id === "base-mainnet"
    ? "В сети Base пока доступны баланс и получение. Отправка отключена: EXM ещё не может надёжно ограничить итоговую комиссию и показать статус перевода."
    : network.id === "solana-mainnet"
      ? "В основной сети Solana пока доступны баланс SOL и получение. Отправка отключена, пока не проверены подпись, комиссия и подтверждение перевода."
      : network.id === "bitcoin-mainnet"
        ? "В основной сети Bitcoin сейчас доступны баланс, история и получение. Отправка из EXM отключена: для реальных BTC ещё не проверены выбор входов, комиссия, сдача и подпись."
      : `В сети ${networkLabel(network)} пока доступны баланс и получение. Отправка отключена, пока EXM не сможет надёжно показывать историю и статус операций этой сети.`
  return <Sheet open={open} onOpenChange={onOpenChange} title="Отправка недоступна" subtitle={networkLabel(network)} returnFocusLabel="Отправить"
    footer={<PrimaryButton onClick={onReceive}>Открыть адрес получения</PrimaryButton>}>
    <p className="t-body1 c-2 px-1 pb-2">{reason}</p>
  </Sheet>
}

const PLACEHOLDER = { evm: "0x…", solana: "Адрес Solana", ton: "UQ… или EQ…", bitcoin: "tb1q…" } as const

export function SendSheet(props: Props) {
  const signer = useSigner(props.network)
  const family = props.network.family
  const sender = useMemo<Sender>(
    () => ({
      placeholder: PLACEHOLDER[family],
      fee: (to, amount) => signer.fee(to, amount),
      feeNote: family === "ton" ? "Это верхняя граница: сеть TON обычно берёт меньше." : family === "bitcoin" ? "Комиссия оценена по текущему курсу сети; точная сумма зависит от монет на адресе." : undefined,
      minFor: family === "solana" ? (to) => signer.minFor(to) : undefined,
      send: (to, value, maxNetworkFee) => signer.send(to, value, maxNetworkFee),
    }),
    [signer, family],
  )
  return <SendForm {...props} sender={sender} />
}

/* ------------------------------------------------------------------- form */

/** why a transfer failed, in words a person can act on; the raw node text stays in the console */
function sendFailure(e: unknown, network: Network) {
  const msg = ((e as { shortMessage?: string }).shortMessage ?? (e as Error)?.message ?? "").toString()
  console.warn("send failed", e)
  if (e instanceof BroadcastUncertainError || /могла пройти|могла попасть|проверьте историю|принята сетью/i.test(msg)) return msg
  if (/подпись остановлена|отправка остановлена|другой вкладке|незавершённый перевод|запись перевода/i.test(msg)) return msg
  if (/заблокирован/i.test(msg)) return "Кошелёк заблокирован: откройте его паролем и повторите."
  if (/insufficient|недостаточно|not enough|balance/i.test(msg)) return "Не хватает монет на сумму и комиссию сети."
  if (/failed to fetch|network|timeout|timed out|недоступен/i.test(msg)) return `Нет связи с сетью ${networkLabel(network)}. Повторите через минуту.`
  return `Сеть ${networkLabel(network)} не приняла перевод. Проверьте адрес и сумму и повторите.`
}

type Step = "form" | "confirm" | "done" | "uncertain"
const STEP_TITLE: Record<Step, string> = { form: "Отправить", confirm: "Обзор", done: "Итог", uncertain: "Статус" }

/** "0.0123" → "0,0123", the way a person types it */
const typed = (s: string) => s.replace(".", ",")

type Review = { networkId: string; sender: string; to: string; value: bigint; fee: bigint; balance: bigint; createdAt: number; bookKey: string }
const MAINNET_REVIEW_MS = 30_000
const outcomeKey = (network: Network, address: string) => `exm.send.outcome.v1:${network.id}:${address.toLowerCase()}`
type StoredOutcome = { kind: "done" | "uncertain"; to: string; value: string; message?: string; result?: SendResult }
function readOutcome(network: Network, address: string): StoredOutcome | null {
  try {
    const data = JSON.parse(localStorage.getItem(outcomeKey(network, address)) ?? "null") as StoredOutcome | null
    return data && (data.kind === "done" || data.kind === "uncertain") && typeof data.to === "string" && /^\d+$/.test(data.value) ? data : null
  } catch { return null }
}
function writeOutcome(network: Network, address: string, outcome: StoredOutcome | null) {
  try {
    const key = outcomeKey(network, address)
    if (outcome) localStorage.setItem(key, JSON.stringify(outcome))
    else localStorage.removeItem(key)
  } catch { /* Private browsing can refuse storage; the current sheet still shows the outcome. */ }
}

export function SendForm({ open, onOpenChange, network, address, balance, usdPrice: quotedUsdPrice, sender, initialRecipient, onChangeAsset, choosingAsset = false }: Props & { sender: Sender }) {
  const queryClient = useQueryClient()
  const { contacts } = useAddressBook()
  const family = network.family
  const decimals = network.native.decimals
  const symbol = network.native.symbol
  const usdPrice = network.environment === "mainnet" && quotedUsdPrice !== undefined && Number.isFinite(quotedUsdPrice) && quotedUsdPrice > 0 ? quotedUsdPrice : undefined
  const [step, setStep] = useState<Step>("form")
  const [to, setTo] = useState(initialRecipient ?? "")
  const [selectedContactId, setSelectedContactId] = useState(() => initialRecipient ? recipientInBook(contacts, family, initialRecipient).exact?.id : undefined)
  const [toTouched, setToTouched] = useState(false)
  const [pasteFailed, setPasteFailed] = useState(false)
  const [scanError, setScanError] = useState("")
  const [recipientScanning, setRecipientScanning] = useState(false)
  const [amount, setAmount] = useState("")
  const [inUsd, setInUsd] = useState(false)
  // the exact coin amount behind a dollar figure shown after a switch, until the figure is edited
  const [pin, setPin] = useState<{ text: string; value: bigint } | null>(null)
  const [amountTouched, setAmountTouched] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [bookOpen, setBookOpen] = useState(false)
  const [review, setReview] = useState<Review | null>(null)
  const [reviewChecked, setReviewChecked] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const helpVisible = helpOpen && step === "form"
  const helpButtonId = useId()
  const helpBody = useRef<HTMLDivElement>(null)
  const returnToHelpButton = useRef(false)
  const returnFromHelp = () => { returnToHelpButton.current = true; setHelpOpen(false) }
  useEffect(() => {
    if (!open) return
    if (step !== "form") { setHelpOpen(false); returnToHelpButton.current = false; return }
    if (helpVisible) helpBody.current?.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>('button[aria-label="Назад"]')?.focus({ preventScroll: true })
    else if (returnToHelpButton.current) {
      document.getElementById(helpButtonId)?.focus({ preventScroll: true })
      returnToHelpButton.current = false
    }
  }, [open, step, helpVisible, helpButtonId])
  const sending = useRef(false)
  const preparationContext = useRef("")
  const mounted = useRef(false)
  const preflightEpoch = useRef(0)
  const draftActions = useRef<HTMLDivElement>(null)
  const draftForm = useRef<HTMLFormElement>(null)
  const returnToAsset = useRef(false)
  const returnToDraft = useRef(false)
  const resumeDraft = () => { returnToDraft.current = true; setDiscardDraftOpen(false) }
  const returnFromScanner = () => { returnToDraft.current = true; setScanError(""); setRecipientScanning(false) }
  useEffect(() => {
    if (!open || step !== "form") return
    if (discardDraftOpen) draftActions.current?.querySelector("button")?.focus({ preventScroll: true })
    else if (returnToDraft.current && !recipientScanning) {
      draftForm.current?.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>('button[aria-label="Назад"]')?.focus({ preventScroll: true })
      returnToDraft.current = false
    }
  }, [open, step, discardDraftOpen, recipientScanning])
  useEffect(() => {
    if (!open || choosingAsset || !returnToAsset.current) return
    const frame = requestAnimationFrame(() => {
      draftForm.current?.querySelector<HTMLButtonElement>("button.wallet-transfer-asset")?.focus({ preventScroll: true })
      returnToAsset.current = false
    })
    return () => cancelAnimationFrame(frame)
  }, [open, choosingAsset])
  const cancelPreflight = () => { preflightEpoch.current += 1 }
  const chooseAsset = () => {
    cancelPreflight()
    returnToAsset.current = true
    onChangeAsset?.(to)
  }
  const openHelp = () => { cancelPreflight(); setHelpOpen(true) }
  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      cancelPreflight()
      if (helpVisible) { returnFromHelp(); return }
      if (discardDraftOpen) { resumeDraft(); return }
      if (step === "form" && recipientScanning) {
        returnFromScanner()
        return
      }
      if (step === "form" && (amount.trim() || to.trim() && to.trim() !== (initialRecipient ?? "").trim())) {
        setDiscardDraftOpen(true)
        return
      }
    }
    onOpenChange(nextOpen)
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; preflightEpoch.current += 1 }
  }, [])
  const [storedOutcome, setStoredOutcome] = useState<StoredOutcome | null>(() => readOutcome(network, address))
  const [now, setNow] = useState(Date.now())
  const recipient = useMemo(() => recipientInBook(contacts, family, to), [contacts, family, to])
  const bookKey = recipient.exact ? `saved:${recipient.exact.id}` : recipient.similar ? `similar:${recipient.similar.id}` : "new"
  const recovery = useTransferRecovery(open, network, address)
  useEffect(() => {
    if (!open || submitting || !recovery.blocked) return
    const item = recovery.record
    if (item?.asset.id === "native") {
      const previous = readOutcome(network, address)
      const acknowledged = previous?.to === item.to && previous.value === item.amount ? previous.result : undefined
      const knownResult = item.result ?? acknowledged
      setTo(item.to)
      setAmount(typed(fromUnits(BigInt(item.amount), decimals)))
      setResult(knownResult ?? null)
      setStep(item.state === "broadcast" || acknowledged ? "done" : "uncertain")
    } else { setResult(null); setStep("uncertain") }
    setSendError(recovery.error ?? (isInterruptedPreparation(item) ? "Подготовка сохранена до передачи узлу." : TRANSFER_UNCERTAIN_MESSAGE))
  }, [open, submitting, recovery.record, recovery.error, recovery.blocked, decimals])

  useEffect(() => {
    if (!open || step !== "confirm" || network.environment !== "mainnet") return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [open, step, network.environment])

  useEffect(() => {
    if (!open) return
    const saved = readOutcome(network, address)
    setStoredOutcome(saved)
    if (!saved) return
    setStep(saved.kind)
    setTo(saved.to)
    setAmount(typed(fromUnits(BigInt(saved.value), decimals)))
    setResult(saved.result ?? null)
    setSendError(saved.message ?? null)
  }, [open, network, address, decimals])

  useEffect(() => {
    if (open) return
    preflightEpoch.current += 1
    setStep("form")
    setDiscardDraftOpen(false)
    setHelpOpen(false)
    returnToHelpButton.current = false
    setTo("")
    setSelectedContactId(undefined)
    setToTouched(false)
    setPasteFailed(false)
    setScanError("")
    setRecipientScanning(false)
    setAmount("")
    setInUsd(false)
    setPin(null)
    setAmountTouched(false)
    setResult(null)
    setSendError(null)
    setBookOpen(false)
    setReview(null)
    setReviewChecked(false)
    setReviewError(null)
    setPreparing(false)
    setSubmitting(false)
    sending.current = false
  }, [open])

  // what was typed, in coins: dollars are converted at the main-network price
  const coinText = useMemo(() => {
    if (!inUsd) return amount
    if (!amount) return ""
    if (!usdPrice || !/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(amount.trim())) return "x"
    const usd = Number(amount.replace(",", "."))
    if (!Number.isFinite(usd)) return "x"
    return (usd / usdPrice).toFixed(Math.min(decimals, 8))
  }, [amount, inUsd, usdPrice, decimals])

  const value = useMemo(() => {
    if (inUsd && pin && pin.text === amount) return pin.value
    try {
      return coinText ? toUnits(coinText, decimals) : null
    } catch {
      return null
    }
  }, [coinText, decimals, inUsd, pin, amount])

  const toError = chainData(network).validateAddress(to.trim())
  const journalStatus = recovery.terminalStatusFor({ assetId: "native", to: to.trim(), amount: value?.toString() ?? "", hash: result?.hash ?? "" })
  useEffect(() => {
    if (!open || submitting || !journalStatus || (step !== "uncertain" && step !== "done")) return
    setStep("done")
    setSendError(null)
  }, [open, submitting, journalStatus, step])

  const receipt = useReceiptStatus({ open: open && step === "done" && !journalStatus, network, result, owner: address, destination: to.trim() })
  useEffect(() => {
    if (receipt.status && recovery.blocked && recovery.record?.asset.id === "native" && result?.hash) void recovery.verify(result).then((resolved) => { if (resolved) { setStep("done"); setSendError(null) } })
  }, [receipt.status, recovery.record?.id, recovery.record?.state, result?.hash])

  preparationContext.current = JSON.stringify([open, step, reviewChecked, network.id, address, to.trim(), value?.toString(), bookKey, recipientScanning, scanError])
  const maxFee = useQuery({
    queryKey: ["max-fee", network.id, address, to.trim()],
    queryFn: () => sender.fee(to.trim(), 0n),
    enabled: open && step === "form" && !toError && balance !== undefined && balance > 0n,
    staleTime: 10_000,
  })
  const fee = useQuery({
    queryKey: ["fee", network.id, address, to.trim(), value?.toString()],
    queryFn: () => sender.fee(to.trim(), value!),
    enabled: open && !toError && value !== null && value > 0n && balance !== undefined && value <= balance,
    refetchInterval: 15_000,
  })
  const minimum = useQuery({
    queryKey: ["min", network.id, to.trim()],
    queryFn: () => sender.minFor!(to.trim()),
    enabled: open && !!sender.minFor && !toError,
    staleTime: 30_000,
  })
  const minimumPending = !!sender.minFor && !toError && (minimum.isPending || minimum.isFetching)

  const amountError = !amount
    ? "Введите сумму"
    : value === null
      ? "Введите число, например 0,01"
      : value <= 0n
        ? "Сумма должна быть больше нуля"
        : balance === undefined
          ? "Баланс сети пока недоступен"
        : value > balance
          ? "Не хватает монет на сумму перевода"
        : balance !== undefined && fee.data !== undefined && value + fee.data > balance
          ? "Не хватает монет с учётом комиссии"
          : minimum.data && value < minimum.data
            ? `Новому адресу нужно отправить не меньше ${formatCoin(minimum.data, decimals, symbol)}, иначе сеть не создаст адрес`
            : null
  const showAmountError = !!amount && !!amountError && (amountTouched || value !== null && value > 0n && balance !== undefined)
  const max = balance !== undefined && maxFee.data !== undefined && balance > maxFee.data ? balance - maxFee.data : null
  const fractions = [25, 50, 75, 100].map((percent) => ({ percent, value: max === null ? null : max * BigInt(percent) / 100n }))
  const usdOf = (v: bigint) => {
    const estimate = usdPrice ? Number(fromUnits(v, decimals)) * usdPrice : null
    return estimate !== null && Number.isFinite(estimate) ? formatUsd(estimate) : null
  }

  const switchUnit = () => {
    if (!usdPrice) return
    if (inUsd) {
      setAmount(value !== null ? typed(fromUnits(value, decimals)) : "")
      setPin(null)
    } else {
      const text = value !== null ? typed((Number(fromUnits(value, decimals)) * usdPrice).toFixed(2)) : ""
      setAmount(text)
      setPin(value !== null ? { text, value } : null)
    }
    setInUsd(!inUsd)
  }

  const confirm = async () => {
    if (sending.current) return
    if (!reviewChecked || !review || review.networkId !== network.id || review.sender !== address || review.to !== to.trim() || review.value !== value || review.bookKey !== bookKey ||
      network.environment === "mainnet" && Date.now() - review.createdAt > MAINNET_REVIEW_MS) {
      setReview(null)
      setReviewError("Проверка устарела или данные изменились. Вернитесь к сумме и проверьте условия снова.")
      throw new Error("Проверка перевода устарела")
    }
    const context = preparationContext.current
    const epoch = preflightEpoch.current
    sending.current = true
    setSubmitting(true)
    setSendError(null)
    let conditionsChanged = false
    let sendStarted = false
    try {
      if (network.environment === "mainnet") {
        // A mainnet signature must use a fresh balance and a fresh bound for this exact transfer.
        const [freshFee, freshBalance] = await Promise.all([
          sender.fee(review.to, review.value),
          chainData(network).getBalance(address).then((result) => result.native),
        ])
        if (!mounted.current || preflightEpoch.current !== epoch || preparationContext.current !== context) return
        if (freshFee > review.fee || freshBalance < review.value + freshFee) {
          conditionsChanged = true
          setReview(null)
          setReviewError("Комиссия или баланс изменились. Проверьте перевод ещё раз перед подписью.")
          throw new Error("Комиссия или баланс изменились")
        }
      }
      if (!mounted.current || preflightEpoch.current !== epoch || preparationContext.current !== context) return
      sendStarted = true
      const r = await guardedTransfer({ network, owner: address, asset: { id: "native", symbol, decimals }, to: review.to, amount: review.value, fee: review.fee,
        current: () => mounted.current && preflightEpoch.current === epoch && preparationContext.current === context,
        send: () => sender.send(review.to, review.value, network.environment === "mainnet" ? review.fee : undefined) })
      const saved: StoredOutcome = { kind: "done", to: review.to, value: review.value.toString(), result: r }
      if (r.status === "broadcast" && r.hash) recordPendingActivity({ networkId: network.id, owner: address, hash: r.hash, recipient: review.to, amount: review.value.toString(), createdAt: Date.now() })
      writeOutcome(network, address, saved)
      setStoredOutcome(saved)
      setResult(r)
      setStep("done")
      queryClient.invalidateQueries({ queryKey: ["balance", network.id] })
      queryClient.invalidateQueries({ queryKey: ["activity", network.id] })
    } catch (e) {
      if (e instanceof TransferPreflightCancelledError) return
      if (!sendStarted && (!mounted.current || preflightEpoch.current !== epoch || preparationContext.current !== context)) return
      if (/Комиссия выросла до подписи|Лимит комиссии не подтверждён/.test((e as Error)?.message ?? "")) {
        conditionsChanged = true
        setReview(null)
        setReviewError("Комиссия изменилась до подписи. Вернитесь к сумме и проверьте перевод снова.")
      }
      if (e instanceof BroadcastUncertainError || /могла пройти|могла попасть|проверьте историю|принята сетью/i.test((e as Error)?.message ?? "")) {
        const message = sendFailure(e, network)
        const saved: StoredOutcome = { kind: "uncertain", to: review.to, value: review.value.toString(), message }
        writeOutcome(network, address, saved)
        setStoredOutcome(saved)
        setSendError(message)
        setStep("uncertain")
      } else if (!conditionsChanged) setSendError(sendFailure(e, network))
      throw e
    } finally {
      sending.current = false
      setSubmitting(false)
    }
  }

  const next = async () => {
    setToTouched(true)
    setAmountTouched(true)
    if (step !== "form" || helpVisible || discardDraftOpen || toError || scanError || amountError || value === null || fee.data === undefined || fee.isFetching || fee.isError || minimumPending || minimum.isError || preparing) return
    const context = preparationContext.current
    const epoch = preflightEpoch.current
    setPreparing(true)
    setReviewError(null)
    try {
      const [freshFee, freshBalance] = await Promise.all([
        sender.fee(to.trim(), value),
        network.environment === "mainnet" ? chainData(network).getBalance(address).then((result) => result.native) : Promise.resolve(balance),
      ])
      if (!mounted.current || preflightEpoch.current !== epoch || preparationContext.current !== context) return
      if (freshBalance === undefined || value + freshFee > freshBalance) throw new Error("Не хватает монет на сумму и комиссию сети")
      const snapshot: Review = { networkId: network.id, sender: address, to: to.trim(), value, fee: freshFee, balance: freshBalance, createdAt: Date.now(), bookKey }
      setReview(snapshot)
      setReviewChecked(false)
      setNow(Date.now())
      setStep("confirm")
    } catch (e) {
      if (mounted.current && preflightEpoch.current === epoch && preparationContext.current === context) setReviewError(e instanceof Error ? e.message : "Не получилось проверить перевод")
    } finally { setPreparing(false) }
  }

  const reviewExpired = !!review && network.environment === "mainnet" && now - review.createdAt > MAINNET_REVIEW_MS
  const footer =
    step === "form" ? (
      <PrimaryButton onClick={() => void next()} disabled={!to.trim() || !!toError || !!scanError || !!amountError || preparing || fee.data === undefined || fee.isFetching || fee.isError || minimumPending || minimum.isError}>
        {preparing || (to.trim() && amount && (fee.isFetching || minimumPending)) ? "Проверяем условия…" : "Продолжить"}
      </PrimaryButton>
    ) : step === "confirm" ? (
      !review || reviewError || amountError || minimumPending || minimum.isError || reviewExpired
        ? <PrimaryButton onClick={() => { setStep("form"); setReview(null); setReviewChecked(false) }}>Проверить сумму и комиссию</PrimaryButton>
        : !reviewChecked
          ? <PrimaryButton disabled>Сверьте данные</PrimaryButton>
        : <PrimaryButton disabled={submitting} onClick={() => { void confirm().catch(() => {}) }}>{submitting ? "Проверяем и отправляем…" : "Подтвердить отправку"}</PrimaryButton>
    ) : (
      <PrimaryButton onClick={() => {
        if (step === "done") { writeOutcome(network, address, null); setStoredOutcome(null) }
        changeOpen(false)
      }}>{step === "uncertain" ? "Закрыть и проверить историю" : "Готово"}</PrimaryButton>
    )

  return (
    <Sheet
      open={open && !choosingAsset}
      onOpenChange={changeOpen}
      className={discardDraftOpen ? undefined : "wallet-send-sheet"}
      expanded={!discardDraftOpen && (step === "form" || step === "confirm")}
      fullscreen={!discardDraftOpen && step === "form"}
      fitDesktop
      headerAction={step === "form" && !recipientScanning && !discardDraftOpen && !helpVisible ? <TransferHelpButton id={helpButtonId} onClick={openHelp} /> : undefined}
      returnFocusLabel="Отправить"
      title={helpVisible ? "О переводе" : discardDraftOpen ? "Сбросить черновик?" : STEP_TITLE[step]}
      onBack={helpVisible ? returnFromHelp : discardDraftOpen ? undefined : step === "form" ? () => {
        if (recipientScanning) {
          returnFromScanner()
        } else changeOpen(false)
      } : step === "confirm" ? () => { cancelPreflight(); setStep("form") } : undefined}
      footer={helpVisible ? undefined : discardDraftOpen ? <div ref={draftActions} className="wallet-transfer-draft-actions"><PrimaryButton onClick={resumeDraft}>Продолжить перевод</PrimaryButton><SecondaryButton onClick={() => { cancelPreflight(); setDiscardDraftOpen(false); onOpenChange(false) }}>Сбросить черновик</SecondaryButton></div> : step === "form" && recipientScanning ? undefined : footer}
    >
      {helpVisible ? <div ref={helpBody}><TransferHelp network={networkLabel(network)} symbol={symbol}>{sender.feeNote ? <p>{sender.feeNote}</p> : null}</TransferHelp></div> : null}
      <div hidden={helpVisible}>
      {discardDraftOpen ? <p className="wallet-transfer-draft-note">Адрес и сумма будут очищены.</p> : step === "form" ? (
        recipientScanning ? <div className="flex flex-col gap-4 pb-2">
          <QrScanControl autoStart onScan={(raw) => { try { setTo(addressForNetwork(raw, network)); setScanError(""); setToTouched(true); setRecipientScanning(false); setPasteFailed(false); return null } catch (cause) { const message = (cause as Error).message; setScanError(message); return message } }} />
          <SecondaryButton onClick={returnFromScanner}>Ввести адрес вручную</SecondaryButton>
        </div> :
        <form
          ref={draftForm}
          className="wallet-send-form"
          onSubmit={(e) => {
            e.preventDefault()
            next()
          }}
        >
          <TransferAssetCard icon={<NetworkCoin network={network} size={36} />} symbol={symbol} network={networkLabel(network)} balance={balance !== undefined ? formatCoin(balance, decimals, symbol) : "Баланс уточняется"} onSelect={onChangeAsset ? chooseAsset : undefined} />
          <section className="wallet-send-amount-section" aria-label="Сумма перевода">
          <div className="wallet-send-label-row wallet-send-amount-label">
            <label htmlFor="send-amount">Сумма</label>
          </div>
          <div className="wallet-send-amount-field wallet-transfer-field">
            {inUsd ? <span className="wallet-send-dollar">$</span> : null}
            <input
              id="send-amount"
              aria-label={`Сумма в ${inUsd ? "долларах" : symbol}`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setAmountTouched(true)}
              className="wallet-send-amount"
              aria-invalid={showAmountError}
              aria-describedby="send-amount-hint"
            />
            {usdPrice || onChangeAsset ? <button type="button" className="wallet-send-unit" onClick={usdPrice ? switchUnit : chooseAsset} aria-label={usdPrice ? inUsd ? `Вводить в ${symbol}` : "Вводить в долларах" : `Выбрать актив, сейчас ${symbol}`}>{inUsd ? "USD" : symbol}<IconChevronDown size={16} /></button> : <span className="wallet-send-unit">{symbol}</span>}
          </div>
          {network.environment === "mainnet" ? <p className="wallet-send-fiat" aria-label={!usdPrice ? "Курс недоступен" : value === null ? "Сумма не введена" : undefined}>{!usdPrice ? "Курс недоступен" : value !== null ? inUsd ? formatCoin(value, decimals, symbol) : `≈ ${usdOf(value)}` : " "}</p> : null}
          <div className="wallet-send-fractions">
            {fractions.map(({ percent, value: part }) => <button type="button" key={percent} disabled={part === null || part <= 0n || !!minimum.data && part < minimum.data} onClick={() => { if (part !== null) { setInUsd(false); setPin(null); setAmount(typed(fromUnits(part, decimals))); setAmountTouched(true) } }}><span>{percent === 100 ? "Макс" : `${percent}%`}</span></button>)}
          </div>
          <p id="send-amount-hint" role={showAmountError ? "alert" : undefined} className={showAmountError ? "wallet-send-error" : "sr-only"}>
            {showAmountError
              ? amountError
              : balance !== undefined
                ? `Доступно ${formatCoin(balance, decimals, symbol)}`
                : " "}
          </p>
          </section>
          <section className="wallet-send-recipient-section" aria-label="Получатель">
          <div className="wallet-send-label-row">
            <label htmlFor="send-to">Кому<span className="sr-only">: адрес получателя</span></label>
            <button type="button" onClick={() => setBookOpen(true)}>Контакты</button>
          </div>
          <TransferRecipientField
            id="send-to"
            contact={recipient.exact?.id === selectedContactId ? recipient.exact : undefined}
            label="Адрес получателя"
            value={to}
            onChange={(next) => { setTo(next); setSelectedContactId(undefined); setScanError(""); setPasteFailed(false) }}
            onBlur={() => setToTouched(true)}
            placeholder="Адрес"
            invalid={!!scanError || toTouched && !!to && !!toError}
            onPaste={(next) => { setTo(next); setScanError(""); setToTouched(true); setPasteFailed(false) }}
            onPasteError={() => setPasteFailed(true)}
            onScan={() => { cancelPreflight(); setScanError(""); setRecipientScanning(true) }}
            describedBy="send-to-hint"
          />
          <p id="send-to-hint" role={scanError || pasteFailed ? "alert" : undefined} className={scanError || toTouched && to && toError || pasteFailed ? "wallet-send-error" : "sr-only"}>
            {scanError || (toTouched && to && toError ? toError : pasteFailed ? "Браузер не дал прочитать буфер обмена: вставьте адрес вручную." : `Перевод появится только в сети ${networkLabel(network)}. Проверьте, что получатель ждёт его там.`)}
          </p>
          </section>
          <TransferFeeCard value={fee.data !== undefined ? `до ${formatCoin(fee.data, decimals, symbol)}` : fee.isError ? "Не удалось узнать" : fee.isFetching ? "Считаем…" : "После ввода адреса и суммы"}>
            <p>Сеть {networkLabel(network)}. {sender.feeNote ?? "Это максимальная оценка расходов сети для этого перевода. Перед подписью условия проверяются ещё раз."}</p>
            {fee.isError ? <ErrorNote message="Не удалось оценить комиссию сети." onRetry={() => fee.refetch()} /> : null}
            {maxFee.isError ? <ErrorNote message="Не удалось рассчитать доступный остаток после комиссии." onRetry={() => maxFee.refetch()} /> : null}
          </TransferFeeCard>
          {amount && value !== null && value > 0n && minimum.isError ? <div className="card w-full"><ErrorNote message="Не удалось проверить адрес Solana. Повторите запрос перед отправкой." onRetry={() => minimum.refetch()} /></div> : null}
          {amount && balance === undefined ? <div className="card w-full"><ErrorNote message="Баланс не загрузился. Повторите запрос перед отправкой." onRetry={() => queryClient.invalidateQueries({ queryKey: ["balance", network.id, address] })} /></div> : null}
          {reviewError ? <div className="card w-full"><ErrorNote message={reviewError} /></div> : null}
        </form>
      ) : step === "confirm" ? (
        <div className="wallet-transfer-review">
          <TransferReviewSummary icon={<NetworkCoin network={network} size={36} />} amount={formatCoin(review?.value ?? value!, decimals, symbol)} network={networkLabel(network)} />
          {reviewExpired && !submitting ? <p className="wallet-transfer-review-expired" role="status">Срок оценки истёк. Заново проверьте сумму и комиссию.</p> : null}
          <TransferReviewAddress label="Кому" name={recipient.exact?.name ?? "Новый получатель"} address={review?.to ?? to.trim()} recipient />
          <TransferReviewAddress label="Откуда" name="Мой кошелёк" address={review?.sender ?? address} />
          <Group className="wallet-transfer-review-cost" footer={sender.feeNote}>
            <Row label="Расходы сети">{review ? "до " + formatCoin(review.fee, decimals, symbol) : "нужно пересчитать"}</Row>
            <Row label="Всего с комиссией">{review ? `до ${formatCoin(review.value + review.fee, decimals, symbol)}` : "нужно пересчитать"}</Row>
          </Group>
          {recipient.similar ? <div role="alert" className="card border border-[var(--orange)] px-4 py-3"><p className="t-label1 text-[var(--orange)]">Адрес похож на сохранённый</p><p className="t-body2 c-2">Похож на «{recipient.similar.name}» ({shortAddress(recipient.similar.address)}), но это другой адрес. Сверьте все символы перед отправкой.</p></div> : null}
          <p className="wallet-transfer-review-warning text-[var(--orange)]">Отправленный перевод нельзя отменить.</p>
          <label className="wallet-transfer-review-check">
            <input type="checkbox" checked={reviewChecked} onChange={(event) => setReviewChecked(event.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--blue)]" />
            <span className="t-body2">Я сверил сеть, полный адрес, сумму и максимум комиссии.</span>
          </label>
          <div className="wallet-transfer-review-notes">
            <details><summary>Что проверено перед подписью</summary><p>{family === "evm" ? "Проверены адрес, баланс, комиссия и предварительное выполнение перевода." : "Проверены адрес, баланс и оценка комиссии."} Владелец адреса и окончательный статус в сети неизвестны.</p>{network.environment === "mainnet" ? <p>Оценка действительна 30 секунд. Перед подписью баланс и комиссия проверяются ещё раз.</p> : null}</details>
          </div>
          {reviewError ? <div className="card"><ErrorNote message={reviewError} /></div> : null}
          {sendError ? (
            <div className="card">
              <ErrorNote message={sendError} />
            </div>
          ) : null}
        </div>
      ) : step === "uncertain" ? (
        <div className="flex flex-col items-center gap-4 pt-4 pb-2 text-center">
          <NetworkCoin network={network} size={64} ring="var(--bg)" />
          <p className="t-h2">{isInterruptedPreparation(recovery.record) ? "Подготовка перевода" : "Исход пока неизвестен"}</p>
          <p className="t-body2 c-2 max-w-[340px]">{sendError} Повторная отправка здесь остановлена, чтобы не отправить монеты дважды.</p>
          {network.explorer.url ? <a href={network.explorer.address(address)} target="_blank" rel="noopener noreferrer" className="t-label1 inline-flex min-h-11 items-center gap-2 text-[var(--blue)]">Проверить адрес в {network.explorer.name}<IconExternal size={18} /></a> : null}
          {network.environment === "mainnet" ? <TransferRecoveryNotice recovery={recovery} onResolved={() => { writeOutcome(network, address, null); setStoredOutcome(null); setStep("form"); setTo(""); setAmount(""); setSendError(null); setReview(null) }} /> : storedOutcome ? <SecondaryButton onClick={() => { writeOutcome(network, address, null); setStoredOutcome(null); setStep("form"); setTo(""); setAmount(""); setSendError(null); setReview(null) }}>Я проверил историю · новый перевод</SecondaryButton> : null}
        </div>
      ) : (
        <>
          <TransferReceipt result={result} confirmed={receipt.status === "confirmed" || journalStatus === "confirmed"} failed={receipt.status === "failed" || journalStatus === "failed"} unavailable={receipt.unavailable} amount={value !== null ? formatCoin(value, decimals, symbol) : ""} network={networkLabel(network)} from={address} to={to.trim()} icon={<NetworkCoin network={network} size={64} ring="var(--bg)" />} />
          {recovery.blocked ? <TransferRecoveryNotice recovery={recovery} knownResult={result ?? undefined} onResolved={() => { writeOutcome(network, address, null); setStoredOutcome(null); setSendError(null); setReview(null); setStep("form"); setTo(""); setAmount("") }} /> : null}
        </>
      )}
      </div>
      <AddressBookSheet open={bookOpen} onOpenChange={setBookOpen} network={network} onSelect={(contact) => { setTo(contact.address); setSelectedContactId(contact.id); setToTouched(true); setScanError(""); setPasteFailed(false) }} />
    </Sheet>
  )
}
