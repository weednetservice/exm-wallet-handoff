/**
 * The small day chart of a list row, as in Stocks: the line of closes over a dashed baseline at the
 * day's open. The line stays neutral so a full list of falling coins doesn't become a wall of red;
 * the signed 24-hour change alongside it carries direction. Decorative for screen readers.
 */
import { useId } from "react"

export function Sparkline({ values, base, className }: { values: number[]; base: number; className?: string }) {
  const id = useId().replace(/:/g, "")
  if (values.length < 2) return null
  const W = 100
  const H = 40
  const lo = Math.min(base, ...values)
  const hi = Math.max(base, ...values)
  const x = (i: number) => (i / (values.length - 1)) * W
  const y = (v: number) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6)
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("")
  const color = "var(--label-2)"
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.14} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${id}-f)`} />
      <line
        x1={0}
        x2={W}
        y1={y(base)}
        y2={y(base)}
        stroke="var(--label-3)"
        strokeWidth={1}
        strokeDasharray="1.5 3"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
