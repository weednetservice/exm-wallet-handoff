import { IconSvg, type IconProps } from "./Icon"

/** QR frame and centre mark, on the same 28 px grid as the other actions. */
export function IconScan(props: IconProps) {
  return <IconSvg {...props}>
    <path d="M10 4H6a2 2 0 0 0-2 2v4m14-6h4a2 2 0 0 1 2 2v4M4 18v4a2 2 0 0 0 2 2h4m14-6v4a2 2 0 0 1-2 2h-4" />
    <path d="M11 11h6v6h-6z" />
  </IconSvg>
}
