import { IconSvg, type IconProps } from "./Icon"

/** Close (×) */
export function IconClose(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M7.5 7.5l13 13M20.5 7.5l-13 13" />
    </IconSvg>
  )
}
