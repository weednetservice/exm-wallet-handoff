/** A touch-sized segmented control; options share one row until the text needs more room. */
import { cn } from "@/lib/utils"

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** what the control chooses, for screen readers: "Период графика" */
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex w-full flex-wrap rounded-[var(--radius-btn)] bg-[var(--grouped)] p-0.5", className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "t-label2 min-h-11 min-w-[3.5rem] flex-[1_1_0] rounded-[10px] px-1 text-center transition-colors motion-reduce:transition-none focus-visible:outline-offset-0",
              on ? "bg-[var(--tint)] text-[var(--label)]" : "text-[var(--label-2)] hover:text-[var(--label)]",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
