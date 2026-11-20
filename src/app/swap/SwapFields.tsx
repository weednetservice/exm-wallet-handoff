import { useLayoutEffect, useRef, type ReactNode, type Ref } from "react"
import { CoinIcon } from "../marks"
import { IconChevronDown } from "../glyph"

function flyCoin(element: HTMLElement, origin: DOMRect, destination: DOMRect, bend: number, duration: number) {
  const dx = origin.x - destination.x
  const dy = origin.y - destination.y
  const keyframes = Array.from({ length: 9 }, (_, step) => {
    const progress = step / 8
    const wave = Math.sin(progress * Math.PI)
    return { transform: `translate3d(${dx * (1 - progress) + bend * wave}px, ${dy * (1 - progress)}px, 0) scale(${1 + .06 * wave})` }
  })
  return element.animate(keyframes, { duration, easing: "cubic-bezier(.34,.02,.2,1)" })
}

export function useSwapCoinFlight(inputId: string, outputId: string) {
  const inputCoin = useRef<HTMLSpanElement>(null)
  const outputCoin = useRef<HTMLSpanElement>(null)
  const previous = useRef<{ input: DOMRect; output: DOMRect } | null>(null)

  const capture = () => {
    if (!inputCoin.current?.animate || !outputCoin.current?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    previous.current = {
      input: outputCoin.current.getBoundingClientRect(),
      output: inputCoin.current.getBoundingClientRect(),
    }
  }

  useLayoutEffect(() => {
    const origin = previous.current
    previous.current = null
    if (!origin || !inputCoin.current || !outputCoin.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const input = inputCoin.current.getBoundingClientRect()
    const output = outputCoin.current.getBoundingClientRect()
    const desktop = window.matchMedia("(min-width: 840px) and (pointer: fine)").matches
    const duration = desktop ? 390 : 330
    const animations = [
      flyCoin(inputCoin.current, origin.input, input, -3, duration),
      flyCoin(outputCoin.current, origin.output, output, desktop ? -42 : -34, duration),
    ]
    return () => animations.forEach((animation) => animation.cancel())
  }, [inputId, outputId])

  return { inputCoin, outputCoin, capture }
}

export function SwapAssetChoice({ symbol, networkId, label, disabled, onClick, coinRef }: { symbol: string; networkId: string; label: string; disabled?: boolean; onClick: () => void; coinRef?: Ref<HTMLSpanElement> }) {
  return <button type="button" className="swap-asset-choice" disabled={disabled} aria-label={label} onClick={onClick}>
    <span ref={coinRef} className="swap-asset-medallion" aria-hidden="true"><CoinIcon symbol={symbol} networkId={networkId} size={28} /></span>
    <span>{symbol}</span><IconChevronDown size={14} />
  </button>
}

export function SwapAmountPanel({ label, htmlFor, balance, amount, asset }: { label: string; htmlFor?: string; balance?: ReactNode; amount: ReactNode; asset: ReactNode }) {
  return <section className="swap-amount-card">
    <div className="swap-panel-heading">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <p>{label}</p>}{asset}</div>
    {amount}
    {balance}
  </section>
}
