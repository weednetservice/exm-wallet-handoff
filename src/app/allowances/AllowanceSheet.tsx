import { useEffect, useRef, useState } from "react"
import { useQueries, useQueryClient } from "@tanstack/react-query"
import type { Address, Hex } from "viem"
import { formatCoin, shortAddress } from "@/lib/format"
import { isBroadcastDisabled } from "@/lib/chains"
import { useAccounts } from "../accounts"
import { CoinIcon } from "../marks"
import { BroadcastUncertainError, SigningSessionExpiredError } from "../vault/signers"
import { useVault } from "../vault"
import { assertNoPendingSwap } from "../swap/pending"
import { assertNoPendingTransfer } from "../transfers/pending"
import { ErrorNote, Group, PrimaryButton, Row, SecondaryButton, Sheet, Skeleton } from "../ui"
import { ETHEREUM, REVOKE_REVIEW_TTL, allowanceTargets, currentAllowance, executeRevoke, prepareRevoke, revokeReceipt, waitRevokeReceipt, type AllowanceTarget, type RevokeReview } from "./mainnet"
import "./allowance-sheet.css"
import { claimPendingRevoke, clearPendingRevokeIfCurrent, persistPendingRevoke, readPendingRevoke, withRevokeSigningLock, type PendingRevoke } from "./pending"

const keyOf = (target: AllowanceTarget) => `${target.token.address.toLowerCase()}:${target.spender.address.toLowerCase()}`
const allowanceText = (n: bigint, target: AllowanceTarget) => n >= (1n << 255n)
  ? "Безлимитное разрешение"
  : formatCoin(n, target.token.decimals, target.token.symbol, 6)

export function AllowanceSheet({ open, onOpenChange, onBack }: { open: boolean; onOpenChange: (open: boolean) => void; onBack: () => void }) {
  const readOnly = isBroadcastDisabled()
  const { accounts } = useAccounts()
  const vault = useVault()
  const owner = vault.status === "unlocked" && accounts.evm?.source === "wallet" ? accounts.evm.address as Address : undefined
  const ownerKey = owner?.toLowerCase() ?? null
  const ownerRef = useRef(ownerKey)
  ownerRef.current = ownerKey
  const mounted = useRef(false)
  const openRef = useRef(open)
  openRef.current = open
  const flowEpoch = useRef(0)
  const cancelPreflight = () => { flowEpoch.current += 1 }
  const changeOpen = (next: boolean) => {
    if (!next) cancelPreflight()
    onOpenChange(next)
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; flowEpoch.current += 1 }
  }, [])
  useEffect(() => { if (!open) cancelPreflight() }, [open])
  const targets = allowanceTargets()
  const queryClient = useQueryClient()
  const queries = useQueries({ queries: targets.map((target) => ({
    queryKey: ["allowance-manager", owner, keyOf(target)],
    queryFn: () => currentAllowance(owner!, target),
    enabled: open && !!owner,
    staleTime: 10_000,
    refetchInterval: open ? 30_000 : false,
    retry: false,
  })) })
  const [review, setReview] = useState<RevokeReview | null>(null)
  const [pendingState, setPendingState] = useState<{ owner: string | null; item: PendingRevoke | null }>(() => ({ owner: ownerKey, item: readPendingRevoke(owner) }))
  const pending = pendingState.owner === ownerKey ? pendingState.item : readPendingRevoke(owner)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [checkedUnknown, setCheckedUnknown] = useState(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!open || !review) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [open, review])
  useEffect(() => { setPendingState({ owner: ownerKey, item: readPendingRevoke(owner) }); setReview(null); setError(""); setNotice("") }, [owner, ownerKey])
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["allowance-manager", owner] })
  const showPendingFor = (recordOwner: Address, item: PendingRevoke | null) => {
    if (ownerRef.current === recordOwner.toLowerCase()) { setPendingState({ owner: recordOwner.toLowerCase(), item }); setCheckedUnknown(false) }
  }
  const setOutcomeFor = (recordOwner: Address, item: PendingRevoke | null) => { persistPendingRevoke(recordOwner, item); showPendingFor(recordOwner, item) }
  const clearOutcomeFor = (recordOwner: Address, expected: PendingRevoke) => {
    if (ownerRef.current !== recordOwner.toLowerCase()) throw new Error("Адрес кошелька изменился. Откройте отзыв заново.")
    clearPendingRevokeIfCurrent(recordOwner, expected)
    showPendingFor(recordOwner, null)
  }

  const openReview = async (target: AllowanceTarget) => {
    if (!owner || busy || pending) return
    const reviewingOwner = owner
    const epoch = flowEpoch.current
    const stillActive = () => mounted.current && openRef.current && flowEpoch.current === epoch && ownerRef.current === reviewingOwner.toLowerCase()
    setBusy(true); setError(""); setNotice("")
    try { const next = await prepareRevoke(reviewingOwner, target); if (stillActive()) setReview(next) }
    catch (e) { if (stillActive()) setError((e as Error).message || "Не удалось проверить разрешение") }
    finally { setBusy(false) }
  }
  const checkPending = async () => {
    if (!pending || !owner || busy) return
    const checkingOwner = owner
    const checking = pending
    setBusy(true); setError(""); setNotice("")
    const target = targets.find((t) => t.token.address.toLowerCase() === checking.token.toLowerCase() && t.spender.address.toLowerCase() === checking.spender.toLowerCase())
    if (!target) { setBusy(false); setError("Операция не совпала с известным токеном и контрактом. Проверьте адрес в обозревателе."); return }
    try {
      if (checking.hash) {
        const receipt = await revokeReceipt(checking.hash as Hex)
        if (ownerRef.current !== checkingOwner.toLowerCase()) return
        if (receipt.from.toLowerCase() !== checkingOwner.toLowerCase() || receipt.to?.toLowerCase() !== target.token.address.toLowerCase()) throw new Error("Хэш относится к другой операции. Проверьте его в обозревателе.")
        if (receipt.status === "reverted") { await withRevokeSigningLock(checkingOwner, async () => clearOutcomeFor(checkingOwner, checking)); setNotice("Сеть отклонила отзыв. Разрешение не изменилось."); refresh(); return }
      }
      const allowance = await currentAllowance(checkingOwner, target)
      if (ownerRef.current !== checkingOwner.toLowerCase()) return
      if (allowance === 0n) { await withRevokeSigningLock(checkingOwner, async () => clearOutcomeFor(checkingOwner, checking)); setReview(null); setNotice("Разрешение отозвано. Текущий лимит — 0."); refresh() }
      else {
        setNotice(checking.hash ? "Операция ещё не подтверждена или лимит остаётся активным. Проверьте её в обозревателе." : "Лимит всё ещё действует. Проверьте исход попытки отправки в обозревателе адреса.")
        setCheckedUnknown(!checking.hash)
      }
    } catch (e) { if (ownerRef.current === checkingOwner.toLowerCase()) setError((e as Error).message || "Не удалось проверить операцию") }
    finally { setBusy(false) }
  }
  const run = async () => {
    if (!review || !vault.keys || !owner || busy || pending) return
    if (Date.now() - review.receivedAt > REVOKE_REVIEW_TTL) { setError("Комиссия устарела. Пересчитайте отзыв."); return }
    const operationOwner = owner
    const operationReview = review
    const operationKeys = vault.keys
    const epoch = flowEpoch.current
    const sessionGuard = vault.createSigningGuard(operationKeys)
    const stillActive = () => mounted.current && openRef.current && flowEpoch.current === epoch && ownerRef.current === operationOwner.toLowerCase()
    const guard = () => {
      if (!stillActive()) throw new SigningSessionExpiredError()
      sessionGuard()
    }
    setBusy(true); setError(""); setNotice("")
    const entry: PendingRevoke = { owner: operationOwner, token: operationReview.token.address, spender: operationReview.spender.address, hash: null, at: Date.now() }
    let saved: PendingRevoke | null = null
    try {
      await withRevokeSigningLock(operationOwner, async () => {
        guard()
        assertNoPendingSwap(operationOwner)
        assertNoPendingTransfer(operationOwner, ETHEREUM.id)
        claimPendingRevoke(operationOwner, entry)
        saved = entry
        showPendingFor(operationOwner, entry)
        const hash = await executeRevoke(operationKeys, operationReview, guard)
        try { const updated = { ...entry, hash }; setOutcomeFor(operationOwner, updated); saved = updated }
        catch { showPendingFor(operationOwner, { ...entry, hash }); if (ownerRef.current === operationOwner.toLowerCase()) setError("Хэш операции получен, но браузер не сохранил его. Не закрывайте вкладку, пока не проверите операцию в обозревателе.") }
        if (ownerRef.current === operationOwner.toLowerCase()) setReview(null)
        try {
          const receipt = await waitRevokeReceipt(hash)
          if (ownerRef.current !== operationOwner.toLowerCase()) return
          if (receipt.from.toLowerCase() !== operationOwner.toLowerCase() || receipt.to?.toLowerCase() !== operationReview.token.address.toLowerCase()) throw new Error("Хэш относится к другой операции")
          if (receipt.status === "reverted") { clearOutcomeFor(operationOwner, saved!); setNotice("Сеть отклонила отзыв. Разрешение не изменилось."); refresh(); return }
          const allowance = await currentAllowance(operationOwner, operationReview)
          if (ownerRef.current !== operationOwner.toLowerCase()) return
          if (allowance === 0n) { clearOutcomeFor(operationOwner, saved!); setNotice("Разрешение отозвано. Текущий лимит — 0."); refresh() }
          else setNotice("Операция подтверждена, но лимит остаётся активным. Проверьте её в обозревателе.")
        } catch { if (ownerRef.current === operationOwner.toLowerCase()) setNotice("Операция передана в сеть. Подтверждение пока не получено; проверьте её по хэшу.") }
      })
    } catch (e) {
      if (e instanceof BroadcastUncertainError) {
        if (ownerRef.current === operationOwner.toLowerCase()) { setReview(null); setError(e.message) }
        return
      }
      if (saved) try { clearPendingRevokeIfCurrent(operationOwner, saved) } catch { /* keep a changed or unavailable pending record */ }
      if (ownerRef.current === operationOwner.toLowerCase()) showPendingFor(operationOwner, readPendingRevoke(operationOwner))
      if (stillActive()) setError((e as Error).message || "Отзыв не отправлен")
    } finally { setBusy(false) }
  }

  const dismissUnknown = async () => {
    if (!owner || !pending) return
    try {
      await withRevokeSigningLock(owner, async () => clearOutcomeFor(owner, pending))
      setNotice("Вы разрешили новую попытку после проверки истории. Сверьте лимит перед подтверждением.")
    } catch (e) { if (ownerRef.current === owner.toLowerCase()) setError((e as Error).message || "Не удалось обновить отзыв") }
  }

  const active = targets.flatMap((target, index) => queries[index].data && queries[index].data > 0n ? [{ target, value: queries[index].data }] : [])
  const loading = queries.some((query) => query.isLoading)
  const failed = queries.filter((query) => query.isError)
  const pendingTarget = pending && targets.find((t) => t.token.address.toLowerCase() === pending.token.toLowerCase() && t.spender.address.toLowerCase() === pending.spender.toLowerCase())
  const reviewExpired = !!review && now - review.receivedAt > REVOKE_REVIEW_TTL
  return <Sheet fullscreen fitDesktop className="wallet-allowance-sheet" open={open} onOpenChange={changeOpen} title={review ? "Отозвать разрешение" : "Разрешения"} subtitle="Ethereum Mainnet" onBack={() => { cancelPreflight(); if (review) { setReview(null); setError("") } else onBack() }}
    footer={review ? <div className="flex flex-col gap-2">
      <PrimaryButton disabled={busy || reviewExpired} onClick={() => void run()}>{busy ? "Проверяем и отправляем…" : "Подтвердить отзыв"}</PrimaryButton>
      {reviewExpired ? <SecondaryButton onClick={() => void openReview(review)}>Обновить комиссию</SecondaryButton> : null}
    </div> : undefined}>
    <div className="flex flex-col gap-5 pb-2">
      {review ? <>
        <p className="t-body2 c-2 px-1">Контракт сможет потратить эти монеты, пока лимит действует. Отзыв устанавливает лимит 0 отдельной транзакцией.</p>
        <Group>
          <Row label="Монета">{review.token.symbol}</Row>
          <Row label="Текущий лимит">{allowanceText(review.current, review)}</Row>
          <Row label="После отзыва">0 {review.token.symbol}</Row>
          <Row label="Контракт">{review.spender.name}</Row>
          <Row label="Комиссия сети">до {formatCoin(review.maximumFee, 18, "ETH", 8)}</Row>
        </Group>
        <dl className="allowance-identities">
          <div><dt>Адрес контракта с разрешением</dt><dd className="mono select-all">{review.spender.address}</dd></div>
          <div><dt>Адрес контракта токена</dt><dd className="mono select-all">{review.token.address}</dd></div>
          <div><dt>Ваш адрес</dt><dd className="mono select-all">{review.owner}</dd></div>
        </dl>
        <p className="t-body3 c-2 px-1">Отзыв не возвращает уже потраченные монеты. После подтверждения сетью EXM проверит текущий лимит снова.</p>
        {error ? <ErrorNote message={error} /> : null}
      </> : <>
        <p className="t-body2 c-2 px-1">Показаны текущие лимиты для известных контрактов. Историческая операция не означает, что разрешение ещё действует.</p>
        {readOnly ? <p className="t-body2 c-2 px-1">На этом сервере доступна проверка лимитов. Отзыв требует отправки транзакции.</p> : null}
        {!owner ? <div className="card p-4"><p className="t-label1">Кошелёк заблокирован</p><p className="t-body2 c-2 mt-1">Откройте кошелёк, чтобы проверить действующие разрешения.</p></div> : null}
        {pending ? <div className="card flex flex-col gap-3 p-4"><p className="t-label1">Проверить отзыв {pendingTarget?.token.symbol ?? "токена"}</p><p className="t-body2 c-2">{pending.hash ? "Операция передана в сеть. Повторная отправка остановлена до проверки лимита." : "Ответ сети о попытке отправки не получен. Повторная отправка остановлена."}</p>{pending.hash ? <a href={ETHEREUM.explorer.tx(pending.hash)} target="_blank" rel="noopener noreferrer" className="t-body2 mono break-all text-[var(--blue)]">{shortAddress(pending.hash, 10, 8)} · открыть в обозревателе</a> : owner ? <a href={ETHEREUM.explorer.address(owner)} target="_blank" rel="noopener noreferrer" className="t-body2 text-[var(--blue)]">Проверить адрес в обозревателе</a> : null}<SecondaryButton disabled={busy} onClick={() => void checkPending()}>Проверить текущий лимит</SecondaryButton>{checkedUnknown && !pending.hash ? <div className="flex flex-col gap-2"><p className="t-body3 c-2">Если операции нет в обозревателе, можно начать отзыв заново. Старая попытка ещё может появиться и списать вторую комиссию.</p><button type="button" disabled={busy} onClick={() => void dismissUnknown()} className="t-label2 min-h-11 text-left text-[var(--blue)]">Я проверил операции · начать заново</button></div> : null}</div> : null}
        {owner && loading && !active.length ? <div className="card p-4"><Skeleton className="h-5 w-40" /></div> : null}
        {owner && failed.length ? <div className="card"><ErrorNote message={`Не удалось проверить ${failed.length} ${failed.length === 1 ? "лимит" : "лимитов"}. Список может быть неполным.`} onRetry={refresh} /></div> : null}
        {owner && active.length ? <Group header={`Действуют · ${active.length}`} className="allowance-list">
          {active.map(({ target, value }) => (
            <div key={keyOf(target)} className="allowance-row">
              <CoinIcon symbol={target.token.symbol} size={36} />
              <div className="allowance-row-details">
                <p className="t-label1">{target.token.symbol} · {target.spender.name}</p>
                <p className="t-body3 c-2">{allowanceText(value, target)}</p>
                <p className="t-body3 c-2 mono">{shortAddress(target.spender.address, 7, 5)}</p>
              </div>
              {readOnly ? null : <button type="button" disabled={!!pending || busy || !owner} aria-label={`Отозвать ${target.token.symbol} · ${target.spender.name}`} onClick={() => void openReview(target)} className="allowance-row-action t-label2 disabled:opacity-50">Отозвать</button>}
            </div>
          ))}
        </Group> : owner && !loading && !failed.length && !pending ? <div className="card p-4"><p className="t-label1">Действующих разрешений нет</p><p className="t-body2 c-2 mt-1">Все проверенные лимиты равны 0.</p></div> : null}
        <p className="t-body3 c-2 px-1">Проверяются только USDC, DAI и USDT для LI.FI и Uniswap. Другие контракты здесь не перечислены.</p>
        {notice ? <p role="status" className="t-body2 px-1">{notice}</p> : null}
        {error ? <ErrorNote message={error} /> : null}
      </>}
    </div>
  </Sheet>
}
