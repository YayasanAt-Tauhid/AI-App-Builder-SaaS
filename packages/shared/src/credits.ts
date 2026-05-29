/**
 * credits.ts — Pure credit math (PRD Section 13.1).
 *
 * Credits are the universal unit of consumption. A generation debits credits
 * based on (tokens_in + tokens_out) × model_rate, rounded up. Keeping this
 * pure and shared guarantees the estimate shown to the user, the reservation
 * made on the CreditMeter, and the final settlement all agree.
 */

import { getModel } from "./models";

/** Convert a token count + model into a credit cost, rounded up. */
export function tokensToCredits(modelId: string, tokensIn: number, tokensOut: number): number {
  const model = getModel(modelId);
  const rate = model?.creditsPer1kTokens ?? 3;
  const totalTokens = Math.max(0, tokensIn) + Math.max(0, tokensOut);
  return Math.ceil((totalTokens / 1000) * rate);
}

/**
 * Estimate credits to *reserve* before a generation starts. We don't yet know
 * output size, so we assume a conservative budget. The CreditMeter reserves
 * this amount and the final settle() debits actual usage (refunding the rest).
 */
export function estimateCredits(modelId: string, promptChars: number, contextChars = 0): number {
  // Rough heuristic: ~4 chars per token. Budget for a sizable generated app.
  const estInputTokens = Math.ceil((promptChars + contextChars) / 4);
  const estOutputTokens = 4000; // assume a meaningful multi-file project
  const estimate = tokensToCredits(modelId, estInputTokens, estOutputTokens);
  // Never reserve zero — guarantees the balance/concurrency check runs.
  return Math.max(1, estimate);
}

/** The free credits granted to a user on signup (PRD 13.3). */
export const SIGNUP_GRANT_CREDITS = 200;

/** Threshold for the "soft warning at 10% remaining" guardrail (PRD 13.4). */
export function isLowBalance(balance: number, monthlyAllotment: number): boolean {
  if (monthlyAllotment <= 0) return false;
  return balance <= monthlyAllotment * 0.1;
}
