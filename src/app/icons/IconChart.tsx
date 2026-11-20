import { IconSvg, type IconProps } from "./Icon"

const AXIS = "M4 4v15a5 5 0 0 0 5 5h15"

/** Market (tab Рынок): a price line on chart axes. `filled`: the area under the line. */
export function IconChart(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d={AXIS} />
      {props.filled ? (
        <path d="M9 18l4.5-4.5 3.5 3.5 7-7v10H9Z" fill="currentColor" />
      ) : (
        <path d="M9 18l4.5-4.5 3.5 3.5 7-7" />
      )}
    </IconSvg>
  )
}
