// Dark theme of the liquid-glass navbar (ours) over the three backgrounds a wallet screen has:
// plain near-black, a dark gradient, and a busy chart card. Glass only shows against something.
import type { ReactNode } from "react"
import { LiquidNavbar, NimbusIcons } from "@/components/ui/liquid-glass-navbar"

const items = [
  { label: "Home", icon: NimbusIcons.home, fx: "glow" as const },
  { label: "Explore", icon: NimbusIcons.globe, fx: "spin" as const },
  { label: "Flights", icon: NimbusIcons.plane, fx: "plane" as const },
  { label: "Weather", icon: NimbusIcons.drop, fx: "drop" as const },
  { label: "Profile", icon: NimbusIcons.user, fx: "wave" as const },
]

function Band({ caption, background, children }: { caption: string; background: string; children?: ReactNode }) {
  return (
    <section className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden px-4" style={{ background }}>
      {children}
      <div className="relative">
        <LiquidNavbar theme="dark" items={items} />
      </div>
      <p className="absolute bottom-3 left-4 text-xs text-white/60">{caption}</p>
    </section>
  )
}

// a price-like line with bright accents right under the bar; the shape is drawn, not data
const line =
  "M0 150 C60 140 90 170 140 150 S220 90 280 110 S360 170 420 130 S500 60 560 95 S640 150 700 120 S790 40 850 70 S940 140 1000 100 S1100 30 1160 60 S1240 90 1280 70"

export default function DarkDemo() {
  return (
    <main className="flex min-h-screen w-full flex-col bg-[#0a0a0b]">
      <Band caption="Plain #0a0a0b" background="#0a0a0b" />
      <Band caption="Dark gradient" background="radial-gradient(120% 140% at 20% 0%, #1d2b4a 0%, #0d1220 45%, #0a0a0b 100%)" />
      <Band caption="Busy: chart card, sample shape, not real data" background="#0a0a0b">
        <svg
          className="absolute inset-x-0 top-1/2 h-[240px] w-full -translate-y-1/2"
          viewBox="0 0 1280 240"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="lgn-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#30D158" stopOpacity=".35" />
              <stop offset="1" stopColor="#30D158" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="40" y="10" width="1200" height="220" rx="24" fill="#141416" />
          <path d={line + " L1280 240 L0 240 Z"} fill="url(#lgn-area)" />
          <path d={line} fill="none" stroke="#30D158" strokeWidth="3" />
          <circle cx="560" cy="95" r="6" fill="#FF9F0A" />
          <circle cx="850" cy="70" r="6" fill="#0A84FF" />
          <circle cx="420" cy="130" r="5" fill="#fff" />
        </svg>
      </Band>
    </main>
  )
}
