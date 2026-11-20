/**
 * A failed load in the market and prediction tabs: what went wrong and the one way to retry.
 * Same shape as `ErrorNote` in ui.tsx, but the button text is the label colour on the fill
 * (12.8:1 on #1c1c1e, 10.7:1 on #2c2c2e) instead of system blue on the fill (3.5:1 and 2.9:1,
 * below the 4.5:1 that 15 px text needs), styled like the app's SecondaryButton.
 */
import { cn } from "@/lib/utils"

export function TextButton({ className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "t-subhead min-h-11 rounded-full bg-[var(--fill)] px-4 font-semibold text-[var(--label)] transition-colors hover:bg-[var(--fill-press)] active:opacity-70",
        className,
      )}
      {...rest}
    />
  )
}

export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 px-4 py-4">
      <p className="t-subhead c-2">{message}</p>
      {onRetry ? <TextButton onClick={onRetry}>Повторить</TextButton> : null}
    </div>
  )
}
