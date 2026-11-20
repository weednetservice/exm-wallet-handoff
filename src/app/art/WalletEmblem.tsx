
/**
 * Account emblem for the account pill and the accounts sheet (drawn for this project). TEMPORARY: three sketches
 * wait for the owner's choice (antislop R-23: an emblem is an avatar-level asset).
 *
 * - `glyph`     the filled wallet glyph in the text colour, no circle: what Keeper puts in its "Money ▾" pill
 * - `badge`     the same glyph in white on a muted tone circle, the tone fixed by the account's index
 * - `monogram`  the first letter of the account name, white on the same muted tone
 *
 * Nothing is derived from the address. Tones: OKLCH lightness .50, chroma .075, so they read as identity, never as
 * the accent #3C95FA or a status colour; white on each 5.8 to 6.2 : 1; each 1.9 to 2.0 : 1 against the pill #2E3847.
 */
export type EmblemVariant = "glyph" | "badge" | "monogram"

/** slate, teal, violet, clay: by position in the account list */
export const EMBLEM_TONES = ["#41668D", "#207070", "#6A5988", "#885346"] as const

export type WalletEmblemProps = {
  variant?: EmblemVariant
  /** px, 20 to 64 (default 24) */
  size?: number
  /** account name, for the monogram */
  name?: string
  /** position in the account list, for the monogram tone */
  index?: number
  className?: string
  /** accessible name; without it the emblem is decorative (the pill's text names the account) */
  label?: string
}

const BODY = "M8 8h12a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-7a4 4 0 0 1 4-4ZM22.25 15.5a2.75 2.75 0 1 0-5.5 0 2.75 2.75 0 0 0 5.5 0Z"
const CARD = "M8 8 18.2 4.9a1.8 1.8 0 0 1 2.3 1.3L21 8"

export function WalletEmblem({ variant = "glyph", size = 24, name = "", index = 0, className, label }: WalletEmblemProps) {
  const a11y = { role: label ? "img" : undefined, "aria-label": label, "aria-hidden": label ? undefined : true, focusable: "false" } as const

  if (variant === "glyph") {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" className={className} {...a11y}>
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={CARD} />
          <path d={BODY} fill="currentColor" fillRule="evenodd" />
        </g>
      </svg>
    )
  }

  const tone = EMBLEM_TONES[Math.abs(index) % EMBLEM_TONES.length]

  if (variant === "badge") {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" className={className} {...a11y}>
        <circle cx="14" cy="14" r="14" fill={tone} />
        <g transform="translate(14 14.4) scale(.58) translate(-14 -14.4)" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d={CARD} />
          <path d={BODY} fill="#fff" fillRule="evenodd" />
        </g>
      </svg>
    )
  }

  const letter = (name.trim()[0] ?? "").toUpperCase()
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" className={className} {...a11y}>
      <circle cx="14" cy="14" r="14" fill={tone} />
      <text x="14" y="14" dy=".36em" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="600" fontFamily='"Onest Variable", system-ui, sans-serif'>
        {letter}
      </text>
    </svg>
  )
}
