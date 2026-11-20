/** switching tabs from inside a screen (the Обмен action, "Вся история" with its network) */
import { createContext, useContext } from "react"

export type TabId = "home" | "swap" | "market" | "history"
/** `param`: what the tab opens on, e.g. a network id for История */
export const NavContext = createContext<{ go: (tab: TabId, param?: string) => void; has: (tab: TabId) => boolean }>({ go: () => {}, has: () => false })
export const useNav = () => useContext(NavContext)
