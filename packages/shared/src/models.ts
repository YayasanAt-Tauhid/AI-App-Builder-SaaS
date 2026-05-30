/**
 * models.ts — AI model catalog (PRD §9.1).
 *
 * Semua model dirutekan melalui OpenRouter (satu API key) sehingga tidak perlu
 * key terpisah per provider. PROVIDER_MODEL_IDS memetakan catalog id ke
 * OpenRouter model string. Provider field tetap menunjukkan pemilik asli model
 * (untuk UI/gating), tapi actual request semua lewat openrouter.
 */

import type { ModelInfo, Plan, PlanLimits } from "./types";

/** OpenRouter model id untuk setiap catalog id. */
export const PROVIDER_MODEL_IDS: Record<string, string> = {
  // Semua dipetakan ke model OpenRouter ":free" ($0/M) sehingga generate tidak
  // menguras saldo. Dipilih model yang kuat untuk coding; tier app dipertahankan
  // hanya untuk gating/label UI. Pro-tier dapat model terkuat, free-tier ringan.
  "claude-opus":       "moonshotai/kimi-k2.6:free",
  "claude-sonnet":     "deepseek/deepseek-v4-flash:free",
  "claude-haiku":      "openai/gpt-oss-20b:free",
  "gpt-4o":            "nvidia/nemotron-3-super-120b-a12b:free",
  "gpt-4o-mini":       "openai/gpt-oss-20b:free",
  "gemini-1.5-pro":    "moonshotai/kimi-k2.6:free",
  "gemini-1.5-flash":  "google/gemma-4-26b-a4b-it:free",
  "deepseek-coder":    "deepseek/deepseek-v4-flash:free",
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
    isDefault: true,
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

export function getModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function getDefaultModel(): ModelInfo {
  return MODEL_CATALOG.find((m) => m.isDefault) ?? MODEL_CATALOG[1];
}

export function planCanUseModel(plan: Plan, model: ModelInfo): boolean {
  if (plan === "pro") return true;
  return model.tier === "free" || model.tier === "free+pro";
}

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

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    monthlyCredits: 200,
    concurrency: 1,
    maxFiles: 30,
    maxBytes: 2 * 1024 * 1024,
    models: "free-tier",
    watermark: true,
  },
  pro: {
    monthlyCredits: 5000,
    concurrency: 3,
    maxFiles: 200,
    maxBytes: 25 * 1024 * 1024,
    models: "all",
    watermark: false,
  },
};
