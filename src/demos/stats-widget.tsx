import { Component } from "@/components/ui/stats-widget"

// Usage.tsx from the 21st.dev page (DemoOne), inside the two centring divs of
// the 21st preview frame so the layout matches the public preview
export default function DemoOne() {
  return (
    <div className="w-screen min-h-screen flex justify-center items-center">
      <div className="w-screen min-h-screen flex justify-center items-center">
        <Component />
      </div>
    </div>
  )
}
