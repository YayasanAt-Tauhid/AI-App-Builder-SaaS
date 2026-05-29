/**
 * google.ts — Google Gemini streaming provider.
 *
 * Uses the streamGenerateContent endpoint with SSE. Gemini takes the system
 * instruction separately from the user content. Token usage arrives in
 * usageMetadata on the final chunks; cachedContentTokenCount reflects context
 * caching when configured.
 */

import type { GenerateOptions, ModelProvider, StreamUsage } from "./provider.js";
import { estimateTokens } from "./provider.js";
import { readSSE } from "./sse-read.js";

export class GoogleProvider implements ModelProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async *stream(opts: GenerateOptions): AsyncGenerator<string, StreamUsage, void> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.userMessage }] }],
        generationConfig: { maxOutputTokens: opts.maxOutputTokens ?? 8192 },
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await safeText(res);
      throw new Error(`google error ${res.status}: ${detail}`);
    }

    let inputTokens = estimateTokens(opts.system + opts.userMessage);
    let outputTokens = 0;
    let cached = 0;
    let fullText = "";

    for await (const rec of readSSE(res.body)) {
      const payload = safeJson(rec.data);
      if (!payload) continue;
      const parts = payload.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (typeof part.text === "string") {
          fullText += part.text;
          yield part.text;
        }
      }
      if (payload.usageMetadata) {
        inputTokens = payload.usageMetadata.promptTokenCount ?? inputTokens;
        outputTokens = payload.usageMetadata.candidatesTokenCount ?? outputTokens;
        cached = payload.usageMetadata.cachedContentTokenCount ?? cached;
      }
    }

    return {
      inputTokens,
      outputTokens: outputTokens || estimateTokens(fullText),
      providerCacheHit: cached > 0,
      engine: "google",
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
