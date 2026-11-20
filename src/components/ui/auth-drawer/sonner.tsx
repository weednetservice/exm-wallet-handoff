/**
 * shadcn/ui Sonner Toaster, as bundled into the public 21st.dev preview of sidiora-labs'
 * auth-drawer (https://21st.dev/@sidiora-labs/components/auth-drawer). shadcn/ui is MIT.
 * Needs the `sonner` package (the bundle shipped sonner 2.0.8).
 *
 * The shadcn original reads the theme with `useTheme()` from next-themes; in the 21st preview that
 * hook was the harness ThemeProvider, whose theme is the `?theme=` URL value ("dark") or "light",
 * the same class index.html puts on <html>. This project has no theme provider, so the theme is
 * read from that <html> class instead. Class strings and options are unchanged.
 *
 * The 21st.dev Usage.tsx imports it as `@/components/ui/sonner`; it is kept private here
 * (src/demos/auth-drawer.tsx imports this path) so other components are not affected.
 */
import { useSyncExternalStore, type ComponentProps } from "react"
import { Toaster as Sonner } from "sonner"

type ToasterProps = ComponentProps<typeof Sonner>

function subscribeToHtmlClass(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

function useDocumentTheme(): "dark" | "light" {
  return useSyncExternalStore(
    subscribeToHtmlClass,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light",
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useDocumentTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
