export function ExmKeyMark({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M20 2 37 7 46 21 39 39 23 47 7 38 2 23 11 8Z" fill="#201746" stroke="#17132B" strokeWidth="1.5" />
      <path d="M20 2 37 7 41 14 20 12 11 8Z" fill="#0757E7" />
      <path d="M2 23 11 8 20 12 11 27Z" fill="#9BE6EC" />
      <path d="M11 27 20 12 27 20 22 33 7 38Z" fill="#A7A0FF" />
      <path d="M20 12 41 14 46 21 27 20Z" fill="#B879EF" />
      <path d="M27 20 46 21 39 39 23 47 22 33Z" fill="#1269EA" />
      <path d="M7 38 22 33 23 47Z" fill="#A745D5" />
      <path d="M20 12 27 20 22 33 11 27Z" fill="#211A56" />
      <path d="M24 16a5 5 0 0 0-3.3 8.76L16 36h16l-4.7-11.24A5 5 0 0 0 24 16Z" fill="#A8F1EF" stroke="#17132B" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
