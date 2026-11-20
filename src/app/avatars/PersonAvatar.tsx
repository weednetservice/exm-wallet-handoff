import { useMemo, type CSSProperties } from "react"
import atlas from "../art/avatars/exm-portraits-v2.webp"
import { getPersonAvatarIndex, validAvatarIndex, type PersonAvatarKind } from "./assignments"
import "./person-avatar.css"

export type PersonAvatarProps = {
  identity?: string
  kind?: PersonAvatarKind
  size?: number
  label?: string
  className?: string
  index?: number
}

export function PersonAvatar({ identity = "", kind = "account", size = 44, label, className = "", index }: PersonAvatarProps) {
  const assigned = useMemo(() => validAvatarIndex(index) ? index : getPersonAvatarIndex(kind, identity), [index, kind, identity])
  const column = assigned % 4
  const row = Math.floor(assigned / 4)
  const style: CSSProperties = {
    width: Number.isFinite(size) && size > 0 ? size : 44,
    height: Number.isFinite(size) && size > 0 ? size : 44,
    backgroundImage: `url(${atlas})`,
    backgroundPosition: `${column * 100 / 3}% ${row * 100 / 3}%`,
  }
  return <span className={`exm-person-avatar ${className}`} style={style} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-avatar-index={assigned} />
}
