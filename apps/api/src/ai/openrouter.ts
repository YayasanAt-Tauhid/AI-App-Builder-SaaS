/**
 * openrouter.ts — OpenRouter provider (OpenAI-compatible wire format).
 *
 * OpenRouter exposes all models via a single OpenAI-compatible endpoint at
 * https://openrouter.ai/api/v1 using a unified API key. We reuse the existing
 * OpenAICompatibleProvider with the OpenRouter base URL, adding the required
 * HTTP-Referer and X-Title headers so requests show up correctly in the
 * OpenRouter dashboard.
 */

import type { GenerateOptions, ModelProvider, StreamUsage } from "./provider.js";
import { estimateTokens } from "./provider.js";
import { readSSE } from "./sse-read.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export class OpenRouterProvider implements ModelProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string, // OpenRouter model id e.g. "anthropic/claude-haiku"
  ) {}

  async *stream(opts: GenerateOptions): AsyncGenerator<string, StreamUsage, void> {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://aiab.yayasan-attauhid.or.id",
        "X-Title": "AI App Builder",
      },
      signal: opts.signal,
      body: JSON.stringify({
        model: this.model,
        max_tokens: opts.maxOutputTokens ?? 8192,
        stream: true,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.userMessage },
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "<no body>");
      throw new Error(`openrouter error ${res.status}: ${detail.slice(0, 500)}`);
    }

    let inputTokens = estimateTokens(opts.system + opts.userMessage);
    let outputTokens = 0;
    let fullText = "";

    for await (const rec of readSSE(res.body)) {
      if (rec.data === "[DONE]") break;
      let payload: any;
      try { payload = JSON.parse(rec.data); } catch { continue; }
      const delta: string = payload.choices?.[0]?.delta?.content ?? "";
      if (delta) { fullText += delta; yield delta; }
      if (payload.usage) {
        inputTokens = payload.usage.prompt_tokens ?? inputTokens;
        outputTokens = payload.usage.completion_tokens ?? outputTokens;
      }
    }

    return {
      inputTokens,
      outputTokens: outputTokens || estimateTokens(fullText),
      providerCacheHit: false,
      engine: "openai", // closest label for metrics
    };
  }
}
