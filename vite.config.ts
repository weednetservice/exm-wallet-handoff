import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import { mockMiddleware } from "./mocks/routes.mjs"

function securityHeaders(dev: boolean) {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
      dev ? "connect-src 'self' ws://127.0.0.1:5178" : "connect-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "exm-frontend-mocks",
      configureServer(server) {
        server.middlewares.use(mockMiddleware(mode))
      },
      configurePreviewServer(server) {
        server.middlewares.use(mockMiddleware(mode))
      },
      transformIndexHtml(html, context) {
        const transferMode = context.server && mode === "review" ? "wallet" : "read-only"
        return html.replace("<html", '<html data-broadcast="' + transferMode + '"')
      },
    },
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5178, strictPort: true, headers: securityHeaders(true) },
  preview: { host: "127.0.0.1", port: 4188, strictPort: true, headers: securityHeaders(false) },
}))
