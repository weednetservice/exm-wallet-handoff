import { IconSvg, type IconProps } from "./Icon"

/** Share: arrow leaving an open tray (the system share gesture) */
export function IconShare(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M10 11H9a4 4 0 0 0-4 4v5a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4v-5a4 4 0 0 0-4-4h-1" />
      <path d="M14 16V4M9.5 8.5 14 4l4.5 4.5" />
    </IconSvg>
  )
}
