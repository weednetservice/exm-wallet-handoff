import { IconSvg, type IconProps } from "./Icon"

/** Pending: an hourglass, so a waiting operation never looks like the History clock in a list */
export function IconPending(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M6.5 4h15M6.5 24h15" />
      <path d="M8.25 4v2.5c0 2 1 3.6 2.6 4.8L14 14l3.15-2.7c1.6-1.2 2.6-2.8 2.6-4.8V4M8.25 24v-2.5c0-2 1-3.6 2.6-4.8L14 14l3.15 2.7c1.6 1.2 2.6 2.8 2.6 4.8V24" />
    </IconSvg>
  )
}
