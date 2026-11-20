import { IconSvg, type IconProps } from "./Icon"

/** Paste: clipboard with two lines of text */
export function IconPaste(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M10 6H9a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4V10a4 4 0 0 0-4-4h-1" />
      <path d="M11.5 4h5A1.5 1.5 0 0 1 18 5.5v1A1.5 1.5 0 0 1 16.5 8h-5A1.5 1.5 0 0 1 10 6.5v-1A1.5 1.5 0 0 1 11.5 4Z" />
      <path d="M10 14h8M10 18h5" />
    </IconSvg>
  )
}
