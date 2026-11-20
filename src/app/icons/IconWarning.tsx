import { IconSvg, type IconProps } from "./Icon"

/** Warning: triangle with 2.75-unit fillets, drawn about 10 % over the circle keyline so it looks the same size; exclamation dot r 1.5 */
export function IconWarning(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d="M11.62 7.65a2.75 2.75 0 0 1 4.76 0l6.75 11.73a2.75 2.75 0 0 1-2.38 4.12H7.25a2.75 2.75 0 0 1-2.38-4.12Z" />
      <path d="M14 11v4.5" />
      <circle cx="14" cy="19.25" r="1.5" fill="currentColor" stroke="none" />
    </IconSvg>
  )
}
