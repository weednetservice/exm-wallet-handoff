import { IconSvg, type IconProps } from "./Icon"

/** External link (explorer): arrow leaving a box through its open corner */
export function IconExternal(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M12 6H9a4 4 0 0 0-4 4v9a4 4 0 0 0 4 4h9a4 4 0 0 0 4-4v-3" />
      <path d="M16 5h7v7M23 5 13 15" />
    </IconSvg>
  )
}
