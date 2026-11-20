import { IconSvg, type IconProps } from "./Icon"

export function IconBell(props: IconProps) {
  return <IconSvg {...props}>
    <path d="M6 18.5c2-2 2-4 2-7a6 6 0 0 1 12 0c0 3 0 5 2 7H6Z" />
    <path d="M11 22a3 3 0 0 0 6 0M14 3V2" />
  </IconSvg>
}
