/**
 * openai.ts — OpenAI-compatible streaming provider (OpenAI + DeepSeek).
 *
 * OpenAI's Chat Completions API and DeepSeek's API share the same wire format,
 * so one implementation serves both — only the base URL and engine label
 * differ. OpenAI applies prompt caching automatically for long prompts and
 * reports it under usage.prompt_tokens_details.cached_tokens, which we read to
 * populate the cache-hit metric.
 */

import type { GenerateOptions, ModelProvider, StreamUsage } from "./provider.js";
import { estimateTokens } from "./provider.js";
import { readSSE } from "./sse-read.js";

export class OpenAICompatibleProvider implements ModelProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
    private readonly engine: "openai" | "deepseek"
  ) {}

  async *stream(opts: GenerateOptions): AsyncGenerator<string, StreamUsage, void> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      signal: opts.signal,
      body: JSON.stringify({
        model: this.model,
        max_tokens: opts.maxOutputTokens ?? 8192,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.userMessage },
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await safeText(res);
      throw new Error(`${this.engine} error ${res.status}: ${detail}`);
    }

    let inputTokens = estimateTokens(opts.system + opts.userMessage);
    let outputTokens = 0;
    let cachedTokens = 0;
    let fullText = "";

    for await (const rec of readSSE(res.body)) {
      if (rec.data === "[DONE]") break;
      const payload = safeJson(rec.data);
      if (!payload) continue;
      const delta: string = payload.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        fullText += delta;
        yield delta;
      }
      if (payload.usage) {
        inputTokens = payload.usage.prompt_tokens ?? inputTokens;
        outputTokens = payload.usage.completion_tokens ?? outputTokens;
        cachedTokens = payload.usage.prompt_tokens_details?.cached_tokens ?? cachedTokens;
      }
    }

    return {
      inputTokens,
      outputTokens: outputTokens || estimateTokens(fullText),
      providerCacheHit: cachedTokens > 0,
      engine: this.engine,
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
