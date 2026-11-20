import type { SwapToken } from "./tokens"
import type { FeeEstimate, Quote, SwapCall } from "./swap"

/** Immutable values the person saw before the swipe. A background quote refresh cannot alter them. */
export type SwapReview = {
  quote: Quote
  minimum: bigint
  call: SwapCall
  fee: FeeEstimate
  input: SwapToken
  output: SwapToken
  inputId: string
  outputId: string
  needsApproval: boolean
  slippage: number
  deviation: number | null
  openedAt: number
}

export const REVIEW_MAX_AGE_MS = 45_000

export function makeSwapReview(values: SwapReview): SwapReview {
  return {
    ...values,
    quote: { ...values.quote },
    call: { ...values.call },
    fee: { ...values.fee, approve: values.fee.approve ? { ...values.fee.approve } : undefined },
    input: { ...values.input },
    output: { ...values.output },
  }
}

export function reviewIsCurrent(review: SwapReview | null, now: number, inputId: string, outputId: string): review is SwapReview {
  return !!review && now - review.openedAt < REVIEW_MAX_AGE_MS && review.inputId === inputId && review.outputId === outputId
}
