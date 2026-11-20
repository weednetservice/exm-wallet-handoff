import { createRoot } from "react-dom/client"
import { PersonAvatar } from "./PersonAvatar"
import { PERSON_AVATAR_COUNT } from "./assignments"

export function renderAvatarPreview(host: HTMLElement) {
  const root = createRoot(host)
  const indexes = Array.from({ length: PERSON_AVATAR_COUNT }, (_, index) => index)
  root.render(<main style={{ width: 800, padding: 32, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: "#161616", background: "#fff" }}>
    <h1 style={{ margin: "0 0 8px", fontSize: 24, lineHeight: "32px", fontWeight: 500 }}>EXM · 16 персонажей</h1>
    <p style={{ margin: "0 0 28px", fontSize: 14, lineHeight: "20px", color: "#646464" }}>Одна иллюстрация · CSS-кадрирование · 96 / 44 / 32 px</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px 16px" }}>
      {indexes.map((index) => <div key={index} style={{ display: "flex", alignItems: "center", flexDirection: "column", gap: 8 }}><PersonAvatar index={index} size={96} label={`Персонаж ${index + 1}`} /><span style={{ fontSize: 12, lineHeight: "16px", color: "#646464" }}>{index + 1}</span></div>)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: 0, marginTop: 32, padding: "16px 0" }}>{indexes.map((index) => <PersonAvatar key={index} index={index} size={44} />)}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: 0, padding: "20px 12px", background: "#101010", borderRadius: 12 }}>{indexes.map((index) => <PersonAvatar key={index} index={index} size={32} />)}</div>
  </main>)
  return () => root.unmount()
}
