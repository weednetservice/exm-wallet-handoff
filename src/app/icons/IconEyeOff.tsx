import { useId } from "react"
import { IconSvg, type IconProps } from "./Icon"
import { EYE } from "./IconEye"

/** Eye crossed out: hide balance. No pupil, one slash with a narrow cut in the eye so it stays one clean stroke at 20 px. */
export function IconEyeOff(props: IconProps) {
  const id = useId()
  return (
    <IconSvg {...props}>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="28" height="28">
        <rect width="28" height="28" fill="#fff" stroke="none" />
        <path d="M5 5l18 18" stroke="#000" strokeWidth="4.5" />
      </mask>
      <path d={EYE} mask={`url(#${id})`} />
      <path d="M5 5l18 18" />
    </IconSvg>
  )
}
