import { useState } from "react"
import { PredictionMarket, type PredictionOrder, type PredictionOutcome } from "@/components/ui/prediction-market"

/**
 * PredictionMarketPreview from the 21st.dev bundle (larsen66/be-ui-prediction-market),
 * unchanged: a controlled Yes/No ticket opened on "Buy Yes, $115".
 * Prices, balance and positions are the author's sample values, not market data.
 * The outer div is the 21st.dev preview harness (App / App$1), kept so the layout matches.
 */
const OUTCOMES: PredictionOutcome[] = [
  { id: "yes", label: "Yes", price: 0.167 },
  { id: "no", label: "No", price: 0.834 },
]

export default function PredictionMarketPreview() {
  const [order, setOrder] = useState<PredictionOrder>({ mode: "buy", outcomeId: "yes", amount: "115" })

  return (
    <div className="w-screen min-h-screen flex justify-center items-center">
      <div className="flex w-full items-center justify-center">
        <PredictionMarket
          outcomes={OUTCOMES}
          value={order}
          onValueChange={setOrder}
          balance={500}
          positions={{ yes: 125, no: 48 }}
          quickAmounts={[1, 5, 10, 100]}
        />
      </div>
    </div>
  )
}
