/**
 * Progress Indicator
 *
 * Original author: Anurag Mishra (21st.dev @anurag-mishra22)
 * Component page: https://21st.dev/@anurag-mishra22/components/progress-indicator
 * License: MIT, see licenses/progress-indicator.LICENSE
 *
 * Source restored from the public 21st.dev preview bundle: names, types and
 * comments are ours, behaviour, numbers and CSS unchanged (Tailwind v3 classes
 * mapped to v4 where the output differs). framer-motion is replaced by its
 * successor motion/react (same API).
 */
import { useState } from "react";
import { motion } from "motion/react";
import { createLucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// The bundle ships lucide-react 0.544.0, whose "circle-check" tick is drawn
// differently from lucide 1.x. This is the 0.544.0 icon node, so the icon on
// "Finish" renders exactly as in the original.
const CircleCheck = createLucideIcon("circle-check", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "m9 12 2 2 4-4", key: "dzmm74" }],
]);

type Step = 1 | 2 | 3;

const STEPS: Step[] = [1, 2, 3];

// Tailwind v3 -> v4 mapping (v4 palette is OKLCH and renders differently):
//   bg-gray-300 -> #d1d5db, bg-green-500 -> #22c55e, bg-gray-100 -> #f3f4f6,
//   hover:bg-gray-50 -> #f9fafb (the v3 hex values).
// -translate-y-1/2 -> [transform:translateY(-50%)]: in v3 it is a `transform`,
//   which motion's inline `transform: none` (x: 0) overrides, so it has no
//   effect; v4 would emit the separate `translate` property and move the pill
//   up by 12px.
// The Back button's hover border used the old preview theme's `--border`
//   (light hsl(240 5.9% 90%), dark hsl(240 3.7% 15.9%)); it is scoped here.
// [outline-color:revert] on both buttons: the original shows the browser's
//   default focus ring; this project's base layer recolours every outline to
//   ring/50, so the buttons revert to the user-agent colour.

const ProgressIndicator = () => {
  const [step, setStep] = useState<Step>(1);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleContinue = () => {
    if (step < 3) {
      setStep((step + 1) as Step);
      setIsExpanded(false);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setIsExpanded(true);
    }
    if (step > 1) {
      setStep((step - 1) as Step);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-8">
      <div className="flex items-center gap-6 relative">
        {STEPS.map((dot) => (
          <div
            key={dot}
            className={cn(
              "w-2 h-2 rounded-full relative z-10",
              dot <= step ? "bg-white" : "bg-[#d1d5db]",
            )}
          />
        ))}

        {/* green pill behind the dots, grows to the current step */}
        <motion.div
          initial={{ width: "12px", height: "24px", x: 0 }}
          animate={{
            width: step === 1 ? "24px" : step === 2 ? "60px" : "96px",
            x: 0,
          }}
          className="absolute -left-[8px] -top-[8px] [transform:translateY(-50%)] h-3 bg-[#22c55e] rounded-full"
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 20,
            mass: 0.8,
            bounce: 0.25,
            duration: 0.6,
          }}
        />
      </div>

      <div className="w-full max-w-sm">
        <motion.div
          className="flex items-center gap-1"
          animate={{
            justifyContent: isExpanded ? "stretch" : "space-between",
          }}
        >
          {!isExpanded && (
            <motion.button
              initial={{ opacity: 0, width: 0, scale: 0.8 }}
              animate={{ opacity: 1, width: "64px", scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 15,
                mass: 0.8,
                bounce: 0.25,
                duration: 0.6,
                opacity: { duration: 0.2 },
              }}
              onClick={handleBack}
              className="px-4 py-3 text-black flex items-center justify-center bg-[#f3f4f6] font-semibold rounded-full hover:bg-[#f9fafb] hover:border border-[hsl(240_5.9%_90%)] dark:border-[hsl(240_3.7%_15.9%)] [outline-color:revert] transition-colors flex-1 w-16 text-sm"
            >
              Back
            </motion.button>
          )}

          <motion.button
            onClick={handleContinue}
            animate={{
              flex: isExpanded ? 1 : "inherit",
            }}
            className={cn(
              "px-4 py-3 rounded-full text-white bg-[#006cff] [outline-color:revert] transition-colors flex-1 w-56",
              !isExpanded && "w-44",
            )}
          >
            <div className="flex items-center font-[600] justify-center gap-2 text-sm">
              {step === 3 && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 15,
                    mass: 0.5,
                    bounce: 0.4,
                  }}
                >
                  <CircleCheck size={16} />
                </motion.div>
              )}
              {step === 3 ? "Finish" : "Continue"}
            </div>
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
};

export default ProgressIndicator;
