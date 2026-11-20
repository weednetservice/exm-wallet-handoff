import { IconSvg, type IconProps } from "./Icon"

const TURN = { right: undefined, down: "rotate(90 14 14)", left: "rotate(180 14 14)", up: "rotate(-90 14 14)" } as const

/** Chevron (› by default): row disclosure; `dir="down"` for pickers such as the account pill */
export function IconChevron({ dir = "right", ...props }: IconProps & { dir?: keyof typeof TURN }) {
  return (
    <IconSvg {...props}>
      <path d="M10.5 6.5 18 14l-7.5 7.5" transform={TURN[dir]} />
    </IconSvg>
  )
}
