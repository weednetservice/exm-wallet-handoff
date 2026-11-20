import { IconSvg, type IconProps } from "./Icon"

/** Receive (↓): mirror of IconSend */
export function IconReceive(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M14 5v18M8 17l6 6 6-6" />
    </IconSvg>
  )
}
