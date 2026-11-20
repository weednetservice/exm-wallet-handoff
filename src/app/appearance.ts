export type Appearance = "system" | "light" | "dark"
const KEY = "exm.appearance.v1"

export function readAppearance(): Appearance {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === "light" || saved === "dark" ? saved : "system"
  } catch { return "system" }
}

export function applyAppearance(choice: Appearance) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  const root = document.documentElement
  root.dataset.exm = ""
  root.classList.toggle("dark", dark)
  const updateBrowserColor = () => {
    const canvas = getComputedStyle(root).getPropertyValue("--exm-canvas").trim()
    if (canvas) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", canvas)
    return !!canvas
  }
  if (!updateBrowserColor() && document.readyState !== "complete") {
    window.addEventListener("load", updateBrowserColor, { once: true })
  }
}

export function saveAppearance(choice: Appearance) {
  try { localStorage.setItem(KEY, choice) } catch { /* still apply for this session */ }
  applyAppearance(choice)
}
