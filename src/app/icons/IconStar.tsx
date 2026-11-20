import { IconSvg, type IconProps } from "./Icon"

export function IconStar({ filled, ...props }: IconProps) {
  return <IconSvg {...props} fill={filled ? "currentColor" : "none"}>
    <path d="m14 3 3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6L7.2 24l1.3-7.6L3 11l7.6-1.1L14 3Z" />
  </IconSvg>
}
