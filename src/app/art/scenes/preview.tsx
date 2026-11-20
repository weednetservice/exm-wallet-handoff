import { createRoot } from "react-dom/client"
import { SceneArt } from "./SceneArt"

export function renderSceneArtPreview(host: HTMLElement) {
  const root = createRoot(host)
  root.render(<main style={{ width: 760, padding: 32, background: "#fff", color: "#161616", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
    <h1 style={{ margin: "0 0 8px", fontSize: 24, lineHeight: "32px", fontWeight: 500 }}>EXM · две сцены</h1>
    <p style={{ margin: "0 0 24px", color: "#646464", fontSize: 14, lineHeight: "20px" }}>Прозрачный PNG · CSS-кадрирование · 160 и 120 px</p>
    {["#fff", "#101010"].map((background) => <section key={background} style={{ marginBottom: 20, padding: "16px 12px", border: "1px solid #dedee3", borderRadius: 16, background }}>
      {[160, 120].map((size) => <div key={size} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "end", padding: "8px 0" }}>
        <SceneArt variant="empty" size={size} label={`Пустое состояние, ${size} px`} />
        <SceneArt variant="sent" size={size} label={`Подтверждённая отправка, ${size} px`} />
      </div>)}
    </section>)}
  </main>)
  return () => root.unmount()
}
