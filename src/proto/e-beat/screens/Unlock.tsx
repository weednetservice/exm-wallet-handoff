/**
 * Разблокировка. Direction E changes nothing here (08 §4 E: «разблокировка без изменений»): a locked
 * wallet shows no balances and listens to no network, so there is no block to beat to. The screen is
 * the app's own (src/app/onboarding › UnlockScreen) with the Face ID words of an iPhone.
 * The Face ID sheet itself belongs to iOS and is not drawn; the prototype stands in for it with a short wait.
 */
import { useEffect, useRef, useState } from "react"
import { PasswordField, PrimaryButton, Screen, SecondaryButton } from "@/app/ui"

export function UnlockScreen({ onOpen }: { onOpen: () => void }) {
  const [waiting, setWaiting] = useState(false)
  const [password, setPassword] = useState("")
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <Screen className="min-h-[calc(100svh-var(--eb-nav,0px))] justify-center gap-8 pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="t-h1 tracking-[.04em]">EXM</h1>
        <p className="t-body1 c-2">Откройте кошелёк через Face ID или паролем</p>
      </div>
      <div className="flex flex-col gap-2">
        <PrimaryButton
          disabled={waiting}
          onClick={() => {
            setWaiting(true)
            // TODO(prototype): here the app calls the passkey (src/app/vault/passkey.ts) and iOS shows Face ID
            timer.current = setTimeout(onOpen, 900)
          }}
        >
          {waiting ? "Ждём Face ID…" : "Открыть через Face ID"}
        </PrimaryButton>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (password) onOpen()
        }}
      >
        <PasswordField id="eb-unlock" label="Пароль" value={password} onChange={setPassword} autoComplete="off" />
        <SecondaryButton type="submit" disabled={!password || waiting}>
          Открыть
        </SecondaryButton>
      </form>
      <p className="t-body3 c-2 text-center">Прототип: окно Face ID показывает сам iPhone, здесь его заменяет пауза; пароль подойдёт любой.</p>
    </Screen>
  )
}
