/**
 * provider.ts — The unified ModelProvider abstraction (PRD §9.2).
 *
 * Every provider (real or mock) implements the same `stream` contract: an async
 * generator that yields text deltas and *returns* a usage summary when done.
 * The generation service consumes deltas for SSE and uses the returned usage to
 * settle credits. A factory picks the real provider when its API key is present
 * and falls back to the deterministic mock otherwise — the "mock + real-key
 * ready" behavior chosen for this build.
 */

import { getModel, PROVIDER_MODEL_IDS } from "@aiab/shared";
import { env, providerKeyFor } from "../env.js";
import { log } from "../util/logger.js";
import { MockProvider } from "./mock.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAICompatibleProvider } from "./openai.js";
import { GoogleProvider } from "./google.js";

export interface GenerateOptions {
  modelId: string;
  system: string;
  userMessage: string;
  signal?: AbortSignal;
  /** Cap output tokens to prevent runaway cost (PRD §13.4). */
  maxOutputTokens?: number;
}

export interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
  /** True when the provider reported a prompt-cache hit (PRD §10 metric). */
  providerCacheHit: boolean;
  /** Which engine actually served the request, for logging/metrics. */
  engine: "anthropic" | "openai" | "google" | "deepseek" | "mock";
}

export interface ModelProvider {
  stream(opts: GenerateOptions): AsyncGenerator<string, StreamUsage, void>;
}

/**
 * Resolve a provider for a catalog model id. Returns the real integration when
 * its key is configured (and FORCE_MOCK is off); otherwise the mock so the app
 * keeps working with zero credentials.
 */
export function getProvider(modelId: string): { provider: ModelProvider; providerModelId: string; engine: string } {
  const model = getModel(modelId);
  if (!model) {
    log.warn("provider.unknown_model", { modelId });
    return { provider: new MockProvider(), providerModelId: modelId, engine: "mock" };
  }

  const providerModelId = PROVIDER_MODEL_IDS[modelId] ?? modelId;
  const key = providerKeyFor(model.provider);

  if (env.forceMock || !key) {
    return { provider: new MockProvider(), providerModelId, engine: "mock" };
  }

  switch (model.provider) {
    case "anthropic":
      return { provider: new AnthropicProvider(key, providerModelId), providerModelId, engine: "anthropic" };
    case "openai":
      return {
        provider: new OpenAICompatibleProvider(key, providerModelId, "https://api.openai.com/v1", "openai"),
        providerModelId,
        engine: "openai",
      };
    case "deepseek":
      return {
        provider: new OpenAICompatibleProvider(key, providerModelId, "https://api.deepseek.com/v1", "deepseek"),
        providerModelId,
        engine: "deepseek",
      };
    case "google":
      return { provider: new GoogleProvider(key, providerModelId), providerModelId, engine: "google" };
    default:
      return { provider: new MockProvider(), providerModelId, engine: "mock" };
  }
}

/** Cheap token estimate (~4 chars/token) used by mock + as a usage fallback. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
