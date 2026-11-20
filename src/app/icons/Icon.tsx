/**
 * Shared 28 px grid, round line caps and a light outline. Brand coin logos use their own renderer.
 */
import type { ReactNode, SVGProps } from "react"

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "ref"> & {
  /** rendered width and height in px (default 28) */
  size?: number
  /** solid drawing for the active tab; icons without a solid form ignore it */
  filled?: boolean
}

/** Compensate small sizes without turning active controls into solid shapes. */
export function opticalStroke(size: number): number {
  return size >= 28 ? 1.6 : Math.round(1.6 * Math.sqrt(28 / size) * 100) / 100
}

export function IconSvg({
  size = 28,
  filled: _filled,
  strokeWidth,
  children,
  ...rest
}: IconProps & { children: ReactNode }) {
  // decorative by default; a caller that names the icon (aria-label) turns it into an image
  const named = rest["aria-label"] != null || rest["aria-labelledby"] != null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? opticalStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={named ? undefined : true}
      role={named ? "img" : undefined}
      {...rest}
    >
      {children}
    </svg>
  )
}
