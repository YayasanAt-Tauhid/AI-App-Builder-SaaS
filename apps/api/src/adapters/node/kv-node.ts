/**
 * kv-node.ts — Node KV backend: in-memory Map with per-key TTL.
 *
 * Models Cloudflare KV's TTL semantics (`expirationTtl` in seconds). Holds the
 * prompt-dedup entries and soft rate-limit counters. Async to match the KV
 * binding; the Cloudflare backend swaps this for the real namespace.
 */

import type { KvBackend } from "../runtime.js";

interface Entry {
  value: string;
  expiresAt: number | null;
}

export function createNodeKv(): KvBackend {
  const map = new Map<string, Entry>();
  return {
    async get(key) {
      const e = map.get(key);
      if (!e) return null;
      if (e.expiresAt !== null && Date.now() > e.expiresAt) {
        map.delete(key);
        return null;
      }
      return e.value;
    },
    async put(key, value, ttlSeconds) {
      map.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
    },
    async delete(key) {
      map.delete(key);
    },
  };
}
