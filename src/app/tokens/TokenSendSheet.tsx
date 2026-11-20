import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { chainData, networkLabel } from "@/lib/chains"
import { formatCoin, formatUsd, fromUnits, toUnits } from "@/lib/format"
import type { TokenHolding } from "../home/portfolio"
import { useBalance } from "../data"
import { IconChevronDown, IconExternal } from "../glyph"
import { CoinIcon } from "../marks"
import { TransferRecipientField } from "../screens/TransferRecipientField"
import { ReceiveSheet } from "../screens/sheets"
import { TransferAssetCard, TransferFeeCard, TransferHelp, TransferHelpButton, TransferReceipt, TransferReviewAddress, TransferReviewSummary } from "../screens/TransferAssetCard"
import { useTokenSigner } from "../vault/tokenSigner"
import { BroadcastUncertainError, type SendResult } from "../vault/signers"
import { recordPendingActivity } from "../history/pending"
import { AddressBookSheet } from "../addressBook/AddressBookSheet"
import { recipientInBook, useAddressBook } from "../addressBook/store"
import { ErrorNote, Group, PrimaryButton, Row, SecondaryButton, Sheet } from "../ui"
import { QrScanControl } from "../QrScanControl"
import { addressForNetwork } from "../qr"
import { useReceiptStatus } from "../screens/useReceiptStatus"
import { guardedTransfer, TransferPreflightCancelledError, TRANSFER_UNCERTAIN_MESSAGE } from "../transfers/guard"
import { TransferRecoveryNotice, useTransferRecovery } from "../transfers/recovery"
import { isInterruptedPreparation } from "../transfers/pending"

type Props = { open: boolean; onOpenChange: (open: boolean) => void; holding: TokenHolding; initialRecipient?: string; onChangeAsset?: (recipient?: string) => void; choosingAsset?: boolean }
type Review = { networkId: string; tokenAddress: string; sender: string; to: string; amount: bigint; fee: bigint; nativeBalance: bigint; tokenBalance: bigint; bookKey: string; createdAt: number }
const MAINNET_REVIEW_MS = 30_000
type StoredOutcome = { kind: "done" | "uncertain"; to: string; amount: string; message?: string; result?: SendResult }
const outcomeKey = (networkId: string, tokenAddress: string, address: string) => `exm.token-send.outcome.v1:${networkId}:${tokenAddress.toLowerCase()}:${address.toLowerCase()}`
function readOutcome(networkId: string, tokenAddress: string, address: string): StoredOutcome | null {
  try {
    const data = JSON.parse(localStorage.getItem(outcomeKey(networkId, tokenAddress, address)) ?? "null") as StoredOutcome | null
    return data && (data.kind === "done" || data.kind === "uncertain") && typeof data.to === "string" && /^\d+$/.test(data.amount) ? data : null
  } catch { return null }
}
function writeOutcome(networkId: string, tokenAddress: string, address: string, outcome: StoredOutcome | null) {
  try {
    const key = outcomeKey(networkId, tokenAddress, address)
    if (outcome) localStorage.setItem(key, JSON.stringify(outcome))
    else localStorage.removeItem(key)
  } catch { /* The current sheet still holds the outcome when storage is unavailable. */ }
}

export function TokenSendSheet({ open, onOpenChange, holding, initialRecipient, onChangeAsset, choosingAsset = false }: Props) {
  const { network, token, address, amount: balance } = holding
  const signer = useTokenSigner(network, token)
  const { contacts } = useAddressBook()
  const native = useBalance(network, address)
  const queryClient = useQueryClient()
  const [step, setStep] = useState<"form" | "confirm" | "done" | "uncertain">("form")
  const [to, setTo] = useState(initialRecipient ?? "")
  const [selectedContactId, setSelectedContactId] = useState(() => initialRecipient ? recipientInBook(contacts, network.family, initialRecipient).exact?.id : undefined)
  const [amountText, setAmountText] = useState("")
  const [touched, setTouched] = useState(false)
  const [pasteFailed, setPasteFailed] = useState(false)
  const [scanError, setScanError] = useState("")
  const [recipientScanning, setRecipientScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SendResult | null>(null)
  const [bookOpen, setBookOpen] = useState(false)
  const [feeReceiveOpen, setFeeReceiveOpen] = useState(false)
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
      if (step === "form" && (amountText.trim() || to.trim() && to.trim() !== (initialRecipient ?? "").trim())) {
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
  const [now, setNow] = useState(Date.now())
  const [storedOutcome, setStoredOutcome] = useState<StoredOutcome | null>(() => readOutcome(network.id, token.address, address))
  const recipient = useMemo(() => recipientInBook(contacts, network.family, to), [contacts, network.family, to])
  const bookKey = recipient.exact ? `saved:${recipient.exact.id}` : recipient.similar ? `similar:${recipient.similar.id}` : "new"
  const recovery = useTransferRecovery(open, network, address)
  useEffect(() => {
    if (!open || submitting || !recovery.blocked) return
    const item = recovery.record
    if (item && (network.family === "evm" ? item.asset.id.toLowerCase() === token.address.toLowerCase() : item.asset.id === token.address)) {
      const previous = readOutcome(network.id, token.address, address)
      const acknowledged = previous?.to === item.to && previous.amount === item.amount ? previous.result : undefined
      const knownResult = item.result ?? acknowledged
      setTo(item.to)
      setAmountText(fromUnits(BigInt(item.amount), token.decimals).replace(".", ","))
      setResult(knownResult ?? null)
      setStep(item.state === "broadcast" || acknowledged ? "done" : "uncertain")
    } else { setResult(null); setStep("uncertain") }
    setError(recovery.error ?? (isInterruptedPreparation(item) ? "Подготовка сохранена до передачи узлу." : TRANSFER_UNCERTAIN_MESSAGE))
  }, [open, submitting, recovery.record, recovery.error, recovery.blocked, network.family, token.address, token.decimals])

  useEffect(() => {
    if (!open || step !== "confirm" || network.environment !== "mainnet") return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [open, step, network.environment])

  useEffect(() => {
    if (!open) return
    const saved = readOutcome(network.id, token.address, address)
    setStoredOutcome(saved)
    if (!saved) return
    setStep(saved.kind)
    setTo(saved.to)
    setAmountText(fromUnits(BigInt(saved.amount), token.decimals).replace(".", ","))
    setError(saved.message ?? null)
    setResult(saved.result ?? null)
  }, [open, network.id, token.address, token.decimals, address])

  useEffect(() => {
    if (open) return
    preflightEpoch.current += 1
    setStep("form")
    setDiscardDraftOpen(false)
    setHelpOpen(false)
    returnToHelpButton.current = false
    setTo("")
    setSelectedContactId(undefined)
    setAmountText("")
    setTouched(false)
    setPasteFailed(false)
    setScanError("")
    setRecipientScanning(false)
    setError(null)
    setResult(null)
    setBookOpen(false)
    setFeeReceiveOpen(false)
    setReview(null)
    setReviewChecked(false)
    setReviewError(null)
    setPreparing(false)
    setSubmitting(false)
    sending.current = false
  }, [open])

  const toError = chainData(network).validateAddress(to.trim())
  const amount = useMemo(() => {
    try { return amountText ? toUnits(amountText, token.decimals) : null } catch { return null }
  }, [amountText, token.decimals])
  const journalStatus = recovery.terminalStatusFor({ assetId: token.address, to: to.trim(), amount: amount?.toString() ?? "", hash: result?.hash ?? "" })
  useEffect(() => {
    if (!open || submitting || !journalStatus || (step !== "uncertain" && step !== "done")) return
    setStep("done")
    setError(null)
  }, [open, submitting, journalStatus, step])

  const receipt = useReceiptStatus({ open: open && step === "done" && !journalStatus, network, result, owner: address, destination: token.address })
  useEffect(() => {
    if (receipt.status && recovery.blocked && recovery.record?.asset.id.toLowerCase() === token.address.toLowerCase() && result?.hash) void recovery.verify(result).then((resolved) => { if (resolved) { setStep("done"); setError(null) } })
  }, [receipt.status, recovery.record?.id, recovery.record?.state, result?.hash, token.address])

  preparationContext.current = JSON.stringify([open, step, reviewChecked, network.id, token.address, address, to.trim(), amount?.toString(), bookKey, recipientScanning, scanError])
  const fee = useQuery({
    queryKey: ["token-fee", network.id, token.address, address, to.trim(), amount?.toString()],
    queryFn: () => signer.feeDetails(to.trim(), amount!),
    enabled: open && !toError && amount !== null && amount > 0n && balance !== undefined && amount <= balance,
    staleTime: 10_000,
    retry: 1,
  })
  const nativeBalance = native.data?.native
  const amountError = !amountText ? "Введите сумму" : amount === null ? `Введите число, не больше ${token.decimals} знаков после запятой` : amount <= 0n ? "Сумма должна быть больше нуля" : balance === undefined ? `Баланс ${token.symbol} пока недоступен` : amount > balance ? `Не хватает ${token.symbol}` : null
  const showAmountError = !!amountText && !!amountError && (touched || balance !== undefined)
  const fiatEstimate = network.environment === "mainnet" && amount !== null && amount > 0n && holding.price !== undefined && Number.isFinite(holding.price) && holding.price > 0
    ? Number(fromUnits(amount, token.decimals)) * holding.price
    : null
  const fractions = [25, 50, 75, 100].map((percent) => ({ percent, value: balance === undefined ? null : balance * BigInt(percent) / 100n }))
  const feeAsset = network.native.symbol
  const insufficientFeeBalance = nativeBalance === 0n || (fee.data !== undefined && nativeBalance !== undefined && fee.data.total > nativeBalance)
  const feeError = native.isError ? `Не удалось узнать баланс ${feeAsset} для оплаты комиссии` : insufficientFeeBalance ? `Не хватает ${feeAsset} ${fee.data?.createsAccount ? "на комиссию и создание счёта получателя" : "на комиссию"}` : null

  const next = async () => {
    setTouched(true)
    if (step === "form" && !helpVisible && !discardDraftOpen && !toError && !scanError && !amountError && !feeError && !fee.isFetching && !fee.isError && fee.data !== undefined && nativeBalance !== undefined && amount !== null && !preparing) {
      const context = preparationContext.current
      const epoch = preflightEpoch.current
      setPreparing(true)
      setReviewError(null)
      try {
        const [freshFee, freshToken, freshNative] = await Promise.all([
          signer.feeDetails(to.trim(), amount),
          network.environment === "mainnet" ? signer.balance() : Promise.resolve(balance),
          network.environment === "mainnet" ? chainData(network).getBalance(address).then((item) => item.native) : Promise.resolve(nativeBalance),
        ])
        if (!mounted.current || preflightEpoch.current !== epoch || preparationContext.current !== context) return
        if (freshToken === undefined || freshNative === undefined || amount > freshToken || freshFee.total > freshNative) throw new Error("Баланс или комиссия изменились. Проверьте перевод снова.")
        setReview({ networkId: network.id, tokenAddress: token.address, sender: address, to: to.trim(), amount, fee: freshFee.total, nativeBalance: freshNative, tokenBalance: freshToken, bookKey, createdAt: Date.now() })
        setReviewChecked(false)
        setNow(Date.now())
        setStep("confirm")
        setTouched(false)
      } catch (e) { if (mounted.current && preflightEpoch.current === epoch && preparationContext.current === context) setReviewError(e instanceof Error ? e.message : "Не удалось проверить условия перевода") }
      finally { setPreparing(false) }
    }
  }
  const send = async () => {
    if (sending.current) return
    if (!reviewChecked || !review || review.networkId !== network.id || review.tokenAddress !== token.address || review.sender !== address || review.to !== to.trim() || review.amount !== amount || review.bookKey !== bookKey ||
      network.environment === "mainnet" && Date.now() - review.createdAt > MAINNET_REVIEW_MS) {
      setReview(null)
      setReviewError("Проверка устарела или данные изменились. Вернитесь к сумме и проверьте условия снова.")
      throw new Error("Проверка перевода устарела")
    }
    const context = preparationContext.current
    const epoch = preflightEpoch.current
    sending.current = true
    setSubmitting(true)
    setError(null)
    let conditionsChanged = false
    let sendStarted = false
    try {
      // Balances and the fee can change while the confirmation sheet is open.
      const [liveNative, liveToken, liveFee] = await Promise.all([
        chainData(network).getBalance(address),
        signer.balance(),
        signer.feeDetails(review.to, review.amount),
      ])
      if (!mounted.current || preflightEpoch.current !== epoch || preparationContext.current !== context) return
      if (review.amount > liveToken) throw new Error(`Не хватает ${token.symbol}`)
      if (liveFee.total > liveNative.native) throw new Error(`Не хватает ${network.native.symbol} на комиссию сети`)
      if (network.environment === "mainnet" && liveFee.total > review.fee) {
        conditionsChanged = true
        setReview(null)
        setReviewError("Комиссия выросла. Вернитесь к сумме и проверьте перевод снова.")
        throw new Error("Комиссия выросла до подписи")
      }
      if (!mounted.current || preflightEpoch.current !== epoch || preparationContext.current !== context) return
      sendStarted = true
      const sent = await guardedTransfer({ network, owner: address, asset: { id: token.address, symbol: token.symbol, decimals: token.decimals }, to: review.to, amount: review.amount, fee: review.fee,
        current: () => mounted.current && preflightEpoch.current === epoch && preparationContext.current === context,
        send: () => signer.send(review.to, review.amount, network.environment === "mainnet" ? review.fee : undefined) })
      const saved: StoredOutcome = { kind: "done", to: review.to, amount: review.amount.toString(), result: sent }
      if (sent.status === "broadcast" && sent.hash) recordPendingActivity({ networkId: network.id, owner: address, hash: sent.hash, recipient: review.to, amount: review.amount.toString(), tokenAddress: token.address, createdAt: Date.now() })
      writeOutcome(network.id, token.address, address, saved)
      setStoredOutcome(saved)
      setResult(sent)
      setStep("done")
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["token-balance", network.id] }),
        queryClient.invalidateQueries({ queryKey: ["balance", network.id] }),
        queryClient.invalidateQueries({ queryKey: ["token-activity", network.id] }),
        queryClient.invalidateQueries({ queryKey: ["activity", network.id] }),
      ])
    } catch (e) {
      if (e instanceof TransferPreflightCancelledError) return
      if (!sendStarted && (!mounted.current || preflightEpoch.current !== epoch || preparationContext.current !== context)) return
      const raw = ((e as { shortMessage?: string }).shortMessage ?? (e as Error)?.message ?? "").toString()
      if (/Комиссия выросла до подписи|Лимит комиссии не подтверждён/.test(raw)) {
        conditionsChanged = true
        setReview(null)
        setReviewError("Комиссия изменилась до подписи. Вернитесь к сумме и проверьте перевод снова.")
      }
      console.warn("token send failed", e)
      if (!conditionsChanged) setError(e instanceof BroadcastUncertainError || /могла пройти|могла попасть|проверьте историю|принята сетью|подпись остановлена|отправка остановлена|другой вкладке|незавершённый перевод|запись перевода/i.test(raw) ? raw : /balance|insufficient|не хватает/i.test(raw) ? `Не хватает ${token.symbol} или ${network.native.symbol} на комиссию сети.` : /fetch|network|timeout|RPC/i.test(raw) ? `Нет связи с сетью ${networkLabel(network)}. Если перевод уже отправлялся, сначала проверьте историю.` : `Перевод ${token.symbol} не прошёл. Проверьте адрес и сумму.`)
      if (e instanceof BroadcastUncertainError || /могла пройти|могла попасть|проверьте историю|принята сетью/i.test(raw)) {
        const saved: StoredOutcome = { kind: "uncertain", to: review.to, amount: review.amount.toString(), message: raw }
        writeOutcome(network.id, token.address, address, saved)
        setStoredOutcome(saved)
        setStep("uncertain")
      }
      throw e
    } finally {
      sending.current = false
      setSubmitting(false)
    }
  }

  const reviewExpired = !!review && network.environment === "mainnet" && now - review.createdAt > MAINNET_REVIEW_MS
  const footer = step === "form"
    ? <PrimaryButton onClick={() => void next()} disabled={!to.trim() || !!toError || !!scanError || preparing || fee.isFetching || fee.isError || !!feeError || !!amountError || fee.data === undefined || nativeBalance === undefined}>{preparing || (to.trim() && amountText && fee.isFetching) ? "Считаем комиссию…" : "Продолжить"}</PrimaryButton>
    : step === "confirm"
      ? !review || reviewError || amountError || feeError || reviewExpired
        ? <PrimaryButton onClick={() => { setStep("form"); setReview(null); setReviewChecked(false) }}>Проверить сумму и комиссию</PrimaryButton>
        : !reviewChecked
          ? <PrimaryButton disabled>Сверьте данные</PrimaryButton>
          : <PrimaryButton disabled={submitting} onClick={() => { void send().catch(() => {}) }}>{submitting ? "Проверяем и отправляем…" : "Подтвердить отправку"}</PrimaryButton>
      : <PrimaryButton onClick={() => {
        if (step === "done") { writeOutcome(network.id, token.address, address, null); setStoredOutcome(null) }
        changeOpen(false)
      }}>{step === "uncertain" ? "Закрыть и проверить историю" : "Готово"}</PrimaryButton>

  return (
    <Sheet open={open && !choosingAsset} onOpenChange={changeOpen} className={discardDraftOpen ? undefined : "wallet-send-sheet"} fullscreen={!discardDraftOpen && step === "form"} fitDesktop headerAction={step === "form" && !recipientScanning && !discardDraftOpen && !helpVisible ? <TransferHelpButton id={helpButtonId} onClick={openHelp} /> : undefined} returnFocusLabel="Отправить" expanded={!discardDraftOpen && (step === "form" || step === "confirm")} title={helpVisible ? "О переводе" : discardDraftOpen ? "Сбросить черновик?" : { form: "Отправить", confirm: "Обзор", done: "Итог", uncertain: "Статус" }[step]} onBack={helpVisible ? returnFromHelp : discardDraftOpen ? undefined : step === "form" ? () => {
      if (recipientScanning) {
        returnFromScanner()
      } else changeOpen(false)
    } : step === "confirm" ? () => { cancelPreflight(); setStep("form") } : undefined} footer={helpVisible ? undefined : discardDraftOpen ? <div ref={draftActions} className="wallet-transfer-draft-actions"><PrimaryButton onClick={resumeDraft}>Продолжить перевод</PrimaryButton><SecondaryButton onClick={() => { cancelPreflight(); setDiscardDraftOpen(false); onOpenChange(false) }}>Сбросить черновик</SecondaryButton></div> : step === "form" && recipientScanning ? undefined : footer}>
      {helpVisible ? <div ref={helpBody}><TransferHelp network={networkLabel(network)} symbol={token.symbol}><p>Для комиссии нужен {network.native.symbol}, даже если вы отправляете {token.symbol}.</p></TransferHelp></div> : null}
      <div hidden={helpVisible}>
      {discardDraftOpen ? <p className="wallet-transfer-draft-note">Адрес и сумма будут очищены.</p> : step === "form" ? (
        recipientScanning ? <div className="flex flex-col gap-4 pb-2">
          <QrScanControl autoStart onScan={(raw) => { try { setTo(addressForNetwork(raw, network)); setScanError(""); setTouched(true); setRecipientScanning(false); setPasteFailed(false); return null } catch (cause) { const message = (cause as Error).message; setScanError(message); return message } }} />
          <SecondaryButton onClick={returnFromScanner}>Ввести адрес вручную</SecondaryButton>
        </div> : <form ref={draftForm} className="wallet-send-form" onSubmit={(e) => { e.preventDefault(); next() }}>
          <TransferAssetCard icon={<CoinIcon symbol={token.symbol} networkId={network.id} size={36} />} symbol={token.symbol} network={networkLabel(network)} balance={balance !== undefined ? formatCoin(balance, token.decimals, token.symbol) : "Баланс уточняется"} onSelect={onChangeAsset ? chooseAsset : undefined} />
          <section className="wallet-send-amount-section" aria-label="Сумма перевода">
          <div className="wallet-send-label-row wallet-send-amount-label"><label htmlFor="token-send-amount">Сумма</label></div>
          <div className="wallet-send-amount-field wallet-transfer-field"><input id="token-send-amount" inputMode="decimal" autoComplete="off" value={amountText} onChange={(e) => setAmountText(e.target.value)} onBlur={() => setTouched(true)} placeholder="0.00" aria-invalid={showAmountError} aria-describedby="token-amount-hint" className="wallet-send-amount" /><button type="button" className="wallet-send-unit" disabled={!onChangeAsset} onClick={chooseAsset}>{token.symbol}{onChangeAsset ? <IconChevronDown size={16} /> : null}</button></div>
          {network.environment === "mainnet" ? <p className="wallet-send-fiat">{holding.price === undefined || !Number.isFinite(holding.price) || holding.price <= 0 ? "Курс недоступен" : fiatEstimate !== null && Number.isFinite(fiatEstimate) ? `≈ ${formatUsd(fiatEstimate)}` : " "}</p> : null}
          <div className="wallet-send-fractions">{fractions.map(({ percent, value: part }) => <button type="button" key={percent} disabled={part === null || part <= 0n} onClick={() => { if (part !== null) { setAmountText(fromUnits(part, token.decimals).replace(".", ",")); setTouched(true) } }}><span>{percent === 100 ? "Макс" : `${percent}%`}</span></button>)}</div>
          <p id="token-amount-hint" role={showAmountError ? "alert" : undefined} className={showAmountError ? "wallet-send-error" : "sr-only"}>{showAmountError ? amountError : balance !== undefined ? `Доступно ${formatCoin(balance, token.decimals, token.symbol)}` : "Загружаем баланс токена…"}</p>
          </section>
          <section className="wallet-send-recipient-section" aria-label="Получатель">
          <div className="wallet-send-label-row"><label htmlFor="token-send-to">Кому</label><button type="button" onClick={() => setBookOpen(true)}>Контакты</button></div>
          <TransferRecipientField
            id="token-send-to"
            contact={recipient.exact?.id === selectedContactId ? recipient.exact : undefined}
            label="Адрес получателя"
            value={to}
            onChange={(next) => { setTo(next); setSelectedContactId(undefined); setScanError(""); setPasteFailed(false) }}
            onBlur={() => setTouched(true)}
            placeholder="Адрес"
            invalid={!!scanError || touched && !!toError}
            describedBy="token-send-to-hint"
            onPaste={(next) => { setTo(next); setScanError(""); setTouched(true); setPasteFailed(false) }}
            onPasteError={() => setPasteFailed(true)}
            onScan={() => { cancelPreflight(); setScanError(""); setRecipientScanning(true) }}
          />
          <p id="token-send-to-hint" role={scanError || pasteFailed ? "alert" : undefined} className={scanError || touched && toError || pasteFailed ? "wallet-send-error" : "sr-only"}>{scanError || (pasteFailed ? "Браузер не дал прочитать буфер обмена: вставьте адрес вручную." : touched && toError ? toError : `Отправляйте ${token.symbol} только в сети ${networkLabel(network)}.`)}</p>
          </section>
          <TransferFeeCard value={fee.data !== undefined ? `до ${formatCoin(fee.data.total, network.native.decimals, network.native.symbol)}` : fee.isError ? "Не удалось узнать" : fee.isFetching ? "Считаем…" : "После ввода адреса и суммы"}>
            <p>Комиссия оплачивается в {network.native.symbol} сети {networkLabel(network)}. {nativeBalance !== undefined ? `Доступно ${formatCoin(nativeBalance, network.native.decimals, network.native.symbol)}.` : "Баланс для комиссии уточняется."}</p>
            {fee.data?.createsAccount ? <p>Включает {formatCoin(fee.data.rent, network.native.decimals, network.native.symbol)} за создание счёта получателя.</p> : null}
            {fee.isError ? <ErrorNote message="Не удалось посчитать комиссию сети." onRetry={() => fee.refetch()} /> : null}
          </TransferFeeCard>
          {amountText && balance === undefined && holding.error ? <div className="card"><ErrorNote message={`Баланс ${token.symbol} не загрузился. Повторите запрос.`} onRetry={() => queryClient.invalidateQueries({ queryKey: ["token-balance", network.id, token.address, address] })} /></div> : null}
          {!amountError && feeError ? (
            <div className="card">
              <ErrorNote message={feeError} onRetry={native.isError ? () => native.refetch() : undefined} />
              {!native.isError && insufficientFeeBalance ? (
                <div className="px-4 pb-4"><SecondaryButton onClick={() => setFeeReceiveOpen(true)}>Получить {feeAsset}</SecondaryButton></div>
              ) : null}
            </div>
          ) : null}
          {reviewError ? <div className="card"><ErrorNote message={reviewError} /></div> : null}
        </form>
      ) : step === "confirm" ? (
        <div className="wallet-transfer-review">
          <TransferReviewSummary icon={<CoinIcon symbol={token.symbol} networkId={network.id} size={36} />} amount={formatCoin(review?.amount ?? amount!, token.decimals, token.symbol)} network={networkLabel(network)} />
          {reviewExpired && !submitting ? <p className="wallet-transfer-review-expired" role="status">Срок оценки истёк. Заново проверьте сумму и комиссию.</p> : null}
          <TransferReviewAddress label="Кому" name={recipient.exact?.name ?? "Новый получатель"} address={review?.to ?? to.trim()} recipient />
          <TransferReviewAddress label="Откуда" name="Мой кошелёк" address={review?.sender ?? address} />
          <Group className="wallet-transfer-review-cost">
            <Row label="Расходы сети">{review ? `до ${formatCoin(review.fee, network.native.decimals, network.native.symbol)}` : "нужно пересчитать"}</Row>
            <Row label="Всего с комиссией">{review ? `${formatCoin(review.amount, token.decimals, token.symbol)} + до ${formatCoin(review.fee, network.native.decimals, network.native.symbol)}` : "нужно пересчитать"}</Row>
          </Group>
          {recipient.similar ? <div role="alert" className="card border border-[var(--orange)] px-4 py-3"><p className="t-label1 text-[var(--orange)]">Адрес похож на сохранённый</p><p className="t-body2 c-2">Похож на «{recipient.similar.name}», но это другой адрес. Сверьте все символы.</p></div> : null}
          <p className="wallet-transfer-review-warning text-[var(--orange)]">Отправленный перевод нельзя отменить.</p>
          <label className="wallet-transfer-review-check"><input type="checkbox" checked={reviewChecked} onChange={(event) => setReviewChecked(event.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--blue)]" /><span className="t-body2">Я сверил сеть, полный адрес, сумму и максимум комиссии.</span></label>
          <div className="wallet-transfer-review-notes">
            <details>
              <summary>Что проверено перед подписью</summary>
              <p>{network.family === "evm" ? "Проверены адрес, балансы, комиссия и предварительное выполнение перевода." : "Проверены адрес, балансы и оценка комиссии."} Владелец адреса и окончательный статус в сети неизвестны.</p>
              {network.environment === "mainnet" ? <p>Оценка действительна 30 секунд. Баланс и комиссия проверяются перед подписью.</p> : null}
              <TransferReviewAddress label={network.family === "solana" ? "Адрес mint" : "Контракт токена"} name={token.symbol} address={review?.tokenAddress ?? token.address} />
            </details>
          </div>
          {reviewError ? <div className="card"><ErrorNote message={reviewError} /></div> : null}
          {error ? <div className="card"><ErrorNote message={error} /></div> : null}
        </div>
      ) : step === "uncertain" ? (
        <div className="flex flex-col items-center gap-4 pt-4 pb-2 text-center"><CoinIcon symbol={token.symbol} networkId={network.id} size={64} /><p className="t-h2">Исход пока неизвестен</p><p className="t-body2 c-2 max-w-[340px]">{error} Повторная отправка здесь остановлена, чтобы не отправить токены дважды.</p>{network.explorer.url ? <a href={network.explorer.address(address)} target="_blank" rel="noopener noreferrer" className="t-label1 inline-flex min-h-11 items-center gap-2 text-[var(--blue)]">Проверить адрес в {network.explorer.name}<IconExternal size={18} /></a> : null}{network.environment === "mainnet" ? <TransferRecoveryNotice recovery={recovery} onResolved={() => { writeOutcome(network.id, token.address, address, null); setStoredOutcome(null); setStep("form"); setTo(""); setAmountText(""); setError(null); setReview(null) }} /> : storedOutcome ? <SecondaryButton onClick={() => { writeOutcome(network.id, token.address, address, null); setStoredOutcome(null); setStep("form"); setTo(""); setAmountText(""); setError(null); setReview(null) }}>Я проверил историю · новый перевод</SecondaryButton> : null}</div>
      ) : (
        <>
          <TransferReceipt result={result} confirmed={receipt.status === "confirmed" || journalStatus === "confirmed"} failed={receipt.status === "failed" || journalStatus === "failed"} unavailable={receipt.unavailable} amount={amount !== null ? formatCoin(amount, token.decimals, token.symbol) : ""} network={networkLabel(network)} from={address} to={to.trim()} icon={<CoinIcon symbol={token.symbol} networkId={network.id} size={64} />} />
          {recovery.blocked ? <TransferRecoveryNotice recovery={recovery} knownResult={result ?? undefined} onResolved={() => { writeOutcome(network.id, token.address, address, null); setStoredOutcome(null); setError(null); setReview(null); setStep("form"); setTo(""); setAmountText("") }} /> : null}
        </>
      )}
      </div>
      <AddressBookSheet open={bookOpen} onOpenChange={setBookOpen} network={network} onSelect={(contact) => { setTo(contact.address); setSelectedContactId(contact.id); setTouched(true); setScanError(""); setPasteFailed(false) }} />
      {open && step === "form" && feeReceiveOpen ? <ReceiveSheet open onOpenChange={(next) => { setFeeReceiveOpen(next); if (!next) void native.refetch() }} network={network} address={address} /> : null}
    </Sheet>
  )
}
