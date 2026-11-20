import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/lib/api/http"
import { formatCoin } from "@/lib/format"
import { IconCopy, IconExternal } from "../glyph"
import { copyText, IconButton, PrimaryButton, Sheet, useToast } from "../ui"
import { BASE_LOOKUP_NETWORK, BaseLookupError, isTransactionHash, readBaseTransaction, type BaseTransactionLookup } from "./baseTransaction"

type View = { type: "idle" } | { type: "loading" } | { type: "error"; message: string } | { type: "result"; result: BaseTransactionLookup }
const labels = { "not-found": "Пока не найдена", pending: "Ожидает включения", "included-success": "Выполнена в Base", "included-failed": "Не выполнена в Base" }

export function BaseTransactionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [input, setInput] = useState("")
  const [view, setView] = useState<View>({ type: "idle" })
  const [invalid, setInvalid] = useState(false)
  const epoch = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const isOpen = useRef(open)
  isOpen.current = open
  const [toast, showToast] = useToast()
  const invalidate = useCallback(() => { epoch.current++; controller.current?.abort(); controller.current = null }, [])
  useEffect(() => {
    if (!open) { invalidate(); setView({ type: "idle" }); setInvalid(false) }
    return invalidate
  }, [open, invalidate])

  const check = async () => {
    if (view.type === "loading") return
    if (!isTransactionHash(input)) { setInvalid(true); document.getElementById("base-lookup-hash")?.focus(); return }
    invalidate()
    const request = epoch.current
    const abort = new AbortController()
    controller.current = abort
    setInvalid(false)
    setView({ type: "loading" })
    try {
      const result = await readBaseTransaction(input, abort.signal)
      if (request === epoch.current && isOpen.current) setView({ type: "result", result })
    } catch (error) {
      if (request !== epoch.current || !isOpen.current || abort.signal.aborted) return
      const message = error instanceof BaseLookupError ? error.message : error instanceof ApiError && error.status === 429
        ? "Слишком много запросов. Повторите проверку через минуту." : "Узлы Base сейчас не отвечают. Повторите проверку или откройте операцию в Basescan."
      setView({ type: "error", message })
    } finally {
      abort.abort()
      if (controller.current === abort) controller.current = null
    }
  }
  const close = (next: boolean) => { if (!next) invalidate(); onOpenChange(next) }
  const result = view.type === "result" ? view.result : null
  const copy = async (value: string) => showToast(await copyText(value) ? "Скопировано" : "Не удалось скопировать. Выделите значение вручную.")
  const field = (label: string, value: string) => <div className="base-lookup-field"><div><span>{label}</span><IconButton label={`Скопировать ${label === "Хэш" ? "хэш операции" : label === "Отправитель" ? "адрес отправителя" : "адрес получателя"}`} onClick={() => void copy(value)}><IconCopy size={16} /></IconButton></div><p className="mono select-all">{value.slice(0, Math.ceil(value.length / 2))}<wbr />{value.slice(Math.ceil(value.length / 2))}</p></div>

  return <Sheet open={open} onOpenChange={close} expanded title="По хэшу" subtitle="Base Mainnet" returnFocusLabel="Проверить по хэшу" footer={<PrimaryButton type="submit" form="base-lookup-form" disabled={view.type === "loading"}>{view.type === "loading" ? "Проверяем…" : view.type === "error" ? "Повторить проверку" : result ? "Обновить" : "Проверить"}</PrimaryButton>}>
    <form id="base-lookup-form" className="base-lookup-form" onSubmit={(event) => { event.preventDefault(); void check() }}>
      <label htmlFor="base-lookup-hash">Хэш транзакции</label>
      <textarea id="base-lookup-hash" className="mono" rows={input.length > 36 ? 3 : 1} value={input} onChange={(event) => { invalidate(); setInput(event.target.value); setInvalid(false); setView({ type: "idle" }) }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} enterKeyHint="go" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={invalid} aria-describedby="base-lookup-hint" placeholder="0x…" />
      <p id="base-lookup-hint" role={invalid ? "alert" : undefined} className={invalid ? "base-lookup-validation" : "c-2"}>{invalid ? "Введите 0x и 64 шестнадцатеричных символа хэша." : "Одна операция в Base. Полная история здесь пока недоступна."}</p>
    </form>
    {view.type === "loading" ? <p className="base-lookup-progress" role="status">Проверяем операцию в Base…</p> : null}
    {view.type === "error" ? <p className="base-lookup-error" role="alert">{view.message}</p> : null}
    {result ? <section className="base-lookup-result" aria-label="Результат проверки">
      <div className="base-lookup-status" data-state={result.state}><p role="status">{labels[result.state]}</p>{result.state.startsWith("included-") ? <p>Включена в блок Base · {result.transaction!.blockNumber!.toString()}</p> : result.state === "not-found" ? <p>Этот RPC пока не вернул операцию. Проверьте сеть и хэш или повторите позже.</p> : <p>RPC знает эту операцию, но ещё не вернул включение в блок.</p>}{result.state === "included-failed" ? <p>Комиссия могла быть списана.</p> : null}</div>
      {field("Хэш", result.hash)}
      {result.transaction ? <>
        {field("Отправитель", result.transaction.from)}
        {result.transaction.to ? field("Получатель", result.transaction.to) : <p className="base-lookup-contract">Создание контракта</p>}
        {result.transaction.value > 0n ? <div className="base-lookup-value"><span>Сумма в транзакции</span><span>{formatCoin(result.transaction.value, 18, "ETH")}</span></div> : null}
        {result.transaction.to && result.transaction.input !== "0x" ? <p className="base-lookup-contract">Подробности данных и движений токенов в Basescan.</p> : null}
      </> : null}
      <a className="base-lookup-explorer" href={BASE_LOOKUP_NETWORK.explorer.tx(result.hash)} target="_blank" rel="noopener noreferrer">Открыть в Basescan<IconExternal size={18} /><span className="sr-only">(в новой вкладке)</span></a>
    </section> : isTransactionHash(input) && view.type !== "loading" ? <a className="base-lookup-explorer" href={BASE_LOOKUP_NETWORK.explorer.tx(input.trim())} target="_blank" rel="noopener noreferrer">Проверить в Basescan<IconExternal size={18} /><span className="sr-only">(в новой вкладке)</span></a> : null}
    {toast}
  </Sheet>
}
