import { useId } from "react"
import { IconSvg, type IconProps } from "./Icon"

const ARC = "M5.34 19A10 10 0 1 0 4.94 9.77"
const HEAD = "M3.4 5.55 4.94 9.77 9.17 8.23"
const HANDS = "M14 9v5l3 3"

/**
 * History (tab История): a clock face turning back, the arrowhead at ten o'clock.
 * `filled`: a solid face with the hands cut out and the same gap for the arrow.
 */
export function IconHistory(props: IconProps) {
  const id = useId()
  if (!props.filled) {
    return (
      <IconSvg {...props}>
        <path d={ARC + HEAD + HANDS} />
      </IconSvg>
    )
  }
  return (
    <IconSvg {...props}>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="28" height="28">
        <circle cx="14" cy="14" r="10" fill="#fff" stroke="#fff" />
        <path d={HANDS} stroke="#000" />
        <path d="M5.34 19A10 10 0 0 1 4.94 9.77" stroke="#000" strokeWidth="3" />
      </mask>
      <rect width="28" height="28" fill="currentColor" stroke="none" mask={`url(#${id})`} />
      <path d={HEAD} />
    </IconSvg>
  )
}
