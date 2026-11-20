/**
 * Liquid Glass Navbar (Nimbus UI)
 *
 * Author:  Guglielmo Giannattasio (21st.dev @gughigug, https://guglielmogiannattasio.it)
 * Source:  https://21st.dev/@gughigug/components/liquid-glass-navbar
 * License: MIT, see licenses/liquid-glass-navbar.LICENSE
 *
 * Restored from the public 21st.dev preview bundle; names, types and comments are ours;
 * behaviour, numbers and CSS unchanged; dark theme added by us.
 *
 * How it works: a WebGL canvas (bleeding BLEED px around the pill) draws the glass rim of the
 * bar and a "water drop" lens under the active item. The lens is two capsule blobs (a leading
 * and a trailing end) on springs; when they stretch far enough the trail sheds satellite
 * droplets that merge back, and settling emits a ripple. Without WebGL a CSS pill
 * (.nimbus-drop) follows the same springs. In Chromium the bar background is refracted with
 * an SVG displacement filter inside backdrop-filter; elsewhere it is a plain blur.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react"

/** Canvas bleed around the pill, px: room for the outer shadow and ripples. */
const BLEED = 14

/** Icon frame shared by the built-in icons (18px, 1.8 stroke). */
function I(children: ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** The author's own icons (not lucide): the home icon has a `.nv-door` the "glow" effect lights up. */
export const NimbusIcons = {
  home: I(
    <>
      <path d="M3.5 11.2 12 4l8.5 7.2" />
      <path d="M6 9.6V20h12V9.6" />
      <path className="nv-door" d="M10 20v-5h4v5Z" />
    </>,
  ),
  globe: I(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" />
    </>,
  ),
  plane: I(<path d="M21 12.2 3.6 5.4l2.7 6.8-2.7 6.4L21 12.2Zm-14.7 0H13" />),
  drop: I(<path d="M12 3.5s6 6.4 6 10.6a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5Z" />),
  user: I(
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20c1.2-3.4 4-5 7.2-5s6 1.6 7.2 5" />
    </>,
  ),
}

export type NimbusTheme = "light" | "dark" | "auto"

/** Icon animation played when an item is selected. Default: "pop" when the item has an icon. */
export type NimbusFx = "pop" | "glow" | "spin" | "plane" | "drop" | "wave" | "none"

export interface NimbusItem {
  label: string
  icon?: ReactNode
  fx?: NimbusFx
  /** Renders an <a href> instead of a <button>. */
  href?: string
}

export interface LiquidNavbarProps {
  items?: NimbusItem[]
  defaultActive?: number
  /** Controlled active index. */
  active?: number
  onChange?: (index: number, item: NimbusItem) => void
  /** Text colour and glass tint for the background behind the bar (original API). */
  tone?: "light" | "dark"
  /**
   * Added by us. "dark": Apple-style dark Liquid Glass (graphite glass, neutral lens, white labels,
   * system-blue active item), tunable through the `--n-*` CSS variables listed in DARK_CSS.
   * "auto": dark while `<html>` has the `dark` class. Unset or "light": the original look, driven by `tone`.
   */
  theme?: NimbusTheme
  /** true: icons only (labels stay for screen readers); false: never compact; undefined: compact under 520px. */
  compact?: boolean
  /** Short "plip" via Web Audio on select. */
  sound?: boolean
  className?: string
  style?: CSSProperties
}

const DEFAULT_ITEMS: NimbusItem[] = [
  { label: "Home", icon: NimbusIcons.home, fx: "glow" },
  { label: "Explore", icon: NimbusIcons.globe, fx: "spin" },
  { label: "Flights", icon: NimbusIcons.plane, fx: "plane" },
  { label: "Weather", icon: NimbusIcons.drop, fx: "drop" },
  { label: "Profile", icon: NimbusIcons.user, fx: "wave" },
]

// verbatim from the bundle
const NIMBUS_CSS = `
.nimbus-nav{--n-tint:rgba(255,255,255,.14);--n-fg:#0B132B;--n-fg-soft:rgba(11,19,43,.6);--n-rim:rgba(255,255,255,.7);
  position:relative;display:inline-flex;align-items:center;gap:2px;padding:6px;border-radius:999px;isolation:isolate;
  font-family:ui-sans-serif,-apple-system,"SF Pro Text","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased;user-select:none;-webkit-tap-highlight-color:transparent}
.nimbus-nav[data-tone="dark"]{--n-tint:rgba(10,18,40,.26);--n-fg:#F1F7FF;--n-fg-soft:rgba(241,247,255,.66);--n-rim:rgba(255,255,255,.34)}
.nimbus-glass{position:absolute;inset:0;border-radius:inherit;z-index:-2;overflow:hidden;background:var(--n-tint);
  -webkit-backdrop-filter:blur(10px) saturate(1.2) brightness(1.08);backdrop-filter:blur(10px) saturate(1.2) brightness(1.08);
  box-shadow:inset 0 1px 1px var(--n-rim),inset 0 0 0 1px rgba(255,255,255,.2),0 12px 32px -14px rgba(0,40,90,.5),0 2px 6px rgba(0,40,90,.1)}
.nimbus-nav[data-refract="on"] .nimbus-glass{-webkit-backdrop-filter:url(#nimbus-refract) blur(2px) saturate(1.2) brightness(1.08);backdrop-filter:url(#nimbus-refract) blur(2px) saturate(1.2) brightness(1.08)}
.nimbus-water{position:absolute;left:${-BLEED}px;top:${-BLEED}px;z-index:-1;pointer-events:none}
.nimbus-nav[data-gl="off"] .nimbus-water{display:none}
.nimbus-drop{display:none;position:absolute;top:6px;bottom:6px;left:0;border-radius:999px;z-index:-1;pointer-events:none;will-change:transform,width;
  background:radial-gradient(120% 140% at 30% 0%,rgba(255,255,255,.75),rgba(255,255,255,0) 55%),rgba(255,255,255,.38);
  box-shadow:inset 0 1px 1px rgba(255,255,255,.95),inset 0 -2px 6px rgba(0,162,255,.22),inset 0 0 0 1px rgba(255,255,255,.55),0 6px 16px -6px rgba(0,70,140,.45)}
.nimbus-nav[data-gl="off"] .nimbus-drop{display:block}
.nimbus-item{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border:0;border-radius:999px;background:none;color:var(--n-fg-soft);
  font-family:inherit;font-weight:500;font-size:14px;line-height:1;letter-spacing:-.01em;text-decoration:none;cursor:pointer;transition:color .25s}
.nimbus-item:hover,.nimbus-item[aria-current="page"]{color:var(--n-fg)}
.nimbus-item:focus-visible{outline:2px solid #00A2FF;outline-offset:2px}
.nv-ico{position:relative;display:inline-flex;flex:none}
.nv-ico svg{transition:transform .45s cubic-bezier(.3,1.6,.5,1)}
.nimbus-item[aria-current="page"] .nv-ico svg{transform:translateY(-1px) scale(1.08)}
.nv-door{fill:transparent}
.nv-ico[data-fx="pop"] svg{animation:nvPop .5s cubic-bezier(.3,1.6,.5,1) both}
@keyframes nvPop{0%{transform:scale(.72)}60%{transform:scale(1.2)}100%{transform:translateY(-1px) scale(1.08)}}
.nv-ico[data-fx="plane"] svg{animation:nvPlane 1.15s cubic-bezier(.55,0,.3,1) both}
@keyframes nvPlane{0%{transform:none}12%{transform:translate(-3px,2px) rotate(7deg)}42%{transform:translate(64px,-26px) rotate(-24deg) scale(.9);opacity:0}43%{transform:translate(-60px,16px) rotate(-12deg) scale(.9);opacity:0}58%{opacity:1}80%{transform:translate(3px,-1px) rotate(2deg)}100%{transform:translateY(-1px) scale(1.08)}}
.nv-ico[data-fx="plane"]::after{content:"";position:absolute;left:55%;top:48%;height:2px;width:46px;border-radius:2px;transform-origin:0 50%;
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.95));animation:nvTrail 1.15s ease-out both;pointer-events:none}
@keyframes nvTrail{0%,8%{opacity:0;transform:rotate(-22deg) scaleX(0)}30%{opacity:.9;transform:rotate(-22deg) scaleX(1)}55%,100%{opacity:0;transform:rotate(-22deg) translateX(30px) scaleX(.2)}}
.nv-ico[data-fx="drop"] svg{animation:nvDrop .95s cubic-bezier(.4,0,.3,1) both;transform-origin:50% 100%}
@keyframes nvDrop{0%{transform:translateY(-1px)}26%{transform:translateY(-13px) scale(.88,1.12)}46%{transform:translateY(3px) scale(1.3,.68)}62%{transform:translateY(-3px) scale(.92,1.08)}80%{transform:translateY(0) scale(1.04,.97)}100%{transform:translateY(-1px) scale(1.08)}}
.nv-ico[data-fx="drop"]::before,.nv-ico[data-fx="drop"]::after{content:"";position:absolute;bottom:0;left:50%;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:currentColor;opacity:0;pointer-events:none}
.nv-ico[data-fx="drop"]::before{animation:nvSplashL .95s ease-out both}
.nv-ico[data-fx="drop"]::after{animation:nvSplashR .95s ease-out both}
@keyframes nvSplashL{0%,44%{opacity:0;transform:none}50%{opacity:.9;transform:translate(-5px,-6px)}75%,100%{opacity:0;transform:translate(-11px,1px) scale(.4)}}
@keyframes nvSplashR{0%,44%{opacity:0;transform:none}50%{opacity:.9;transform:translate(5px,-7px)}75%,100%{opacity:0;transform:translate(12px,1px) scale(.4)}}
.nv-ico[data-fx="spin"] svg{animation:nvSpin 1s cubic-bezier(.2,.75,.25,1) both}
@keyframes nvSpin{0%{transform:perspective(80px) rotateY(0)}100%{transform:perspective(80px) rotateY(360deg) translateY(-1px) scale(1.08)}}
.nv-ico[data-fx="glow"] svg{animation:nvHop .8s cubic-bezier(.3,1.4,.5,1) both;transform-origin:50% 100%}
@keyframes nvHop{0%{transform:none}30%{transform:translateY(-5px) scale(1.04,.96)}55%{transform:translateY(0) scale(1.12,.88)}75%{transform:translateY(-2px) scale(.98,1.04)}100%{transform:translateY(-1px) scale(1.08)}}
.nv-ico[data-fx="glow"] .nv-door{animation:nvDoor 1.3s ease both}
@keyframes nvDoor{0%{fill:transparent}30%{fill:#FFF3A8}100%{fill:rgba(126,232,255,.6)}}
.nv-ico[data-fx="wave"] svg{animation:nvWave .9s ease-in-out both;transform-origin:50% 92%}
@keyframes nvWave{0%{transform:none}20%{transform:rotate(-15deg)}40%{transform:rotate(12deg)}60%{transform:rotate(-8deg)}80%{transform:rotate(4deg)}100%{transform:translateY(-1px) scale(1.08)}}
.nimbus-nav[data-compact="true"] .nimbus-item{padding:0 13px}
.nimbus-nav[data-compact="true"] .nimbus-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:520px){.nimbus-nav:not([data-compact="false"]) .nimbus-item{padding:0 13px}.nimbus-nav:not([data-compact="false"]) .nimbus-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}}
@media (prefers-reduced-motion:reduce){.nv-ico svg,.nv-ico::before,.nv-ico::after,.nv-door{animation:none!important;transition:none}}
`

const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}"

// lens + rim shader, verbatim from the bundle
const FRAG = `precision highp float;
uniform vec2 uRes;uniform float uDpr;uniform float uTime;uniform vec4 uPill;
uniform vec4 uBlob[6];uniform float uSy[6];uniform vec4 uRip[6];uniform vec3 uMouse;uniform float uDark;uniform float uAmb;
float sdRB(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float sdCap(vec2 p,vec4 B,float sy){p-=B.xy;p.y/=sy;p.x=max(abs(p.x)-B.z,0.);return(length(p)-B.w)*min(1.,sy);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float dropD(vec2 p){float d=1e4;for(int i=0;i<6;i++){if(uBlob[i].w>.5){d=smin(d,sdCap(p,uBlob[i],uSy[i]),13.);}}return d;}
float pillD(vec2 p){vec2 h=uPill.zw*.5;return sdRB(p-uPill.xy-h,h,h.y);}
float lens(float d,float w){float t=clamp(-d/w,0.,1.);return sqrt(1.-(1.-t)*(1.-t));}
float waves(vec2 p){float w=0.;
 for(int i=0;i<6;i++){vec4 R=uRip[i];if(R.w>0.){float x=length(p-R.xy)-R.z*240.;w+=R.w*exp(-R.z*1.7)*sin(x*.3)*exp(-x*x/700.);}}
 vec2 m=p-uMouse.xy;w+=uMouse.z*3.6*exp(-dot(m,m)/1000.);
 w+=uAmb*(sin(p.x*.05+uTime*1.2)*.45+sin(p.x*.13-uTime*.85+p.y*.2)*.25);return w;}
float H(vec2 p){float dp=pillD(p);return lens(dp,uPill.w*.36)*2.4+lens(dropD(p),11.)*7.5+waves(p)*smoothstep(0.,7.,-dp);}
float caus(vec2 p,float t){vec2 q=p;float c=0.;for(int i=0;i<3;i++){q+=vec2(sin(q.y*1.1+t),cos(q.x*1.3-t*.7))*.6;c+=1./(1.+16.*abs(sin(q.x)*sin(q.y)));}return c/3.;}
void main(){
 vec2 p=vec2(gl_FragCoord.x,uRes.y*uDpr-gl_FragCoord.y)/uDpr;
 float dp=pillD(p);float dd=dropD(p);
 float h0=H(p);vec3 n=normalize(vec3(h0-H(p+vec2(1.,0.)),h0-H(p+vec2(0.,1.)),1.));
 vec3 V=vec3(0.,0.,1.);
 float spec=pow(max(dot(reflect(-normalize(vec3(-.45,-.8,.85)),n),V),0.),70.);
 float spec2=pow(max(dot(reflect(-normalize(vec3(.6,.75,.7)),n),V),0.),22.)*.3;
 float fres=clamp((1.-n.z)*4.,0.,1.);
 vec3 irid=.5+.5*cos(6.2831*(vec3(0.,.33,.67)+fres*.85+p.x*.0028+uTime*.035));
 float pm=smoothstep(1.,-1.,dp);float dm=smoothstep(1.,-1.,dd)*smoothstep(1.,-2.,dp);
 float sh=smoothstep(9.,-9.,dropD(p-vec2(0.,5.)))*(1.-dm)*pm*(.11+.07*uDark);
 vec3 c=vec3(0.,.14,.36)*sh;float a=sh;
 float pa=clamp(pm*(fres*.5+spec*.9+spec2),0.,1.);
 c=mix(vec3(1.),irid,.5*fres)*pa+c*(1.-pa);a=pa+a*(1.-pa);
 float th=lens(dd,11.);
 float cs=caus((p+n.xy*th*18.)*.085,uTime*.9);
 vec3 tint=mix(vec3(.80,.95,1.),vec3(.55,.82,1.),uDark);
 float rim=dm*(1.-smoothstep(0.,8.,-dd));
 float cres=dm*smoothstep(.12,.55,dot(n.xy,normalize(vec2(.55,.85))))*smoothstep(0.,3.,-dd);
 float body=.5+.5*clamp(-n.y*3.,-1.,1.);
 float da=dm*(.26+.14*body)*(1.-.35*uDark);vec3 dc=mix(tint,vec3(1.),body*.6);
 float la=rim*.22;vec3 lc=mix(vec3(0.,.42,.78),vec3(.1,.55,.95),uDark);dc=lc*la+dc*da*(1.-la);da=la+da*(1.-la);
 la=clamp(cres*.7+smoothstep(.6,1.,cs)*.28*th*dm,0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=clamp(dm*(spec*1.2+spec2*.5),0.,1.);dc=vec3(1.)*la+dc*(1.-la);da=la+da*(1.-la);
 la=dm*smoothstep(-2.,0.,dd)*.4;dc=mix(vec3(1.),irid,.35)*la+dc*(1.-la);da=la+da*(1.-la);
 c=dc+c*(1.-da);a=da+a*(1.-da);
 gl_FragColor=vec4(c,a);
}`

/*
 * Dark theme (ours). Reference: Apple's own iOS 26 Liquid Glass in dark appearance (Apple TV tab bar,
 * HIG "Materials", regular variant). Measured there: graphite bar about rgb(24) over black, hairline top
 * rim, active lens a lighter neutral grey about rgb(58), near-white labels, system-blue active item,
 * no coloured tint. Only colours and amounts change; springs, lens, refraction and timings are shared.
 * Everything is a CSS variable, so a page can retune it without touching this file.
 *   --n-tint               glass fill over the backdrop
 *   --n-filter(-refract)   backdrop filter: blur + lower luminosity (HIG: "adjusts the luminosity of background content")
 *   --n-fg / --n-fg-soft / --n-fg-active   hover / idle / active label colour (.92 / .72 / 1: three distinct steps)
 *   --n-ico-active         active icon: system blue, the one accent. The label stays white because blue text
 *                          on the lens dropped to 2.8:1 over a bright chart; the icon keeps >= 4.9:1 (3:1 needed)
 *   --n-focus              keyboard focus ring (system blue)
 *   --n-rim, --n-edge      top highlight and hairline edge; --n-shadow  elevation under the bar
 *   --n-lens-*             WebGL lens: tint (r,g,b 0..1), alpha, rim colour and alpha, inner shadow; --n-bar-rim-alpha  bar edge glints
 *   --n-lens-edge-alpha / --n-lens-irid   specular edge and chromatic fringe at rest; both rise to the original
 *                          full rim while the drop travels (glass that lights up on interaction), quiet when settled
 */
const DARK_CSS = `
.nimbus-nav[data-theme="dark"]{--n-tint:rgba(38,38,41,.5);--n-fg:rgba(255,255,255,.92);--n-fg-soft:rgba(255,255,255,.72);--n-fg-active:#fff;--n-ico-active:#5EB0FF;
  --n-rim:rgba(255,255,255,.12);--n-edge:rgba(255,255,255,.08);--n-shadow:0 10px 30px -12px rgba(0,0,0,.75),0 1px 3px rgba(0,0,0,.4);
  --n-filter:blur(14px) saturate(1.6) brightness(.72);--n-filter-refract:url(#nimbus-refract) blur(3px) saturate(1.6) brightness(.72);
  --n-focus:#0A84FF;--n-lens-tint:.9,.92,.96;--n-lens-alpha:.4;--n-lens-rim:.85,.88,.95;--n-lens-rim-alpha:.18;
  --n-lens-shadow:0,0,0;--n-lens-shadow-alpha:.2;--n-bar-rim-alpha:.5;--n-lens-edge-alpha:.35;--n-lens-irid:.1}
.nimbus-nav[data-theme="dark"] .nimbus-glass{background:var(--n-tint);-webkit-backdrop-filter:var(--n-filter);backdrop-filter:var(--n-filter);
  box-shadow:inset 0 1px 1px var(--n-rim),inset 0 0 0 1px var(--n-edge),var(--n-shadow)}
.nimbus-nav[data-theme="dark"][data-refract="on"] .nimbus-glass{-webkit-backdrop-filter:var(--n-filter-refract);backdrop-filter:var(--n-filter-refract)}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.nimbus-nav[data-theme="dark"] .nimbus-glass{background:rgba(30,30,33,.9)}}
@media (prefers-reduced-transparency:reduce){.nimbus-nav[data-theme="dark"] .nimbus-glass{background:rgba(30,30,33,.94)}}
.nimbus-nav[data-theme="dark"] .nimbus-item[aria-current="page"]{color:var(--n-fg-active)}
.nimbus-nav[data-theme="dark"] .nv-ico{transition:color .35s}
.nimbus-nav[data-theme="dark"] .nimbus-item[aria-current="page"] .nv-ico{color:var(--n-ico-active,var(--n-fg-active))}
.nimbus-nav[data-theme="dark"] .nimbus-item[aria-current="page"] .nv-ico svg{stroke-width:2.2}
.nimbus-nav[data-theme="dark"] .nimbus-item::after{content:"";position:absolute;inset:-1px 0}
.nimbus-nav[data-theme="dark"] .nimbus-item:focus-visible{outline-color:var(--n-focus)}
.nimbus-nav[data-theme="dark"] .nimbus-drop{background:radial-gradient(120% 140% at 30% 0%,rgba(255,255,255,.2),rgba(255,255,255,0) 55%),rgba(255,255,255,.1);
  box-shadow:inset 0 1px 1px rgba(255,255,255,.3),inset 0 0 0 1px rgba(255,255,255,.1),0 6px 16px -6px rgba(0,0,0,.6)}
`

/** Replace one exact fragment of the shader; throws instead of silently compiling the wrong material. */
function swap(src: string, from: string, to: string) {
  if (!src.includes(from)) throw new Error(`liquid-glass-navbar: shader fragment not found: ${from}`)
  return src.replace(from, to)
}

/**
 * The bundled shader with its water-blue constants turned into uniforms (dark theme only).
 * The light path keeps FRAG byte for byte.
 */
const FRAG_DARK = [
  ["uniform float uAmb;", "uniform float uAmb;uniform vec3 uTint;uniform float uLensA;uniform vec3 uLensRim;uniform float uLensRimA;uniform vec3 uShC;uniform float uShA;uniform float uBarRimA;uniform float uEdgeA;uniform float uIrid;"],
  ["*pm*(.11+.07*uDark);", "*pm*uShA;"],
  ["vec3 c=vec3(0.,.14,.36)*sh;", "vec3 c=uShC*sh;"],
  ["float pa=clamp(pm*(fres*.5+spec*.9+spec2),0.,1.);", "float pa=clamp(pm*(fres*.5+spec*.9+spec2)*uBarRimA,0.,1.);"],
  ["vec3 tint=mix(vec3(.80,.95,1.),vec3(.55,.82,1.),uDark);", "vec3 tint=uTint;"],
  ["float da=dm*(.26+.14*body)*(1.-.35*uDark);", "float da=dm*(.26+.14*body)*uLensA;"],
  ["float la=rim*.22;vec3 lc=mix(vec3(0.,.42,.78),vec3(.1,.55,.95),uDark);", "float la=rim*uLensRimA;vec3 lc=uLensRim;"],
  ["la=clamp(cres*.7+smoothstep(.6,1.,cs)*.28*th*dm,0.,1.);", "la=clamp((cres*.7+smoothstep(.6,1.,cs)*.28*th*dm)*uEdgeA,0.,1.);"],
  ["la=clamp(dm*(spec*1.2+spec2*.5),0.,1.);", "la=clamp(dm*(spec*1.2+spec2*.5)*uEdgeA,0.,1.);"],
  ["la=dm*smoothstep(-2.,0.,dd)*.4;dc=mix(vec3(1.),irid,.35)*la", "la=dm*smoothstep(-2.,0.,dd)*.4*uEdgeA;dc=mix(vec3(1.),irid,uIrid)*la"],
].reduce((src, [from, to]) => swap(src, from, to), FRAG)

/** Dark material for the shader, read from the CSS variables above (so CSS overrides reach WebGL too). */
interface LensMaterial {
  tint: number[]
  alpha: number
  rim: number[]
  rimAlpha: number
  shadow: number[]
  shadowAlpha: number
  barRimAlpha: number
  edgeAlpha: number
  irid: number
}
function readLensMaterial(el: Element): LensMaterial {
  const cs = getComputedStyle(el)
  const nums = (name: string, fallback: number[]) => {
    const v = cs.getPropertyValue(name).split(",").map((n) => parseFloat(n))
    return v.length === fallback.length && v.every((n) => Number.isFinite(n)) ? v : fallback
  }
  return {
    tint: nums("--n-lens-tint", [0.9, 0.92, 0.96]),
    alpha: nums("--n-lens-alpha", [0.4])[0],
    rim: nums("--n-lens-rim", [0.85, 0.88, 0.95]),
    rimAlpha: nums("--n-lens-rim-alpha", [0.18])[0],
    shadow: nums("--n-lens-shadow", [0, 0, 0]),
    shadowAlpha: nums("--n-lens-shadow-alpha", [0.2])[0],
    barRimAlpha: nums("--n-bar-rim-alpha", [0.5])[0],
    edgeAlpha: nums("--n-lens-edge-alpha", [0.35])[0],
    irid: nums("--n-lens-irid", [0.1])[0],
  }
}

/** true while <html> has the `dark` class (only observed when `enabled`). */
function useHtmlDark(enabled: boolean) {
  const [isDark, setIsDark] = useState(
    () => enabled && typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  )
  useEffect(() => {
    if (!enabled) return
    const html = document.documentElement
    const read = () => setIsDark(html.classList.contains("dark"))
    read()
    const mo = new MutationObserver(read)
    mo.observe(html, { attributes: true, attributeFilter: ["class"] })
    return () => mo.disconnect()
  }, [enabled])
  return enabled && isDark
}

interface Spring {
  x: number
  v: number
}
interface Satellite {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  k: number
}
interface Ripple {
  x: number
  y: number
  age: number
  amp: number
}
type Uniform =
  | "uRes" | "uDpr" | "uTime" | "uPill" | "uBlob" | "uSy" | "uRip" | "uMouse" | "uDark" | "uAmb"
  // dark program only
  | "uTint" | "uLensA" | "uLensRim" | "uLensRimA" | "uShC" | "uShA" | "uBarRimA" | "uEdgeA" | "uIrid"
interface GLCtx {
  gl: WebGLRenderingContext
  u: Record<Uniform, WebGLUniformLocation | null>
  prog: WebGLProgram
  buf: WebGLBuffer | null
  loc: number
  dark: boolean
}
interface NavState {
  /** the two ends of the drop (one leads, one trails) */
  a: Spring
  b: Spring
  /** vertical squash */
  sy: { s: number; v: number }
  lead: 0 | 1
  /** until this time the trailing end barely moves */
  lagFrom: number
  sats: Satellite[]
  rips: Ripple[]
  /** target: centre x / y, half straight length q, radius r */
  t: { x: number; cy: number; q: number; r: number }
  q: number
  mouse: { x: number; y: number; s: number; on: boolean }
  moving: boolean
  split: boolean
  ready: boolean
  w: number
  h: number
  visible: boolean
  reduce: boolean
  raf: number
  last: number
  time: number
  glc: GLCtx | null
  /** compiled programs, so a theme switch does not recompile */
  progs: { light?: GLCtx; dark?: GLCtx }
  lens: LensMaterial | null
}

function makeState(): NavState {
  return {
    a: { x: 0, v: 0 },
    b: { x: 0, v: 0 },
    sy: { s: 1, v: 0 },
    lead: 0,
    lagFrom: 0,
    sats: [],
    rips: [],
    t: { x: 0, cy: 0, q: 0, r: 21 },
    q: 0,
    mouse: { x: 0, y: 0, s: 0, on: false },
    moving: false,
    split: false,
    ready: false,
    w: 0,
    h: 0,
    visible: true,
    reduce: false,
    raf: 0,
    last: 0,
    time: 0,
    glc: null,
    progs: {},
    lens: null,
  }
}

function initGL(canvas: HTMLCanvasElement, dark = false): GLCtx | null {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false })
  if (!gl) return null
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
  }
  const vs = sh(gl.VERTEX_SHADER, VERT)
  const fs = sh(gl.FRAGMENT_SHADER, dark ? FRAG_DARK : FRAG)
  if (!vs || !fs) return null
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  // one oversized triangle covers the viewport
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, "a")
  const u = {} as GLCtx["u"]
  for (const name of [
    "uRes", "uDpr", "uTime", "uPill", "uBlob", "uSy", "uRip", "uMouse", "uDark", "uAmb",
    "uTint", "uLensA", "uLensRim", "uLensRimA", "uShC", "uShA", "uBarRimA", "uEdgeA", "uIrid",
  ] as const)
    u[name] = gl.getUniformLocation(prog, name)
  const ctx = { gl, u, prog, buf, loc, dark }
  bindGL(ctx)
  return ctx
}

/** Make a program current (the light and dark programs share one canvas context). */
function bindGL({ gl, prog, buf, loc }: GLCtx) {
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
}

/** SVG filters inside backdrop-filter: Chromium only (Safari and Firefox fall back to plain blur). */
function supportsRefraction() {
  if (typeof window === "undefined" || typeof CSS === "undefined") return false
  const ua = navigator.userAgent
  return /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua) && !!CSS.supports?.("backdrop-filter", "url(#a)")
}

export function LiquidNavbar({
  items = DEFAULT_ITEMS,
  defaultActive = 0,
  active: activeProp,
  onChange,
  tone = "light",
  theme,
  compact,
  sound = false,
  className,
  style,
}: LiquidNavbarProps) {
  const [activeState, setActiveState] = useState(defaultActive)
  const active = activeProp ?? activeState
  const navRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dropRef = useRef<HTMLSpanElement>(null)
  const itemRefs = useRef<(HTMLElement | null)[]>([])
  const iconRefs = useRef<(HTMLSpanElement | null)[]>([])
  const audioRef = useRef<AudioContext | null>(null)
  const stateRef = useRef<NavState>(makeState())
  const [glMode, setGlMode] = useState<"on" | "off">("on")
  const [refract, setRefract] = useState(false)
  const [fx, setFx] = useState({ i: -1, n: 0 })
  const dark = tone === "dark" ? 1 : 0
  const darkRef = useRef(dark)
  darkRef.current = dark
  // dark theme (ours); separate from `tone`, which keeps its original meaning
  const htmlDark = useHtmlDark(theme === "auto")
  const isDark = theme === "dark" || htmlDark
  const isDarkRef = useRef(isDark)
  isDarkRef.current = isDark

  /** Paint one frame: shader uniforms, or the CSS drop when WebGL is off. */
  const draw = useCallback(() => {
    const s = stateRef.current
    const t = s.t
    const gap = Math.abs(s.a.x - s.b.x)
    const stretch = Math.min(gap / (2 * (s.q + t.r) || 1), 1)
    const r = t.r * (1 - 0.3 * stretch)
    if (s.glc) {
      const { gl, u } = s.glc
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.uniform2f(u.uRes, s.w + BLEED * 2, s.h + BLEED * 2)
      gl.uniform1f(u.uDpr, dpr)
      gl.uniform1f(u.uTime, s.time)
      gl.uniform4f(u.uPill, BLEED, BLEED, s.w, s.h)
      const blobs = new Float32Array(24)
      const sy = new Float32Array(6).fill(1)
      const lead = s.lead === 0 ? s.a : s.b
      const trail = s.lead === 0 ? s.b : s.a
      blobs.set(
        [lead.x, t.cy, s.q * (1 - 0.25 * stretch), t.r * (1 - 0.12 * stretch), trail.x, t.cy, s.q * (1 - 0.8 * stretch), t.r * (1 - 0.5 * stretch)],
        0,
      )
      sy[0] = sy[1] = s.sy.s
      s.sats.slice(0, 4).forEach((p, n) => blobs.set([p.x, p.y, 0, p.r], 8 + n * 4))
      gl.uniform4fv(u.uBlob, blobs)
      gl.uniform1fv(u.uSy, sy)
      const rips = new Float32Array(24)
      s.rips.slice(-6).forEach((p, n) => rips.set([p.x, p.y, p.age, p.amp], n * 4))
      gl.uniform4fv(u.uRip, rips)
      gl.uniform3f(u.uMouse, s.mouse.x, s.mouse.y, s.mouse.s)
      gl.uniform1f(u.uDark, darkRef.current)
      gl.uniform1f(u.uAmb, s.reduce ? 0 : 1)
      if (s.glc.dark && s.lens) {
        const m = s.lens
        gl.uniform3f(u.uTint, m.tint[0], m.tint[1], m.tint[2])
        gl.uniform1f(u.uLensA, m.alpha)
        gl.uniform3f(u.uLensRim, m.rim[0], m.rim[1], m.rim[2])
        gl.uniform1f(u.uLensRimA, m.rimAlpha)
        gl.uniform3f(u.uShC, m.shadow[0], m.shadow[1], m.shadow[2])
        gl.uniform1f(u.uShA, m.shadowAlpha)
        gl.uniform1f(u.uBarRimA, m.barRimAlpha)
        // full chromatic rim (the original 1 and .35) only while the drop moves
        const motion = Math.min(Math.max(Math.abs(s.a.v), Math.abs(s.b.v)) / 600, 1)
        gl.uniform1f(u.uEdgeA, m.edgeAlpha + (1 - m.edgeAlpha) * motion)
        gl.uniform1f(u.uIrid, m.irid + (0.35 - m.irid) * motion)
      }
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    } else if (dropRef.current) {
      const left = Math.min(s.a.x, s.b.x) - s.q - r - BLEED
      const width = gap + 2 * (s.q + r)
      dropRef.current.style.width = `${width}px`
      dropRef.current.style.transform = `translateX(${left}px) scaleY(${s.sy.s})`
    }
  }, [])

  /** Advance the springs by dt seconds. */
  const step = useCallback((dt: number, now: number) => {
    const s = stateRef.current
    const t = s.t
    s.time += dt
    s.q += (t.q - s.q) * Math.min(1, dt * 12)
    const ends = [s.a, s.b]
    let settled = true
    if (s.reduce) {
      s.a.x = s.b.x = t.x
      s.a.v = s.b.v = 0
      s.sy.s = 1
      s.sats = []
    } else {
      ends.forEach((e, i) => {
        const isLead = i === s.lead
        const k = isLead ? 210 : 72
        const c = isLead ? 25 : 13
        const hold = !isLead && now < s.lagFrom ? 0.08 : 1
        e.v += (k * (t.x - e.x) - c * e.v) * dt * hold
        e.x += e.v * dt
        const min = BLEED + 6 + s.q + t.r - 3
        const max = BLEED + s.w - 6 - s.q - t.r + 3
        // hitting the bar's end squashes the drop and bounces it back
        if (e.x < min || e.x > max) {
          s.sy.v -= Math.min(Math.abs(e.v), 900) * 0.0016
          e.x = Math.max(min, Math.min(max, e.x))
          e.v *= -0.25
        }
        if (Math.abs(t.x - e.x) > 0.3 || Math.abs(e.v) > 3) settled = false
      })
      const leadEnd = ends[s.lead]
      const squash = 1 - 0.2 * Math.min(Math.abs(leadEnd.v) / 1500, 1)
      s.sy.v += (280 * (squash - s.sy.s) - 9 * s.sy.v) * dt
      s.sy.s += s.sy.v * dt
      if (Math.abs(s.sy.s - 1) > 0.002 || Math.abs(s.sy.v) > 0.02) settled = false
      const gap = Math.abs(s.a.x - s.b.x)
      const r = t.r * (1 - 0.3 * Math.min(gap / (2 * (t.q + t.r) || 1), 1))
      // stretched past breaking point: shed three droplets between the ends
      if (!s.split && s.moving && gap - 2 * t.q - 2 * r > -6) {
        s.split = true
        const trail = ends[1 - s.lead]
        const lead = ends[s.lead]
        ;[0.3, 0.5, 0.72].forEach((f, n) => {
          s.sats.push({
            x: trail.x + (lead.x - trail.x) * f + (Math.random() - 0.5) * 6,
            y: t.cy + (Math.random() - 0.5) * 10,
            vx: (trail.v + lead.v) * 0.45,
            vy: (Math.random() - 0.5) * 60,
            r: 5 + Math.random() * 3 - n * 0.5,
            k: 70 + Math.random() * 90,
          })
        })
      }
      s.sats = s.sats.filter((p) => {
        p.vx += (p.k * (t.x - p.x) - 9 * p.vx) * dt
        p.vy += (90 * (t.cy - p.y) - 7 * p.vy) * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.x = Math.max(BLEED + 8 + p.r, Math.min(BLEED + s.w - 8 - p.r, p.x))
        p.y = Math.max(t.cy - t.r + p.r, Math.min(t.cy + t.r - p.r, p.y))
        if (Math.abs(t.x - p.x) < t.q + t.r * 0.5) p.r -= dt * 26
        return p.r > 0.6
      })
      if (s.sats.length) settled = false
    }
    if (s.moving && settled) {
      s.moving = false
      if (s.split || !s.reduce) s.rips.push({ x: t.x, y: t.cy, age: 0, amp: s.split ? 1.2 : 0.7 })
    }
    s.rips.forEach((p) => (p.age += dt))
    s.rips = s.rips.filter((p) => p.age < 2.4)
    const on = s.mouse.on ? 1 : 0
    s.mouse.s += (on - s.mouse.s) * Math.min(1, dt * 7)
  }, [])

  /** Start the rAF loop if it is not running. It stops itself when idle under reduced motion or off screen. */
  const kick = useCallback(() => {
    const s = stateRef.current
    if (s.raf) return
    s.last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - s.last) / 1e3, 0.03333333333333333)
      s.last = now
      step(dt, now)
      draw()
      const busy = s.moving || s.rips.length || s.sats.length || s.mouse.s > 0.01
      s.raf = s.visible && (!s.reduce || busy) ? requestAnimationFrame(tick) : 0
    }
    s.raf = requestAnimationFrame(tick)
  }, [draw, step])

  /** Read the layout: bar size, active item geometry; retarget the drop and size the canvas. */
  const measure = useCallback(() => {
    const nav = navRef.current
    const item = itemRefs.current[active]
    if (!nav || !item) return
    const s = stateRef.current
    s.w = nav.offsetWidth
    s.h = nav.offsetHeight
    const t = s.t
    t.r = item.offsetHeight / 2
    t.q = Math.max(0, item.offsetWidth / 2 - t.r)
    t.cy = BLEED + item.offsetTop + item.offsetHeight / 2
    const x = BLEED + item.offsetLeft + item.offsetWidth / 2
    if (s.ready) {
      if (Math.abs(x - t.x) > 0.5) {
        s.lead = Math.abs(x - s.a.x) <= Math.abs(x - s.b.x) ? 0 : 1
        s.lagFrom = performance.now() + 70
        s.moving = true
        s.split = false
      }
    } else {
      s.a.x = s.b.x = x
      s.q = t.q
      s.ready = true
    }
    t.x = x
    const canvas = canvasRef.current
    if (canvas) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const cw = s.w + BLEED * 2
      const ch = s.h + BLEED * 2
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr)
        canvas.height = Math.round(ch * dpr)
        canvas.style.width = `${cw}px`
        canvas.style.height = `${ch}px`
      }
    }
    kick()
  }, [active, kick])

  useEffect(() => {
    setRefract(supportsRefraction())
    const s = stateRef.current
    s.reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const canvas = canvasRef.current
    s.glc = canvas ? (isDarkRef.current ? s.progs.dark : s.progs.light) ?? initGL(canvas, isDarkRef.current) : null
    if (s.glc) {
      s.progs[s.glc.dark ? "dark" : "light"] = s.glc
      bindGL(s.glc)
      if (s.glc.dark && navRef.current) s.lens = readLensMaterial(navRef.current)
    }
    if (!s.glc) setGlMode("off")
    const lost = (e: Event) => {
      e.preventDefault()
      s.glc = null
      s.progs = {}
      setGlMode("off")
    }
    canvas?.addEventListener("webglcontextlost", lost)
    const io = new IntersectionObserver(([entry]) => {
      s.visible = entry.isIntersecting
      if (s.visible) kick()
    })
    if (navRef.current) io.observe(navRef.current)
    const vis = () => {
      s.visible = document.visibilityState === "visible"
      if (s.visible) kick()
    }
    document.addEventListener("visibilitychange", vis)
    return () => {
      canvas?.removeEventListener("webglcontextlost", lost)
      io.disconnect()
      document.removeEventListener("visibilitychange", vis)
      cancelAnimationFrame(s.raf)
      s.raf = 0
    }
  }, [kick])

  useLayoutEffect(() => {
    measure()
  }, [measure, items.length, compact])

  const measureRef = useRef(measure)
  measureRef.current = measure
  useEffect(() => {
    // width changes (fonts, compact breakpoint) snap the drop to its item again
    let lastWidth = -1
    const ro = new ResizeObserver(() => {
      const w = navRef.current?.offsetWidth ?? 0
      if (w !== lastWidth) {
        lastWidth = w
        stateRef.current.ready = false
        measureRef.current()
      }
    })
    if (navRef.current) ro.observe(navRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    kick()
  }, [tone, kick])

  // theme switch (ours): swap shader program and re-read the CSS material; a no-op on the light path
  useEffect(() => {
    const s = stateRef.current
    if (!isDark && !s.glc?.dark) return
    if (isDark && navRef.current) s.lens = readLensMaterial(navRef.current)
    const canvas = canvasRef.current
    if (s.glc && canvas && s.glc.dark !== isDark) {
      const next = (isDark ? s.progs.dark : s.progs.light) ?? initGL(canvas, isDark)
      if (next) {
        s.progs[isDark ? "dark" : "light"] = next
        bindGL(next)
        s.glc = next
      }
    }
    kick()
  }, [isDark, kick])

  /** Client point to canvas coordinates. */
  const local = (x: number, y: number) => {
    const r = navRef.current!.getBoundingClientRect()
    return { x: x - r.left + BLEED, y: y - r.top + BLEED }
  }
  const ripple = (x: number, y: number, amp: number) => {
    const s = stateRef.current
    if (!s.reduce) {
      s.rips.push({ x, y, age: 0, amp })
      kick()
    }
  }
  const iconCenter = (i: number) => {
    const el = iconRefs.current[i]
    if (!el) return null
    const r = el.getBoundingClientRect()
    return local(r.left + r.width / 2, r.top + r.height / 2)
  }
  const plip = () => {
    if (!sound) return
    try {
      const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!
      const ac = audioRef.current || (audioRef.current = new Ctx())
      const t0 = ac.currentTime
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(420 + Math.random() * 80, t0)
      osc.frequency.exponentialRampToValueAtTime(1500, t0 + 0.07)
      gain.gain.setValueAtTime(1e-4, t0)
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.008)
      gain.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.16)
      osc.connect(gain).connect(ac.destination)
      osc.start(t0)
      osc.stop(t0 + 0.18)
    } catch {
      // audio is a nicety
    }
  }
  const select = (i: number) => {
    const effect = items[i]?.fx ?? (items[i]?.icon ? "pop" : "none")
    setFx((p) => ({ i, n: p.n + 1 }))
    plip()
    const c = iconCenter(i)
    if (c && effect === "drop") setTimeout(() => ripple(c.x, stateRef.current.t.cy, 1.4), 430)
    if (c && effect === "plane") ripple(c.x, c.y, 0.6)
    if (i !== active) {
      if (activeProp === undefined) setActiveState(i)
      onChange?.(i, items[i])
    }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    const next = (active + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length
    select(next)
    itemRefs.current[next]?.focus()
  }
  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return
    const p = local(e.clientX, e.clientY)
    const s = stateRef.current
    s.mouse.x = p.x
    s.mouse.y = p.y
    s.mouse.on = true
    kick()
  }

  return (
    <nav
      ref={navRef}
      className={["nimbus-nav", className].filter(Boolean).join(" ")}
      data-tone={tone}
      data-theme={isDark ? "dark" : undefined}
      data-gl={glMode}
      data-compact={compact === undefined ? undefined : String(compact)}
      data-refract={refract ? "on" : "off"}
      aria-label="Main"
      onKeyDown={onKeyDown}
      onPointerMove={onMove}
      onPointerLeave={() => {
        stateRef.current.mouse.on = false
        kick()
      }}
      onPointerDown={(e) => {
        const p = local(e.clientX, e.clientY)
        ripple(p.x, p.y, 0.8)
      }}
      style={style}
    >
      <style dangerouslySetInnerHTML={{ __html: NIMBUS_CSS + DARK_CSS }} />
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="nimbus-refract" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.02" numOctaves="2" seed="7" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale="60" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <span className="nimbus-glass" aria-hidden="true" />
      <canvas className="nimbus-water" ref={canvasRef} aria-hidden="true" />
      <span className="nimbus-drop" ref={dropRef} aria-hidden="true" />
      {items.map((item, i) => {
        const effect = item.fx ?? "pop"
        const playing = fx.i === i && effect !== "none"
        const common = {
          ref: (el: HTMLElement | null) => {
            itemRefs.current[i] = el
          },
          className: "nimbus-item",
          "aria-current": i === active ? ("page" as const) : undefined,
          onClick: () => select(i),
        }
        const content = (
          <>
            {item.icon && (
              // the key remounts the span so the CSS animation restarts on every click
              <span
                key={playing ? fx.n : 0}
                className="nv-ico"
                data-fx={playing ? effect : undefined}
                ref={(el) => {
                  iconRefs.current[i] = el
                }}
              >
                {item.icon}
              </span>
            )}
            <span className="nimbus-label">{item.label}</span>
          </>
        )
        return item.href ? (
          <a key={item.label + i} {...common} href={item.href} aria-label={item.label}>
            {content}
          </a>
        ) : (
          <button key={item.label + i} {...common} type="button" aria-label={item.label}>
            {content}
          </button>
        )
      })}
    </nav>
  )
}
