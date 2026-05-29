/**
 * anthropic.ts — Real Anthropic (Claude) streaming provider.
 *
 * Uses the Messages API with streaming. Crucially, it marks the large static
 * system prompt with `cache_control: { type: "ephemeral" }`, enabling Anthropic
 * prompt caching (PRD §9.3, §10.2): on the iterate loop the cached prefix cuts
 * both first-token latency and cost. We surface whether the cache was read via
 * `providerCacheHit` so it feeds the cache-hit-rate metric (PRD §17).
 */

import type { GenerateOptions, ModelProvider, StreamUsage } from "./provider.js";
import { estimateTokens } from "./provider.js";
import { readSSE } from "./sse-read.js";

export class AnthropicProvider implements ModelProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async *stream(opts: GenerateOptions): AsyncGenerator<string, StreamUsage, void> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: opts.signal,
      body: JSON.stringify({
        model: this.model,
        max_tokens: opts.maxOutputTokens ?? 8192,
        // Cache the system prompt prefix so repeated generations reuse it.
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: opts.userMessage }],
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await safeText(res);
      throw new Error(`Anthropic error ${res.status}: ${detail}`);
    }

    let inputTokens = estimateTokens(opts.system + opts.userMessage);
    let outputTokens = 0;
    let cacheRead = 0;
    let fullText = "";

    for await (const rec of readSSE(res.body)) {
      const payload = safeJson(rec.data);
      if (!payload) continue;
      if (payload.type === "message_start") {
        const u = payload.message?.usage ?? {};
        inputTokens = u.input_tokens ?? inputTokens;
        cacheRead = u.cache_read_input_tokens ?? 0;
      } else if (payload.type === "content_block_delta" && payload.delta?.type === "text_delta") {
        const delta: string = payload.delta.text ?? "";
        fullText += delta;
        yield delta;
      } else if (payload.type === "message_delta") {
        outputTokens = payload.usage?.output_tokens ?? outputTokens;
      }
    }

    return {
      inputTokens,
      outputTokens: outputTokens || estimateTokens(fullText),
      providerCacheHit: cacheRead > 0,
      engine: "anthropic",
    };
  }
}

function safeJson(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
