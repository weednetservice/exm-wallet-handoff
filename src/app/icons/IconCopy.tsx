import { IconSvg, type IconProps } from "./Icon"

/** Copy: front sheet bottom-left, the corner of the copy behind it, 2-unit clear gap */
export function IconCopy(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M8 11h5a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4Z" />
      <path d="M11.13 7A4 4 0 0 1 15 4h5a4 4 0 0 1 4 4v5a4 4 0 0 1-3 3.87" />
    </IconSvg>
  )
}
