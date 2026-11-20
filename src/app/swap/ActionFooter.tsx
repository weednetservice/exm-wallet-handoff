import type { ReactNode } from "react"

export function SwapActionFooter({ children }: { children: ReactNode }) {
  return <div className="swap-action-footer flex flex-col gap-2">{children}</div>
}
