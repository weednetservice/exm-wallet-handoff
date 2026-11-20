import { IconSvg, type IconProps } from "./Icon"

const BODY = "M8 8h12a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-7a4 4 0 0 1 4-4Z"
const CARD = "M8 8 18.2 4.9a1.8 1.8 0 0 1 2.3 1.3L21 8"

/**
 * Wallet (tab Главная): body with a clasp dot, a card edge behind it.
 * `filled`: solid body with the clasp punched out, like Keeper's wallet glyph.
 */
export function IconWallet(props: IconProps) {
  return (
    <IconSvg {...props}>
      <path d={CARD} />
      {props.filled ? (
        <path d={BODY + "M22.25 15.5a2.75 2.75 0 1 0-5.5 0 2.75 2.75 0 0 0 5.5 0Z"} fill="currentColor" fillRule="evenodd" />
      ) : (
        <>
          <path d={BODY} />
          <circle cx="19.5" cy="15.5" r="1.75" fill="currentColor" stroke="none" />
        </>
      )}
    </IconSvg>
  )
}
