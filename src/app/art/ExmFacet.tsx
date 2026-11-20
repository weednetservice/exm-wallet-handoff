/** An original folded aperture for EXM: three solid planes around an open centre. */
export function ExmFacet({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="exm-top" x1="40" y1="40" x2="204" y2="124" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c8e4ff" />
          <stop offset=".48" stopColor="#6faeff" />
          <stop offset="1" stopColor="#6652ef" />
        </linearGradient>
        <linearGradient id="exm-right" x1="198" y1="75" x2="103" y2="221" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8d8cff" />
          <stop offset=".55" stopColor="#4d55dc" />
          <stop offset="1" stopColor="#282b82" />
        </linearGradient>
        <linearGradient id="exm-left" x1="36" y1="82" x2="135" y2="210" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5d4bd5" />
          <stop offset=".58" stopColor="#806bfa" />
          <stop offset="1" stopColor="#a6b4ff" />
        </linearGradient>
      </defs>
      <path d="M120 18 210 69 120 121 30 69 120 18Z" fill="url(#exm-top)" />
      <path d="M210 69v103l-90 50V121l90-52Z" fill="url(#exm-right)" />
      <path d="M30 69v103l90 50V121L30 69Z" fill="url(#exm-left)" />
      <path d="m120 72 44 25v49l-44 25-44-25V97l44-25Z" fill="#0b0b20" />
      <path d="m120 72 44 25-44 25-44-25 44-25Z" fill="#20244f" />
      <path d="M76 97v49l44 25v-49L76 97Z" fill="#151737" />
      <path d="m164 97-44 25v49l44-25V97Z" fill="#10122e" />
      <path d="M120 18v54M30 69l46 28m134-28-46 28M30 172l46-26m134 26-46-26m-44 76v-51" stroke="#fff" strokeOpacity=".21" strokeWidth="1.5" />
    </svg>
  )
}
