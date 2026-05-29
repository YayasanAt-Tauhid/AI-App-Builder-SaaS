/**
 * credits.test.ts — Pure credit math + plan gating (PRD §13).
 */
import { describe, it, expect } from "vitest";
import {
  estimateCredits,
  tokensToCredits,
  planCanUseModel,
  getModel,
  manifestPlanCheck,
  PLAN_LIMITS,
} from "@aiab/shared";

describe("credit math", () => {
  it("rounds credits up by model rate", () => {
    // claude-sonnet = 3 credits / 1k tokens. 1000 tokens → 3.
    expect(tokensToCredits("claude-sonnet", 500, 500)).toBe(3);
    // 1001 tokens rounds up.
    expect(tokensToCredits("claude-sonnet", 1000, 1)).toBe(4);
  });

  it("always reserves at least 1 credit", () => {
    expect(estimateCredits("claude-haiku", 0, 0)).toBeGreaterThanOrEqual(1);
  });
});

describe("plan gating", () => {
  it("blocks Pro-only models on Free", () => {
    expect(planCanUseModel("free", getModel("claude-opus")!)).toBe(false);
    expect(planCanUseModel("free", getModel("claude-sonnet")!)).toBe(true);
    expect(planCanUseModel("pro", getModel("claude-opus")!)).toBe(true);
  });

  it("enforces file/byte caps per plan", () => {
    expect(manifestPlanCheck(5, 1000, PLAN_LIMITS.free)).toBeNull();
    expect(manifestPlanCheck(999, 1000, PLAN_LIMITS.free)).toMatch(/file limit/);
    expect(manifestPlanCheck(5, 99 * 1024 * 1024, PLAN_LIMITS.free)).toMatch(/size limit/);
  });
});
