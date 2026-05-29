/**
 * kv.ts — KV facade + key layout (PRD §7.2, §11.2).
 *
 * Delegates to the active backend's KV implementation (in-memory locally, the
 * KV binding on Cloudflare). Holds the prompt-dedup entries (TTL 2 min) and
 * soft rate-limit counters. `kvKeys` is the shared key layout.
 */

import { getBackend } from "./runtime.js";

export const kv = {
  get: (key: string) => getBackend().kv.get(key),
  put: (key: string, value: string, ttlSeconds?: number) => getBackend().kv.put(key, value, ttlSeconds),
  delete: (key: string) => getBackend().kv.delete(key),
};

// ---- Key builders -------------------------------------------------------

export const kvKeys = {
  dedup: (userId: string, contentHash: string) => `dedup:${userId}:${contentHash}`,
  rateLimit: (userId: string, window: string) => `ratelimit:${userId}:${window}`,
  modelCatalog: () => `model-catalog`,
};
