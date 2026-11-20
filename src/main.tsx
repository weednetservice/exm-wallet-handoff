import { lazy, StrictMode, Suspense, useEffect, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import "./index.css"
import "./app/palette.css"
import { applyAppearance, readAppearance } from "./app/appearance"

// every src/demos/<slug>.tsx is the 21st.dev usage example of src/components/ui/<slug>.tsx
const demos = import.meta.env.DEV ? import.meta.glob<{ default: ComponentType }>("./demos/*.tsx") : {}
const bySlug = Object.fromEntries(
  Object.entries(demos).map(([path, load]) => [path.replace("./demos/", "").replace(".tsx", ""), load]),
)

// /            the wallet app
// /?demos      list of restored components
// /?c=<slug>   one component demo, as on 21st.dev
const params = new URLSearchParams(window.location.search)
const slug = params.get("c")
const Demo = slug && bySlug[slug] ? lazy(bySlug[slug]) : undefined
const WalletApp = lazy(() => import("./app/App"))

// /?proto=<slug>   a design prototype from src/proto/<slug>/index.tsx (internal design exploration)
const protos = import.meta.env.DEV ? import.meta.glob<{ default: ComponentType }>("./proto/*/index.tsx") : {}
const protoSlug = params.get("proto")
const protoLoader = protoSlug ? protos[`./proto/${protoSlug}/index.tsx`] : undefined
const Proto = protoLoader ? lazy(protoLoader) : null
if (!Proto && !Demo && !(import.meta.env.DEV && params.has("demos"))) {
  applyAppearance(readAppearance())
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (readAppearance() === "system") applyAppearance("system")
  })
}

/**
 * The 21st.dev preview frame: demos are centred in two full-screen flex boxes, and the theme from
 * ?theme= wins over a demo that sets `dark` itself on mount (parent effects run after the child's).
 */
function Frame({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const theme = params.get("theme")
    if (theme === "dark") document.documentElement.classList.add("dark")
    if (theme === "light") document.documentElement.classList.remove("dark")
  }, [])
  return (
    <div className="flex min-h-screen w-screen items-center justify-center">
      <div className="flex min-h-screen w-screen items-center justify-center">{children}</div>
    </div>
  )
}

function Index() {
  const slugs = Object.keys(bySlug).sort()
  return (
    <main className="mx-auto max-w-[640px] px-4 py-16">
      <h1 className="text-3xl font-medium tracking-tight">Компоненты</h1>
      <ul className="mt-8 flex flex-col gap-1">
        {slugs.length === 0 ? <li className="text-muted-foreground">Пока ни одного.</li> : null}
        {slugs.map((s) => (
          <li key={s}>
            <a className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href={"?c=" + s + "&theme=dark"}>
              {s}
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}

// one root per page, also when Vite re-runs this module on a hot update
const container = document.getElementById("root")! as HTMLElement & { __root?: Root }
container.__root ??= createRoot(container)
container.__root.render(
  <StrictMode>
    {Proto ? (
      <Suspense fallback={<div className="min-h-screen" style={{ background: "#10161f" }} />}>
        <Proto />
      </Suspense>
    ) : Demo ? (
      <Suspense fallback={<div className="min-h-screen" />}><Frame><Demo /></Frame></Suspense>
    ) : import.meta.env.DEV && params.has("demos") ? (
      <Index />
    ) : (
      <Suspense fallback={<div className="min-h-screen" />}>
        <WalletApp />
      </Suspense>
    )}
  </StrictMode>,
)
