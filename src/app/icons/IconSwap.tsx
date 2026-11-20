import { IconSvg, type IconProps } from "./Icon"

/**
 * Swap: up arrow on the left raised, down arrow on the right lowered, 10 units apart, as Keeper draws it.
 * `filled` gives solid heads (active tab).
 */
export function IconSwap(props: IconProps) {
  return (
    <IconSvg {...props}>
      {props.filled ? (
        <>
          <path d="M9 22V6.5M19 6v15.5" />
          <path d="M5 8.5l4-4 4 4ZM15 19.5l4 4 4-4Z" fill="currentColor" />
        </>
      ) : (
        <path d="M9 22V4.5M5 8.5l4-4 4 4M19 6v17.5M15 19.5l4 4 4-4" />
      )}
    </IconSvg>
  )
}
