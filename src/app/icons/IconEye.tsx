import { IconSvg, type IconProps } from "./Icon"

export const EYE = "M3.5 14C6 9 9.6 6.5 14 6.5S22 9 24.5 14C22 19 18.4 21.5 14 21.5S6 19 3.5 14Z"
export const PUPIL = "M17.5 14a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z"

/** Eye: show balance */
export function IconEye(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d={EYE} />
      <path d={PUPIL} />
    </IconSvg>
  )
}
