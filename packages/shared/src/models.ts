/**
 * models.ts — The AI model catalog (PRD Section 9.1).
 *
 * Eight models across four providers. This catalog is the single source of
 * truth the API serves at GET /api/models (edge-cached, TTL 5 min) and that
 * the client renders in the model picker. Exact provider model IDs are kept
 * here so the catalog can be updated server-side without client changes.
 */

import type { ModelInfo, Plan, PlanLimits } from "./types";

/**
 * The provider-specific model id used when calling each provider's API.
 * Separated from the catalog `id` (a stable public handle) so we can swap the
 * underlying version without breaking saved projects. We default Claude flows
 * to the latest, most capable models per the PRD guidance.
 */
export const PROVIDER_MODEL_IDS: Record<string, string> = {
  "claude-opus": "claude-opus-4-8",
  "claude-sonnet": "claude-sonnet-4-6",
  "claude-haiku": "claude-haiku-4-5-20251001",
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "gemini-1.5-pro": "gemini-1.5-pro",
  "gemini-1.5-flash": "gemini-1.5-flash",
  "deepseek-coder": "deepseek-chat",
};

export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "claude-opus",
    name: "Claude Opus",
    provider: "anthropic",
    tier: "pro",
    isDefault: false,
    strength: "Best reasoning & code quality",
    relativeCost: "high",
    creditsPer1kTokens: 15,
  },
  {
    id: "claude-sonnet",
    name: "Claude Sonnet",
    provider: "anthropic",
    tier: "free+pro",
    isDefault: true, // PRD default: balanced quality/speed
    strength: "Balanced quality/speed",
    relativeCost: "medium",
    creditsPer1kTokens: 3,
  },
  {
    id: "claude-haiku",
    name: "Claude Haiku",
    provider: "anthropic",
    tier: "free",
    isDefault: false,
    strength: "Fast, cheap",
    relativeCost: "low",
    creditsPer1kTokens: 1,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    tier: "pro",
    isDefault: false,
    strength: "Strong general + multimodal",
    relativeCost: "high",
    creditsPer1kTokens: 10,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "openai",
    tier: "free",
    isDefault: false,
    strength: "Fast, cheap",
    relativeCost: "low",
    creditsPer1kTokens: 1,
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "google",
    tier: "pro",
    isDefault: false,
    strength: "Long context",
    relativeCost: "medium-high",
    creditsPer1kTokens: 7,
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "google",
    tier: "free",
    isDefault: false,
    strength: "Fast, long context",
    relativeCost: "low",
    creditsPer1kTokens: 1,
  },
  {
    id: "deepseek-coder",
    name: "DeepSeek-V3 / Coder",
    provider: "deepseek",
    tier: "free+pro",
    isDefault: false,
    strength: "Code-specialized, cost-efficient",
    relativeCost: "low",
    creditsPer1kTokens: 1,
  },
];

/** Look up a model by its catalog id. */
export function getModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

/** The default model handed to new sessions. */
export function getDefaultModel(): ModelInfo {
  return MODEL_CATALOG.find((m) => m.isDefault) ?? MODEL_CATALOG[1];
}

/** Whether a plan may use a given model (PRD Section 13.2 model gating). */
export function planCanUseModel(plan: Plan, model: ModelInfo): boolean {
  if (plan === "pro") return true; // Pro: all 8 models
  // Free: any model whose tier includes free.
  return model.tier === "free" || model.tier === "free+pro";
}

/**
 * Enforce per-plan project scope caps (PRD Open Question 5 resolution):
 * file count + total source bytes. Returns an error message if the manifest
 * exceeds the plan's caps, or null if it's within limits.
 */
export function manifestPlanCheck(fileCount: number, byteCount: number, limits: PlanLimits): string | null {
  if (fileCount > limits.maxFiles) {
    return `Project exceeds the ${limits.maxFiles}-file limit for your plan (${fileCount} files). Upgrade for larger projects.`;
  }
  if (byteCount > limits.maxBytes) {
    const mb = (limits.maxBytes / (1024 * 1024)).toFixed(0);
    return `Project exceeds the ${mb} MB source size limit for your plan. Upgrade for larger projects.`;
  }
  return null;
}

/** Per-plan limits (PRD Section 13.2 + Open Question 5 resolution). */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    monthlyCredits: 200,
    concurrency: 1,
    maxFiles: 30,
    maxBytes: 2 * 1024 * 1024, // 2 MB
    models: "free-tier",
    watermark: true,
  },
  pro: {
    monthlyCredits: 5000,
    concurrency: 3,
    maxFiles: 200,
    maxBytes: 25 * 1024 * 1024, // 25 MB
    models: "all",
    watermark: false,
  },
};
