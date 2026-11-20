import { IconSvg, type IconProps } from "./Icon"

/** Send (↑): Keeper's action arrow, 90° head */
export function IconSend(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M14 23V5M8 11l6-6 6 6" />
    </IconSvg>
  )
}
