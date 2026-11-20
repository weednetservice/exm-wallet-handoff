/**
 * Разблокировка: our screen around the system's Face ID prompt. The screen has no light; when
 * Face ID succeeds the light rises from the bottom edge to the top once (480 ms) and the balance appears.
 *
 * The prototype cannot call the system prompt: ASK_MS stands in for the time a person looks at the phone.
 */
import { useEffect, useState } from "react"
import { PrimaryButton } from "@/app/ui"
import { useProto } from "./parts"

/** prototype only: how long the system prompt would be on screen */
const ASK_MS = 900

export function Unlock() {
  const { go } = useProto()
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const t = setTimeout(() => go({ screen: "home", filter: null }, { fromY: window.innerHeight, dur: 480 }), ASK_MS)
    return () => clearTimeout(t)
  }, [asking, go])
  return (
    <div className="flex min-h-[calc(100svh-var(--al-top))] flex-col pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="t-h1">EXM</h1>
        <p className="t-body1 c-2" aria-live="polite">
          {asking ? "Посмотрите на экран" : "Кошелёк закрыт"}
        </p>
      </div>
      <PrimaryButton disabled={asking} onClick={() => setAsking(true)}>
        Войти по Face ID
      </PrimaryButton>
    </div>
  )
}
