import { useEffect, useRef } from "react"

/**
 * Operation finished (sent, swapped): drawn for this project. A solid success-green #39CC83 disc with the
 * check cut in the page colour #10161F (7.4:1), read as a stamp rather than an icon in a tinted circle. With `play` the disc settles in and the check draws itself once (about half a second),
 * the only motion on the screen, because this is the moment something changed. Under
 * prefers-reduced-motion it appears in its final state.
 */
export function SuccessMark({ size = 96, play = false, className, label }: { size?: number; play?: boolean; className?: string; label?: string }) {
  const disc = useRef<SVGCircleElement>(null)
  const check = useRef<SVGPathElement>(null)

  useEffect(() => {
    if (!play || !disc.current || !check.current) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const ease = "cubic-bezier(.2, .8, .2, 1)"
    const a = disc.current.animate(
      [{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }],
      { duration: 280, easing: ease, fill: "backwards" },
    )
    const b = check.current.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
      duration: 340,
      delay: 180,
      easing: "cubic-bezier(.3, 0, .2, 1)",
      fill: "backwards",
    })
    return () => {
      a.cancel()
      b.cancel()
    }
  }, [play])

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <circle ref={disc} cx="48" cy="48" r="46" fill="#39CC83" style={{ transformOrigin: "48px 48px" }} />
      <path
        ref={check}
        d="M29 49 42 62 67 35.5"
        stroke="#10161F"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="0"
      />
    </svg>
  )
}
