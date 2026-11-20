import { IconSvg, type IconProps } from "./Icon"

/** Back (‹): same chevron as IconChevron, turned */
export function IconBack(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M17.5 6.5 10 14l7.5 7.5" />
    </IconSvg>
  )
}
