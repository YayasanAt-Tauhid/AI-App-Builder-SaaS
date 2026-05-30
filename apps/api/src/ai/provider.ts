/**
 * provider.ts — ModelProvider abstraction (PRD §9.2).
 *
 * Semua model dirutekan melalui OpenRouter dengan satu API key. Mock digunakan
 * jika OPENROUTER_API_KEY tidak di-set atau FORCE_MOCK=1.
 */

import { getModel, PROVIDER_MODEL_IDS } from "@aiab/shared";
import { env } from "../env.js";
import { log } from "../util/logger.js";
import { MockProvider } from "./mock.js";
import { OpenRouterProvider } from "./openrouter.js";

export interface GenerateOptions {
  modelId: string;
  system: string;
  userMessage: string;
  signal?: AbortSignal;
  maxOutputTokens?: number;
}

export interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
  providerCacheHit: boolean;
  engine: "anthropic" | "openai" | "google" | "deepseek" | "mock";
}

export interface ModelProvider {
  stream(opts: GenerateOptions): AsyncGenerator<string, StreamUsage, void>;
}

export function getProvider(modelId: string): { provider: ModelProvider; providerModelId: string; engine: string } {
  const model = getModel(modelId);
  if (!model) {
    log.warn("provider.unknown_model", { modelId });
    return { provider: new MockProvider(), providerModelId: modelId, engine: "mock" };
  }

  const providerModelId = PROVIDER_MODEL_IDS[modelId] ?? modelId;

  if (env.forceMock || !env.openrouterApiKey) {
    return { provider: new MockProvider(), providerModelId, engine: "mock" };
  }

  // Cost guard: allow ":free" ($0) models, plus an explicit allowlist of cheap
  // paid models we've opted into. Anything else falls back to the mock instead
  // of silently spending the OpenRouter balance. ALLOW_PAID_MODELS=1 lifts it.
  const PAID_ALLOWLIST = new Set<string>([
    "deepseek/deepseek-v4-flash", // ~$0.1-0.2/M tokens, fast & reliable
  ]);
  const allowPaid = process.env.ALLOW_PAID_MODELS === "1";
  const permitted =
    providerModelId.endsWith(":free") || PAID_ALLOWLIST.has(providerModelId);
  if (!allowPaid && !permitted) {
    log.warn("provider.blocked_paid_model", { modelId, providerModelId });
    return { provider: new MockProvider(), providerModelId, engine: "mock" };
  }

  return {
    provider: new OpenRouterProvider(env.openrouterApiKey, providerModelId),
    providerModelId,
    engine: model.provider as any,
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
