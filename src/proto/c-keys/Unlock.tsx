/**
 * Вход по Face ID: наш экран вокруг системного окна. Четыре ключа стоят одноцветными (заперты);
 * после подтверждения все четыре разом возвращают свои цвета, и открывается Главная.
 * Системное окно Face ID рисует iOS, в прототипе его нет: подтверждение имитируется.
 */
import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { PrimaryButton, SecondaryButton } from "@/app/ui"
import { KEYS } from "./model"
import { KeyStack } from "./parts"
import type { Go } from "./index"

type State = "locked" | "asking" | "open" | "password"

export function Unlock({ go }: { go: Go }) {
  const [state, setState] = useState<State>("locked")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms))

  const unlocked = () => {
    setState("open")
    later(() => go({ screen: "home" }), 900)
  }
  const open = state === "open"

  return (
    <div className="ck-scroll flex flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-10 pb-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-[40px] leading-[48px] font-semibold tracking-[-.01em]">EXM</h1>
          <p className="t-body1 c-2" aria-live="polite">
            {open ? "Кошелёк открыт" : state === "asking" ? "Ждём Face ID" : "Кошелёк заблокирован"}
          </p>
        </div>

        <ul aria-label="Ключи кошелька" className="grid w-full max-w-[326px] grid-cols-[1.36fr_1fr_1fr_1fr]">
          {KEYS.map((k) => (
            <li key={k.id} className="flex flex-col items-start gap-2 pl-3">
              <span className="relative block h-7">
                <KeyStack id={k.id} mono />
                <motion.span className="absolute top-0 left-0" initial={false} animate={{ opacity: open ? 1 : 0 }} transition={{ duration: 0.24, ease: "easeOut" }}>
                  <KeyStack id={k.id} />
                </motion.span>
              </span>
              <span className="flex flex-col">
                <span className="t-label2">{k.title}</span>
                <span className="t-label3 c-2">{k.sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {state === "password" ? (
        <form
          className="flex flex-col gap-3 pb-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (!password) return setError("Введите пароль")
            unlocked()
          }}
        >
          <label htmlFor="ck-pass" className="t-label2 c-2 px-1">
            Пароль кошелька
          </label>
          <div className="ck-field" data-bad={!!error}>
            <input
              id="ck-pass"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              aria-invalid={!!error}
              aria-describedby="ck-pass-err"
              onChange={(e) => {
                setPassword(e.target.value)
                setError("")
              }}
            />
          </div>
          <p id="ck-pass-err" role="alert" className="t-body2 min-h-5 px-1 text-[var(--red)]">
            {error}
          </p>
          <PrimaryButton type="submit">Открыть кошелёк</PrimaryButton>
          <SecondaryButton
            onClick={() => {
              setError("")
              setState("locked")
            }}
          >
            Вернуться к Face ID
          </SecondaryButton>
        </form>
      ) : (
        <div className="flex flex-col gap-3 pb-6">
          <PrimaryButton
            aria-busy={state === "asking"}
            onClick={() => {
              if (state !== "locked") return
              setState("asking")
              later(unlocked, 1300)
            }}
          >
            {state === "asking" ? <span aria-hidden="true" className="ck-spinner ck-spinner-sm" /> : null}
            {open ? "Открыто" : state === "asking" ? "Посмотрите на экран" : "Открыть по Face ID"}
          </PrimaryButton>
          <SecondaryButton disabled={state !== "locked"} onClick={() => setState("password")}>
            Ввести пароль
          </SecondaryButton>
        </div>
      )}
    </div>
  )
}
