import { DepthChart } from "@/components/ui/depth-chart"

// Usage.tsx from the 21st.dev page (DepthChartDemo), inside the two centring
// divs of the 21st preview frame so the layout matches the public preview
export default function DepthChartDemo() {
  return (
    <div className="w-screen min-h-screen flex justify-center items-center">
      <div className="w-screen min-h-screen flex justify-center items-center">
        <div className="w-full max-w-xl p-6">
          <DepthChart />
        </div>
      </div>
    </div>
  )
}
