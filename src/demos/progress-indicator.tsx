import ProgressIndicator from "@/components/ui/progress-indicator";

export function ProgressIndicatorDemo() {
    return <ProgressIndicator />;
}

// Preview frame, same layout as the 21st.dev preview harness: full-height
// centered box with p-16 and antialiased text (the harness sets it on <body>).
export default function DemoOne() {
  return (
    <div className="relative flex items-center justify-center h-screen w-full m-auto p-16 antialiased">
      <div className="flex w-full justify-center relative">
        <ProgressIndicatorDemo />
      </div>
    </div>
  )
}
