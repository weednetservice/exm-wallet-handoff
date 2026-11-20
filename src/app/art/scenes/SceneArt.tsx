import type { CSSProperties } from "react"
import atlas from "./exm-scenes.webp"
import "./scene-art.css"

export type SceneArtProps = {
  variant: "empty" | "sent"
  size?: number
  label?: string
  className?: string
}

export function SceneArt({ variant, size = 144, label, className = "" }: SceneArtProps) {
  const dimension = Number.isFinite(size) && size > 0 ? size : 144
  const style: CSSProperties = { width: dimension, aspectRatio: "1" }
  return <span className={`exm-scene-art ${className}`} style={style} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-scene={variant}>
    <span className="exm-scene-art__image" aria-hidden="true" style={{ backgroundImage: `url(${atlas})`, backgroundPosition: variant === "sent" ? "100% 50%" : "0% 50%" }} />
  </span>
}
