import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Address, Hex } from "viem"
import { chainData, tokensOf, useNetworkSettings } from "@/lib/chains"
import { formatCoin, fromUnits, toUnits } from "@/lib/format"
import { useAccounts } from "../accounts"
import { useBalance } from "../data"
import { DEMO_ADDRESSES } from "../demo"
import { IconExternal, IconSwap, IconWarning } from "../glyph"
import { SceneArt } from "../art/scenes"
import { CoinIcon } from "../marks"
import { assetName } from "../assetNames"
import { NeedWalletSheet } from "../onboarding/Onboarding"
import { BroadcastUncertainError, PendingSwapError } from "../vault/signers"
import { useVault } from "../vault"
import { assertNoPendingRevoke } from "../allowances/pending"
import { assertNoPendingTransfer } from "../transfers/pending"
import { ConfirmSwipe, ErrorNote, Group, PrimaryButton, Row, Screen, SectionHeading, SecondaryButton, Sheet, Skeleton } from "../ui"
import { approveMainnet, assertMainnetPlainAccount, estimateMainnetFee, estimateNativeSwapMaximum, executeMainnet, getMainnetQuote, MAINNET, MAINNET_QUOTE_TTL, MAINNET_SWAP_PAUSE_REASON, MAINNET_SWAP_SIGNING_ENABLED, mainnetAllowance, mainnetDelivered, mainnetReceipt, UNISWAP_ROUTER, type MainnetAsset, type MainnetQuote } from "./mainnet"
import { claimPendingSwap, clearPendingSwapIfCurrent, PENDING_SWAP_KEY, readPendingSwap, updatePendingSwap, withSwapSigningLock, type PendingSwap } from "./pending"
import { SwapActionFooter } from "./ActionFooter"
import { SwapAmountPanel, SwapAssetChoice, useSwapCoinFlight } from "./SwapFields"
import "./swap-screen.css"

type Reviewed = { quote: MainnetQuote; fee: Awaited<ReturnType<typeof estimateMainnetFee>>; needsApproval: boolean; allowance: bigint | null; openedAt: number }
const DRAFT_KEY = "exm.mainnet.swap.draft.v1"
const assets = [
  { id: "eth", symbol: "ETH" as const, network: MAINNET, decimals: 18 },
  { id: "usdc", symbol: "USDC" as const, network: MAINNET, decimals: 6 },
  { id: "dai", symbol: "DAI" as const, network: MAINNET, decimals: 18 },
]
type Asset = (typeof assets)[number]
const verifiedPair = (from: Asset, to: Asset) => from.network.id === "ethereum-mainnet" && to.network.id === "ethereum-mainnet" && from.id !== to.id && (from.symbol === "ETH" || to.symbol === "ETH")
function draft(): { input: string; output: string; amount: string } {
  const empty = { input: "eth", output: "usdc", amount: "" }
  try {
    const value = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null")
    if (!assets.some((asset) => asset.id === value?.input) || !assets.some((asset) => asset.id === value?.output) || value.input === value.output || typeof value.amount !== "string") return empty
    return { input: value.input, output: value.output, amount: value.amount }
  } catch { return empty }
}
const display = (n: bigint, symbol: MainnetAsset) => formatCoin(n, symbol === "ETH" || symbol === "DAI" ? 18 : 6, symbol, symbol === "ETH" || symbol === "DAI" ? 6 : 2)
const feeDisplay = (n: bigint) => formatCoin(n, 18, "ETH", 8)

/** A separate mainnet journey: no Sepolia quote or signer can enter this component. */
export function MainnetSwapScreen({ request }: { request?: string }) {
  const networks = useNetworkSettings()
  const { accounts } = useAccounts()
  const demoAccount = !!accounts.evm?.address && DEMO_ADDRESSES.some((address) => address.toLowerCase() === accounts.evm?.address.toLowerCase())
  const owner = demoAccount ? undefined : accounts.evm?.address as Address | undefined
  const ownerKey = owner?.toLowerCase() ?? null
  const ownerRef = useRef(ownerKey)
  ownerRef.current = ownerKey
  const { keys, createSigningGuard } = useVault()
  const canSign = !demoAccount && accounts.evm?.source === "wallet" && !!keys
  const queryClient = useQueryClient()
  const [inputId, setInputId] = useState(() => draft().input)
  const [outputId, setOutputId] = useState(() => draft().output)
  const [amount, setAmount] = useState(() => draft().amount)
  const [picker, setPicker] = useState<"input" | "output" | null>(null)
  const [sheet, setSheet] = useState<"review" | "need" | null>(null)
  const [review, setReview] = useState<Reviewed | null>(null)
  const [expired, setExpired] = useState(false)
  const [expiredQuoteAt, setExpiredQuoteAt] = useState<number | null>(null)
  const [pendingState, setPendingState] = useState<{ owner: string | null; item: PendingSwap | null }>(() => ({ owner: ownerKey, item: readPendingSwap(owner) }))
  const pending = pendingState.owner === ownerKey ? pendingState.item : readPendingSwap(owner)
  const [hash, setHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkingHash, setCheckingHash] = useState<string | null>(null)
  const [maximumBusy, setMaximumBusy] = useState(false)
  const [maximumError, setMaximumError] = useState<string>()
  const maximumRead = useRef<AbortController | null>(null)
  const sending = useRef(false)
  const [dismissedRequest, setDismissedRequest] = useState(false)
  const requestedSymbol = /^(buy|sell):([A-Za-z0-9]+)$/.exec(request ?? "")?.[2]?.toUpperCase()
  const unsupportedRequest = !!requestedSymbol && !["ETH", "USDC", "DAI"].includes(requestedSymbol) && !dismissedRequest
  const input = assets.find((a) => a.id === inputId) ?? assets[0]
  const output = assets.find((a) => a.id === outputId) ?? assets[1]
  const flight = useSwapCoinFlight(input.id, output.id)
  const mainnetEnabled = networks.isEnabled(MAINNET.id)
  const readableRoute = verifiedPair(input, output) && mainnetEnabled && !unsupportedRequest
  const available = MAINNET_SWAP_SIGNING_ENABLED && readableRoute
  const inputSymbol: MainnetAsset = input.symbol
  const outputSymbol: MainnetAsset = output.symbol
  const amountIn = useMemo(() => { try { return amount && amount.length <= 79 ? toUnits(amount, input.decimals) : null } catch { return null } }, [amount, input.decimals])
  const nativeBalance = useBalance(input.network, owner)
  const tokenBalance = useQuery({
    queryKey: ["mainnet-swap", "balance", input.network.id, input.symbol, owner],
    queryFn: ({ signal }) => chainData(input.network).getTokenBalance!(owner!, tokensOf(input.network).find((token) => token.symbol === input.symbol)!, signal),
    enabled: !!owner && input.symbol !== "ETH",
    staleTime: 15_000,
  })
  const balance = input.symbol === "ETH" ? nativeBalance.data?.native : tokenBalance.data
  const balanceQuery = input.symbol === "ETH" ? nativeBalance : tokenBalance
  const quote = useQuery({
    queryKey: ["mainnet-swap", "quote", input.network.id, output.network.id, inputSymbol, outputSymbol, amountIn?.toString(), owner],
    queryFn: ({ signal }) => getMainnetQuote(inputSymbol, outputSymbol, amountIn!, owner!, signal),
    enabled: readableRoute && !!owner && amountIn !== null && amountIn > 0n && !pending && !hash,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const q = readableRoute && quote.data?.amountIn === amountIn && quote.data?.input === inputSymbol && quote.data?.output === outputSymbol && quote.data?.owner.toLowerCase() === owner?.toLowerCase() ? quote.data : undefined
  const quotedAt = q?.receivedAt
  const quoteIsExpired = !!q && (expiredQuoteAt === q.receivedAt || Date.now() - q.receivedAt >= MAINNET_QUOTE_TTL)
  useEffect(() => {
    if (quotedAt === undefined) return
    const timer = window.setTimeout(() => setExpiredQuoteAt(quotedAt), Math.max(0, MAINNET_QUOTE_TTL - (Date.now() - quotedAt)))
    return () => window.clearTimeout(timer)
  }, [quotedAt])
  const allowance = useQuery({
    queryKey: ["mainnet-swap", "allowance", owner, inputSymbol],
    queryFn: () => mainnetAllowance(owner!, inputSymbol),
    enabled: readableRoute && inputSymbol !== "ETH" && !!owner && !!q,
    staleTime: 5_000,
    retry: false,
  })
  const needsApproval = inputSymbol !== "ETH" && !!q && allowance.data !== undefined && allowance.data < q.amountIn
  const fee = useQuery({
    queryKey: ["mainnet-swap", "fee", q?.receivedAt, needsApproval, owner],
    queryFn: () => estimateMainnetFee(q!, needsApproval),
    enabled: !!q && (inputSymbol === "ETH" || allowance.data !== undefined) && !pending,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const ethBalance = useBalance(MAINNET, owner)
  const gasBalance = ethBalance.data?.native
  const accountCheck = useQuery({ queryKey: ["mainnet-swap", "plain-account", owner], queryFn: async () => { await assertMainnetPlainAccount(owner!); return true }, enabled: MAINNET_SWAP_SIGNING_ENABLED && !!owner && mainnetEnabled, staleTime: 10_000, retry: false })
  const insufficientInput = amountIn !== null && balance !== undefined && amountIn > balance
  const insufficientGas = q && fee.data && gasBalance !== undefined && gasBalance < fee.data.total + (inputSymbol === "ETH" ? q.amountIn : 0n)
  const problem = !amount ? null : amountIn === null ? "Введите корректную сумму" : amountIn <= 0n ? "Сумма должна быть больше нуля" : insufficientInput ? `Недостаточно ${input.symbol}` : insufficientGas ? "Не хватает ETH на сумму и комиссию сети" : null
  const ready = available && accountCheck.isSuccess && !!q && !!fee.data && balance !== undefined && gasBalance !== undefined &&
    !balanceQuery.isError && !ethBalance.isError && !quote.isError && !fee.isError && (inputSymbol === "ETH" || allowance.isSuccess) &&
    !problem && !pending && !maximumBusy && Date.now() - q.receivedAt < MAINNET_QUOTE_TTL

  useLayoutEffect(() => {
    setMaximumBusy(false)
    setMaximumError(undefined)
    return () => {
      maximumRead.current?.abort()
      maximumRead.current = null
    }
  }, [ownerKey, inputId, outputId, readableRoute, request, pending])
  useEffect(() => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ input: inputId, output: outputId, amount })) } catch { /* optional draft */ } }, [inputId, outputId, amount])
  useEffect(() => {
    const sync = () => setPendingState({ owner: ownerKey, item: readPendingSwap(owner) })
    const onStorage = (event: StorageEvent) => { if (event.key === PENDING_SWAP_KEY || event.key === null) sync() }
    sync()
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [owner, ownerKey])
  useEffect(() => { setHash(null); setError(null); setReview(null); setSheet(null) }, [inputId, outputId, amount])
  useEffect(() => {
    const [action, symbol] = (request ?? "").split(":")
    setDismissedRequest(false)
    if ((action === "buy" || action === "sell") && ["ETH", "USDC", "DAI"].includes(symbol)) { setInputId(action === "buy" ? (symbol === "ETH" ? "usdc" : "eth") : symbol.toLowerCase()); setOutputId(action === "buy" ? symbol.toLowerCase() : symbol === "ETH" ? "usdc" : "eth"); setAmount("") }
  }, [request])
  useEffect(() => {
    if (!review) { setExpired(false); return }
    const delay = Math.max(0, MAINNET_QUOTE_TTL - (Date.now() - review.quote.receivedAt))
    const timer = window.setTimeout(() => setExpired(true), delay)
    return () => window.clearTimeout(timer)
  }, [review])

  const showPendingFor = (recordOwner: Address, next: PendingSwap | null) => {
    if (ownerRef.current === recordOwner.toLowerCase()) setPendingState({ owner: recordOwner.toLowerCase(), item: next })
  }
  const clearPendingFor = (recordOwner: Address, expected: PendingSwap) => {
    if (ownerRef.current !== recordOwner.toLowerCase()) throw new Error("Адрес кошелька изменился. Откройте операцию заново.")
    clearPendingSwapIfCurrent(recordOwner, expected)
    showPendingFor(recordOwner, null)
  }
  const openReview = () => {
    if (!ready || !q || !fee.data || !owner) { if (q && Date.now() - q.receivedAt >= MAINNET_QUOTE_TTL) { setError("Курс устарел. Обновите расчёт."); void quote.refetch() } return }
    setReview({ quote: q, fee: fee.data, needsApproval, allowance: inputSymbol === "ETH" ? null : allowance.data ?? null, openedAt: Date.now() })
    setExpired(false); setError(null); setSheet("review")
  }
  const run = async () => {
    if (sending.current || pending) return
    const r = review
    if (!r || !owner || !keys || expired || Date.now() - r.quote.receivedAt >= MAINNET_QUOTE_TTL || r.quote.owner.toLowerCase() !== owner.toLowerCase()) { setExpired(true); throw new Error("Курс устарел. Обновите расчёт.") }
    const operationOwner = owner
    const guard = createSigningGuard(keys)
    const step = r.needsApproval ? "approve" : "swap"
    const operationId = crypto.randomUUID()
    sending.current = true
    let reported = false
    setError(null)
    try {
      return await withSwapSigningLock(operationOwner, async () => {
        // The lock and durable claim both have to succeed before the first RPC call.
        assertNoPendingRevoke(operationOwner)
        assertNoPendingTransfer(operationOwner, MAINNET.id)
        let current: PendingSwap = { id: operationId, step, hash: null, message: "Проверяем исход операции" }
        claimPendingSwap(operationOwner, current)
        showPendingFor(operationOwner, current)
        const update = (patch: Parameters<typeof updatePendingSwap>[2]) => {
          current = updatePendingSwap(operationOwner, current, patch)
          showPendingFor(operationOwner, current)
        }
        const trackHash = (signedHash: Hex) => update({ hash: signedHash })
        const clear = () => {
          clearPendingSwapIfCurrent(operationOwner, current)
          showPendingFor(operationOwner, null)
        }
        try {
          const h = step === "approve"
            ? await approveMainnet(keys, r.quote, r.fee.approvalGas, r.fee.feePerGas, r.fee.priorityFee, guard, trackHash)
            : await executeMainnet(keys, r.quote, r.fee.swapGas, r.fee.feePerGas, r.fee.priorityFee, (delivery) => {
              update({ delivery: { owner: delivery.owner, output: delivery.output, minimumOut: delivery.minimumOut.toString() } })
            }, guard, trackHash)
          try { clear() }
          catch {
            if (ownerRef.current === operationOwner.toLowerCase()) setError("Хэш получен, но не удалось обновить запись операции. Проверьте её в обозревателе.")
            return
          }
          if (step === "approve") {
            if (ownerRef.current === operationOwner.toLowerCase()) { setReview(null); setSheet(null) }
            await queryClient.invalidateQueries({ queryKey: ["mainnet-swap", "allowance", owner, r.quote.input] })
            void quote.refetch()
          } else {
            if (ownerRef.current === operationOwner.toLowerCase()) setHash(h)
            void queryClient.invalidateQueries({ queryKey: ["balance", MAINNET.id] })
            void queryClient.invalidateQueries({ queryKey: ["activity", MAINNET.id] })
          }
        } catch (e) {
          reported = true
          if (e instanceof PendingSwapError || e instanceof BroadcastUncertainError) {
            const message = e instanceof PendingSwapError ? "Пока не удалось проверить зачисление по квитанции Ethereum." :
              current.hash ? "Ответ узла потерян. Хэш операции сохранён." : "Ответ узла потерян. Проверьте операции этого адреса."
            try { update({ message }) }
            catch {
              if (ownerRef.current === operationOwner.toLowerCase()) setError("Не удалось обновить запись операции. Не закрывайте вкладку до проверки истории и баланса.")
            }
            throw e
          }
          try { clear() } catch { /* keep the durable block until the outcome is checked */ }
          const message = (e as Error).message ?? "Операция не прошла"
          if (ownerRef.current === operationOwner.toLowerCase()) setError(/insufficient|balance/i.test(message) ? "Не хватает ETH на комиссию или сумму" : /revert|simulation|slippage/i.test(message) ? "Сеть отклонила обмен. Обновите курс и попробуйте снова." : message)
          throw e
        }
      })
    } catch (e) {
      if (!reported && ownerRef.current === operationOwner.toLowerCase()) setError((e as Error).message || "Обмен остановлен")
      throw e
    } finally {
      sending.current = false
    }
  }
  const verifyPending = async () => {
    if (!pending?.hash || !owner || checkingHash === pending.hash) return
    const checkingOwner = owner
    const checking = pending
    const recordedHash = pending.hash as Hex
    setCheckingHash(recordedHash)
    setError(null)
    try {
      const receipt = await mainnetReceipt(recordedHash)
      if (ownerRef.current !== checkingOwner.toLowerCase()) return
      const approvalToken = tokensOf(MAINNET).some((token) => (token.symbol === "USDC" || token.symbol === "DAI") && token.address.toLowerCase() === receipt.to?.toLowerCase())
      if (receipt.transactionHash.toLowerCase() !== recordedHash.toLowerCase() || receipt.from.toLowerCase() !== checkingOwner.toLowerCase() || (checking.step === "approve" && !approvalToken) || (checking.step === "swap" && receipt.to?.toLowerCase() !== UNISWAP_ROUTER.toLowerCase())) {
        setError("Хэш не соответствует операции этого адреса. Проверьте его в обозревателе.")
        return
      }
      if (receipt.status !== "success") {
        await withSwapSigningLock(checkingOwner, async () => clearPendingFor(checkingOwner, checking))
        if (ownerRef.current === checkingOwner.toLowerCase()) {
          setSheet(null); setReview(null); setError("Операция отклонена сетью.")
        }
        return
      }
      if (checking.step === "swap") {
        const d = checking.delivery
        if (!d || d.owner.toLowerCase() !== checkingOwner.toLowerCase() || !["ETH", "USDC", "DAI", "USDT"].includes(d.output) || !/^\d+$/.test(d.minimumOut)) {
          setError("Сеть подтвердила операцию, но данные зачисления не сохранены. Проверьте баланс и историю вручную.")
          return
        }
        const delivered = mainnetDelivered({ owner: d.owner as Address, output: d.output, minimumOut: BigInt(d.minimumOut) }, receipt, recordedHash)
        if (!delivered) { setError("Сеть подтвердила операцию, но зачисление пока не подтверждено. Повторную отправку не делайте."); return }
      }
      await withSwapSigningLock(checkingOwner, async () => clearPendingFor(checkingOwner, checking))
      if (ownerRef.current !== checkingOwner.toLowerCase()) return
      setReview(null)
      if (checking.step === "swap") {
        setHash(recordedHash)
        void queryClient.invalidateQueries({ queryKey: ["balance", MAINNET.id] })
        void queryClient.invalidateQueries({ queryKey: ["activity", MAINNET.id] })
      } else setSheet(null)
      void queryClient.invalidateQueries({ queryKey: ["mainnet-swap"] })
    } catch (e) {
      if (ownerRef.current === checkingOwner.toLowerCase()) setError((e as Error).name === "TransactionReceiptNotFoundError" ? "Подтверждение пока не найдено. Проверьте позже." : (e as Error).message || "Не удалось проверить подтверждение.")
    } finally {
      setCheckingHash((active) => active === recordedHash ? null : active)
    }
  }
  const dismissPending = async () => {
    if (!owner || !pending || pending.hash) return
    try { await withSwapSigningLock(owner, async () => clearPendingFor(owner, pending)); setReview(null); setSheet(null); setAmount("") }
    catch (e) { setError((e as Error).message || "Не удалось обновить операцию") }
  }
  const changeAmount = (value: string) => {
    maximumRead.current?.abort()
    maximumRead.current = null
    setMaximumBusy(false)
    setMaximumError(undefined)
    setAmount(value)
  }
  const flip = () => {
    flight.capture()
    setInputId(output.id)
    setOutputId(input.id)
    changeAmount("")
  }
  const choose = (id: string) => {
    if (picker === "input") setInputId(id)
    else setOutputId(id)
    changeAmount("")
    setPicker(null)
  }
  const chooseMaximum = async () => {
    if (!owner || !readableRoute || balance === undefined || balance <= 0n || balanceQuery.isError || pending || maximumRead.current) return
    if (inputSymbol !== "ETH") {
      changeAmount(fromUnits(balance, input.decimals).replace(".", ","))
      return
    }
    const operation = new AbortController()
    maximumRead.current = operation
    setMaximumBusy(true)
    setMaximumError(undefined)
    try {
      const value = await estimateNativeSwapMaximum(outputSymbol, owner, operation.signal)
      if (maximumRead.current === operation && ownerRef.current === ownerKey) setAmount(fromUnits(value, input.decimals).replace(".", ","))
    } catch (cause) {
      if (maximumRead.current !== operation) return
      setMaximumError(cause instanceof Error && /^(Не хватает ETH|Комиссия изменилась|Эта сумма ухудшает курс)/.test(cause.message) ? cause.message : "Не удалось проверить максимум с учётом комиссии. Попробуйте ещё раз.")
    } finally {
      if (maximumRead.current === operation) {
        maximumRead.current = null
        setMaximumBusy(false)
      }
    }
  }


  if (unsupportedRequest) return <Screen className="min-h-svh"><SectionHeading title="Обмен" /><div className="flex flex-col items-center gap-4 pt-10 text-center"><CoinIcon symbol={requestedSymbol!} size={64} /><h2 className="t-h2">{requestedSymbol} пока нельзя обменять</h2><p className="t-body2 c-2 max-w-[320px]">Доступные пары в Ethereum: ETH ↔ USDC и ETH ↔ DAI.</p><SecondaryButton onClick={() => setDismissedRequest(true)}>Выбрать доступную пару</SecondaryButton></div></Screen>

  if (demoAccount) return <Screen className="min-h-svh"><SectionHeading title="Обмен" /><div className="flex flex-col items-center gap-4 pt-10 text-center"><CoinIcon symbol="ETH" networkId={MAINNET.id} size={64} /><h2 className="t-h2">Нужен собственный кошелёк</h2><p className="t-body2 c-2 max-w-[320px]">Создайте или импортируйте кошелёк, чтобы пользоваться обменом.</p><PrimaryButton onClick={() => setSheet("need")}>Создать или импортировать</PrimaryButton></div><NeedWalletSheet open={sheet === "need"} onOpenChange={(open) => setSheet(open ? "need" : null)} action="swap" /></Screen>

  if (!mainnetEnabled) return <Screen className="min-h-svh"><SectionHeading title="Обмен" /><div className="flex flex-col items-center gap-4 pt-10 text-center"><CoinIcon symbol="ETH" networkId={MAINNET.id} size={64} /><h2 className="t-h2">Ethereum выключен</h2><p className="t-body2 c-2 max-w-[320px]">Включите сеть, чтобы получить котировку.</p><PrimaryButton onClick={() => networks.setEnabled(MAINNET.id, true)}>Включить Ethereum</PrimaryButton></div></Screen>

  const amountIssue = !amount ? null : amountIn === null ? "Проверьте формат суммы" : amountIn <= 0n ? "Введите сумму больше нуля" : null
  const quoteHint = maximumBusy ? "Проверяем баланс и комиссию для максимальной суммы."
    : !readableRoute ? "Для этой пары нет котировки. Выберите ETH и USDC или ETH и DAI."
    : !owner ? "Для расчёта нужен адрес Ethereum."
    : amountIssue ?? (!amount ? "Введите сумму, чтобы увидеть курс и комиссию сети." : null)
  const canRefreshQuote = readableRoute && !!owner && !!amount && !amountIssue && !quote.isError

  return <Screen className="swap-screen min-h-svh">
    <SectionHeading title="Обмен" detail={MAINNET_SWAP_SIGNING_ENABLED ? "Ethereum" : "Ethereum · расчёт без отправки"} />
    <div className="swap-layout">
      <div className="swap-order">
        <div className="swap-ticket">
          <SwapAmountPanel label="Отдаёте" htmlFor="mainnet-swap-in"
            balance={<span className="swap-panel-balance" role={balanceQuery.isError ? "alert" : undefined}>
              {balanceQuery.isError ? "Баланс недоступен" : balance !== undefined ? display(balance, input.symbol) : owner ? "Проверяем остаток" : "Нет адреса"}
              {balanceQuery.isError
                ? <button type="button" disabled={balanceQuery.isFetching} aria-label={`Повторить загрузку баланса ${input.symbol}`} onClick={() => void balanceQuery.refetch()}>{balanceQuery.isFetching ? "Проверяем…" : "Повторить"}</button>
                : readableRoute && owner ? <button type="button" disabled={!!pending || maximumBusy || balance === undefined || balance <= 0n} aria-busy={maximumBusy} onClick={() => void chooseMaximum()}>{maximumBusy ? "Считаем…" : "Макс"}</button> : null}
            </span>}
            amount={<input id="mainnet-swap-in" aria-invalid={!!amountIssue} aria-describedby={maximumError ? "swap-maximum-error" : quoteHint ? "swap-amount-hint" : undefined} inputMode="decimal" autoComplete="off" placeholder="0,00" value={amount} onChange={(e) => changeAmount(e.target.value)} disabled={!!pending} className="swap-panel-amount" />}
            asset={<SwapAssetChoice coinRef={flight.inputCoin} symbol={input.symbol} networkId={input.network.id} label="Выбрать монету для обмена" disabled={!!pending} onClick={() => setPicker("input")} />}
          />
          <div className="swap-ticket-seam"><button type="button" onClick={flip} disabled={!!pending} aria-label="Поменять монеты местами" className="swap-flip"><IconSwap size={20} /></button></div>
          <SwapAmountPanel label="Получаете"
            balance={q && !quoteIsExpired ? <span className="swap-panel-balance">Не меньше {display(q.minimumOut, output.symbol)}</span> : undefined}
            amount={<p className="swap-panel-amount" aria-live="polite">{!amount || amountIssue ? <span className="c-2" aria-label="Сумма ещё не рассчитана">—</span> : quote.isFetching && (!q || quoteIsExpired) ? <Skeleton className="h-7 w-24" /> : q ? quoteIsExpired ? <span className="swap-no-quote">Курс устарел</span> : display(q.amountOut, output.symbol).replace(` ${output.symbol}`, "") : <span className="swap-no-quote">Нет курса</span>}</p>}
            asset={<SwapAssetChoice coinRef={flight.outputCoin} symbol={output.symbol} networkId={output.network.id} label="Выбрать монету для получения" disabled={!!pending} onClick={() => setPicker("output")} />}
          />
        </div>
        {maximumError ? <p id="swap-maximum-error" className="swap-amount-hint" data-invalid="true" role="alert">{maximumError}</p> : null}
        {quoteHint && !maximumError ? <p id="swap-amount-hint" className="swap-amount-hint" data-invalid={!maximumBusy && !!amountIssue} role={maximumBusy ? "status" : undefined}>{quoteHint}</p> : null}
        {!MAINNET_SWAP_SIGNING_ENABLED ? <details className="swap-availability"><summary>Почему доступен только расчёт</summary><p>{MAINNET_SWAP_PAUSE_REASON}</p></details> : null}
        {MAINNET_SWAP_SIGNING_ENABLED && problem ? <p role="alert" className="t-body2 px-1 pt-3 text-[var(--red)]">{problem}</p> : null}
        {MAINNET_SWAP_SIGNING_ENABLED && accountCheck.isError ? <div className="card mt-3"><ErrorNote message={(accountCheck.error as Error).message} onRetry={() => accountCheck.refetch()} /></div> : null}
        {quote.isError && readableRoute ? <div className="card mt-3"><ErrorNote message={(quote.error as Error).message} onRetry={() => quote.refetch()} /></div> : null}
        {error ? <div className="card mt-3"><ErrorNote message={error} /></div> : null}
      </div>
      <section className="swap-quote" aria-label="Условия обмена">
        <h2>Условия обмена</h2>
        {q && !quoteIsExpired ? <Group className="swap-quote-facts"><Row label="Маршрут">{q.tool}</Row><Row label="Допуск курса">0,5 %</Row><Row label="Комиссия сети">{fee.data ? `до ${feeDisplay(fee.data.total)}` : fee.isError ? "не удалось узнать" : <Skeleton className="w-24" />}</Row>{fee.isError ? <ErrorNote message="Не удалось оценить комиссию и проверить исполнение. Обмен недоступен." onRetry={() => fee.refetch()} /> : null}</Group> : <dl className="swap-desktop-quote-placeholder"><div><dt>Сеть</dt><dd>Ethereum</dd></div><div><dt>Котировка</dt><dd>{!readableRoute ? "Пара недоступна" : quote.isFetching ? "Рассчитываем…" : quote.isError ? "Не загрузилась" : quoteIsExpired ? "Устарела" : "Ожидает расчёта"}</dd></div></dl>}
      </section>
      <div className="swap-order-footer">
        {pending || available ? <SwapActionFooter>{pending ? <PrimaryButton onClick={() => setSheet("review")}>Проверить операцию</PrimaryButton> : !canSign ? <PrimaryButton onClick={() => setSheet("need")}>Создать или импортировать</PrimaryButton> : <PrimaryButton disabled={!ready} onClick={openReview}>{ready ? "Обменять" : accountCheck.isError ? "Адрес не поддерживается" : !accountCheck.isSuccess ? "Проверяем адрес…" : !amount ? "Введите сумму" : fee.isError ? "Комиссия недоступна" : quote.isError ? "Курс недоступен" : "Считаем курс…"}</PrimaryButton>}</SwapActionFooter> : !MAINNET_SWAP_SIGNING_ENABLED && canRefreshQuote ? <SwapActionFooter>
          <SecondaryButton disabled={quote.isFetching} onClick={() => void quote.refetch()}>
            {quote.isFetching ? "Считаем курс…" : q ? "Обновить курс" : "Рассчитать курс"}
          </SecondaryButton>
        </SwapActionFooter> : null}
      </div>
    </div>
    <NeedWalletSheet open={sheet === "need"} onOpenChange={(open) => setSheet(open ? "need" : null)} action="swap" />
    <Sheet open={!!picker} onOpenChange={(open) => { if (!open) setPicker(null) }} title={picker === "input" ? "Отдать" : "Получить"}><Group header="Ethereum" className="swap-picker-list">{assets.filter((a) => a.id !== (picker === "input" ? output.id : input.id)).map((a) => <button key={a.id} type="button" onClick={() => choose(a.id)} className="swap-picker-row flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left"><CoinIcon symbol={a.symbol} networkId={a.network.id} size={40} /><span className="min-w-0 flex-1"><span className="t-label1 block break-words">{assetName(a.symbol)}</span><span className="t-body2 c-2 block">{a.symbol}</span><span className="t-body3 c-2 block break-words">{verifiedPair(picker === "input" ? a : input, picker === "input" ? output : a) ? "Ethereum · поддерживаемая пара" : "Ethereum · для этой пары нет исполнителя"}</span></span></button>)}</Group></Sheet>
    <Sheet open={sheet === "review"} onOpenChange={(open) => { setSheet(open ? "review" : null); if (!open && !pending && !hash) setReview(null) }} title={hash ? "Результат обмена" : pending ? "Обмен" : "Подтверждение"} subtitle={hash || pending ? undefined : "Ethereum · реальные монеты"} footer={hash ? <PrimaryButton onClick={() => { setHash(null); setAmount(""); setSheet(null) }}>Готово</PrimaryButton> : pending ? pending.hash ? <PrimaryButton disabled={checkingHash === pending.hash} onClick={() => void verifyPending()}>{checkingHash === pending.hash ? "Ищем подтверждение…" : "Проверить подтверждение"}</PrimaryButton> : <PrimaryButton onClick={() => owner && window.open(MAINNET.explorer.address(owner), "_blank", "noopener,noreferrer")}>Проверить адрес</PrimaryButton> : expired || !review ? <PrimaryButton onClick={() => { setReview(null); setSheet(null); void quote.refetch() }}>Обновить курс</PrimaryButton> : <div className="flex flex-col gap-3"><ConfirmSwipe key={`${review.quote.receivedAt}:${review.needsApproval}`} label={review.needsApproval ? "Проведите, чтобы разрешить" : "Проведите, чтобы обменять"} doneLabel="Отправлено" errorLabel="Не отправлено" onConfirm={run} resetAfter={1200} /><SecondaryButton onClick={() => void run().catch(() => {})}>{review.needsApproval ? "Разрешить нажатием" : "Обменять нажатием"}</SecondaryButton></div>}>
      {hash ? <div className="flex flex-col items-center gap-4 pt-4 text-center"><SceneArt variant="sent" size={112} /><p className="t-h2">Транзакция подтверждена</p><p className="t-body2 c-2">Зачисление проверено по квитанции Ethereum.</p><a href={MAINNET.explorer.tx(hash)} target="_blank" rel="noopener noreferrer" className="t-label1 inline-flex items-center gap-2 text-[var(--blue)]">Посмотреть операцию<IconExternal size={18} /></a></div> : pending ? <div className="flex flex-col items-center gap-4 pt-4 text-center"><IconWarning size={40} className="text-[var(--orange)]" /><p className="t-h2">Проверяем результат</p><p className="t-body2 c-2">{pending.message}</p>{pending.hash ? <a href={MAINNET.explorer.tx(pending.hash)} target="_blank" rel="noopener noreferrer" className="t-label1 inline-flex items-center gap-2 text-[var(--blue)]">Операция в обозревателе<IconExternal size={18} /></a> : owner ? <a href={MAINNET.explorer.address(owner)} target="_blank" rel="noopener noreferrer" className="t-label1 inline-flex items-center gap-2 text-[var(--blue)]">Адрес в обозревателе<IconExternal size={18} /></a> : null}<p className="t-body3 c-2">{pending.hash ? "Новый обмен будет доступен после проверки этой операции." : "Сверьте операции и баланс адреса перед новой отправкой."}</p>{error ? <ErrorNote message={error} /> : null}{!pending.hash ? <SecondaryButton onClick={dismissPending}>Я проверил результат</SecondaryButton> : null}</div> : review ? <div className="flex flex-col gap-4 pb-2"><Group><Row label="Отдаёте">{display(review.quote.amountIn, review.quote.input)}</Row><Row label="Получаете">≈ {display(review.quote.amountOut, review.quote.output)}</Row><Row label="Не меньше">{display(review.quote.minimumOut, review.quote.output)}</Row><Row label="Сеть">Ethereum</Row><Row label="Маршрут">{review.quote.tool}</Row><Row label={review.needsApproval ? "Комиссия разрешения" : "Комиссия сети"}>до {feeDisplay(review.fee.total)}</Row></Group><div className="card p-4"><p className="t-label1">Что произойдёт</p><p className="t-body2 c-2 mt-1">{review.needsApproval ? `Вы разрешите контракту обмена списать ровно ${display(review.quote.amountIn, review.quote.input)}. Сам обмен будет отдельной операцией после нового расчёта.` : `Контракт получит ${display(review.quote.amountIn, review.quote.input)} и отправит на ваш адрес не меньше ${display(review.quote.minimumOut, review.quote.output)}.`}</p><p className="t-body3 c-2 mt-3">Адрес списания и получения</p><p className="mono t-body3 mt-1 break-all">{review.quote.owner}</p><p className="t-body3 c-2 mt-3">Контракт Uniswap V3</p><p className="mono t-body3 mt-1 break-all">{review.quote.tx.to}</p><p className="t-body3 c-2 mt-3">Проверка</p><p className="t-body3 mt-1">EXM собрал команду обмена локально: сеть, монеты, адрес, сумма, минимум и срок действия включены в операцию.</p></div><div role="note" className="card flex gap-2 p-4 text-[var(--orange)]"><IconWarning size={20} className="shrink-0" /><p className="t-body2">Реальные монеты. После подтверждения в сети обмен нельзя отменить. Проверьте сумму, минимум получения и комиссию перед подписью.</p></div>{review.allowance !== null && review.allowance > review.quote.amountIn ? <div role="alert" className="card p-4 text-[var(--orange)]"><p className="t-label1">Уже есть разрешение больше суммы обмена</p><p className="t-body2 mt-1">Ранее контракту разрешили списать {display(review.allowance, review.quote.input)}. Этот лимит останется после сделки и может быть использован снова.</p><p className="mono t-body3 mt-2 break-all">{review.quote.spender}</p></div> : null}{review.needsApproval ? <p className="t-body2 c-2 px-1">Сначала отдельная операция разрешит списать ровно {display(review.quote.amountIn, review.quote.input)}. После её подтверждения курс и комиссия обмена будут рассчитаны заново.</p> : null}{expired ? <ErrorNote message="Курс устарел. Обновите расчёт." /> : null}{error ? <ErrorNote message={error} /> : null}</div> : null}
    </Sheet>
  </Screen>
}
