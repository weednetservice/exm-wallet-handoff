/**
 * Stats Widget
 *
 * Original author: Ravi Katiyar (21st.dev @ravikatiyar162)
 * Component page: https://21st.dev/@ravikatiyar162/components/stats-widget
 * License: no public license on 21st.dev (empty). Used with the author's
 * permission, reported by the project owner on 2026-11-14.
 * See licenses/stats-widget.LICENSE.
 *
 * Source restored from the public 21st.dev preview bundle: names, types and
 * comments are ours, behaviour, numbers and CSS unchanged.
 *
 * Note: `Component` injects a global <style> (as the original does) that
 * redefines :root/.dark tokens (--background, --card, --border, ...) as HSL
 * triplets while it is mounted. `StatsWidget` alone needs the tokens
 * --success, --destructive, --success-stroke and --destructive-stroke from it.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"

export interface Stats {
  /** headline value, rendered as "$" + amount (no formatting) */
  amount: number
  /** percent change; sign picks the colour and the arrow, the label shows Math.abs */
  change: number
  /** sparkline points on a 0-100 scale, at least 2 (the demo uses 7) */
  chartData: number[]
}

export interface StatsWidgetProps {
  /** controlled data; when set, the demo ticker (random values every 3 s) is off */
  stats?: Stats
  /** period label in front of the change */
  label?: string
}

const getRandom = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

/** smooth line through evenly spaced points; values 0-100 map to 10%-90% of the height */
const generateSmoothPath = (data: number[], width: number, height: number) => {
  if (!data || data.length < 2) return `M 0 ${height}`
  const step = width / (data.length - 1)
  const points = data.map((value, i) => {
    const x = i * step
    const y = height - (value / 100) * (height * 0.8) - height * 0.1
    return [x, y]
  })
  let path = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const x1 = points[i][0]
    const y1 = points[i][1]
    const x2 = points[i + 1][0]
    const y2 = points[i + 1][1]
    const midX = (x1 + x2) / 2
    path += ` C ${midX},${y1} ${midX},${y2} ${x2},${y2}`
  }
  return path
}

const INITIAL_STATS: Stats = {
  amount: 283,
  change: 36,
  chartData: [30, 55, 45, 75, 60, 85, 70],
}

export const StatsWidget = ({ stats, label = "This Week" }: StatsWidgetProps = {}) => {
  const [demoStats, setDemoStats] = useState<Stats>(INITIAL_STATS)
  const linePathRef = useRef<SVGPathElement>(null)
  const areaPathRef = useRef<SVGPathElement>(null)
  const current = stats ?? demoStats
  const controlled = stats !== undefined

  const updateStats = () => {
    const amount = getRandom(100, 999)
    const change = getRandom(-50, 100)
    const chartData = Array.from({ length: 7 }, () => getRandom(10, 90))
    setDemoStats({ amount, change, chartData })
  }

  useEffect(() => {
    if (controlled) return
    const id = setInterval(updateStats, 3e3)
    return () => clearInterval(id)
  }, [controlled])

  const width = 150
  const height = 60
  const linePath = useMemo(() => generateSmoothPath(current.chartData, width, height), [current.chartData])
  const areaPath = useMemo(
    () => (linePath.startsWith("M") ? `${linePath} L ${width} ${height} L 0 ${height} Z` : ""),
    [linePath],
  )

  // redraw the line (stroke-dashoffset) and fade the area in on every data change
  useEffect(() => {
    const line = linePathRef.current
    const area = areaPathRef.current
    if (line && area) {
      const length = line.getTotalLength()
      line.style.transition = "none"
      line.style.strokeDasharray = length + " " + length
      line.style.strokeDashoffset = String(length)
      area.style.transition = "none"
      area.style.opacity = "0"
      line.getBoundingClientRect()
      line.style.transition = "stroke-dashoffset 0.8s ease-in-out, stroke 0.5s ease"
      line.style.strokeDashoffset = "0"
      area.style.transition = "opacity 0.8s ease-in-out 0.2s, fill 0.5s ease"
      area.style.opacity = "1"
    }
  }, [linePath])

  const isPositive = current.change >= 0
  const changeColorClass = isPositive ? "text-success" : "text-destructive"
  const strokeColor = isPositive ? "var(--success-stroke)" : "var(--destructive-stroke)"
  const gradientId = isPositive ? "areaGradientSuccess" : "areaGradientDestructive"

  return (
    <div className="w-full max-w-md bg-card text-card-foreground rounded-3xl shadow-lg p-6 border">
      <div className="flex justify-between items-center">
        <div className="flex flex-col w-1/2">
          <div className="flex items-center text-muted-foreground text-md">
            <span>{label}</span>
            <span className={`ml-2 flex items-center font-semibold ${changeColorClass}`}>
              {Math.abs(current.change)}%
              {isPositive ? <ArrowUp size={16} className="ml-1" /> : <ArrowDown size={16} className="ml-1" />}
            </span>
          </div>
          <p className="text-4xl font-bold text-foreground mt-2">${current.amount}</p>
        </div>
        <div className="w-1/2 h-16">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="areaGradientSuccess" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--success-stroke)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--success-stroke)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="areaGradientDestructive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--destructive-stroke)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--destructive-stroke)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path ref={areaPathRef} d={areaPath} fill={`url(#${gradientId})`} />
            <path
              ref={linePathRef}
              d={linePath}
              fill="none"
              stroke={strokeColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}

/** theme tokens, card colours and the scrolling diagonal background of the 21st demo, verbatim */
const COMPONENT_CSS = `
                :root {
                  --background: 0 0% 100%;
                  --foreground: 222.2 84% 4.9%;
                  --card: 0 0% 100%;
                  --card-foreground: 222.2 84% 4.9%;
                  --muted: 210 40% 96.1%;
                  --muted-foreground: 215.4 16.3% 46.9%;
                  --border: 214.3 31.8% 91.4%;
                  --success: 142.1 76.2% 41.2%;
                  --destructive: 0 84.2% 60.2%;
                  --success-stroke: #22C55E;
                  --destructive-stroke: #F97316;
                  --diag-line-color: #e2e8f0;
                  --diag-bg-color: #f1f5f9;
                }
                
                .dark {
                  --background: 222.2 84% 4.9%;
                  --foreground: 210 40% 98%;
                  --card: 222.2 84% 4.9%;
                  --card-foreground: 210 40% 98%;
                  --muted: 217.2 32.6% 17.5%;
                  --muted-foreground: 215 20.2% 65.1%;
                  --border: 217.2 32.6% 17.5%;
                  --success: 142.1 70.2% 45.2%;
                  --destructive: 0 72.2% 50.6%;
                  --success-stroke: #22C55E;
                  --destructive-stroke: #F97316;
                  --diag-line-color: #1e293b;
                  --diag-bg-color: #0f172a;
                }

                .bg-background { background-color: hsl(var(--background)); }
                .text-foreground { color: hsl(var(--foreground)); }
                .bg-card { background-color: hsl(var(--card)); }
                .text-card-foreground { color: hsl(var(--card-foreground)); }
                .text-muted-foreground { color: hsl(var(--muted-foreground)); }
                .border { border-color: hsl(var(--border)); }
                .text-success { color: hsl(var(--success)); }
                .text-destructive { color: hsl(var(--destructive)); }
                
                @keyframes diagonal-scroll {
                    from { background-position: 0 0; }
                    to { background-position: -56px 56px; }
                }

                .diagonal-lines-bg {
                    background-color: var(--diag-bg-color);
                    background-image: repeating-linear-gradient(
                        45deg,
                        var(--diag-line-color) 0,
                        var(--diag-line-color) 1px,
                        transparent 1px,
                        transparent 28px
                    );
                    animation: diagonal-scroll 20s linear infinite;
                }
            `

export function Component() {
  return (
    <>
      <style>{COMPONENT_CSS}</style>
      <div className="w-full min-h-screen flex flex-col items-center justify-center font-sans p-4 diagonal-lines-bg bg-background transition-colors duration-300">
        <StatsWidget />
      </div>
    </>
  )
}
