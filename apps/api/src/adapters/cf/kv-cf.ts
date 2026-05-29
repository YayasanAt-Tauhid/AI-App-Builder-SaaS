/**
 * kv-cf.ts — Cloudflare KV backend.
 *
 * Maps the runtime's KvBackend onto the KV namespace, translating our
 * ttlSeconds to KV's `expirationTtl`. Holds the prompt-dedup entries (TTL 2 min)
 * and soft rate-limit counters (PRD §10.3, §11.2). Note KV enforces a 60s
 * minimum TTL, so very short TTLs are clamped.
 */

import type { KVNamespace } from "@cloudflare/workers-types";
import type { KvBackend } from "../runtime.js";

export function createCfKv(ns: KVNamespace): KvBackend {
  return {
    async get(key) {
      return ns.get(key);
    },
    async put(key, value, ttlSeconds) {
      // KV requires expirationTtl >= 60s.
      const expirationTtl = ttlSeconds ? Math.max(60, ttlSeconds) : undefined;
      await ns.put(key, value, expirationTtl ? { expirationTtl } : {});
    },
    async delete(key) {
      await ns.delete(key);
    },
  };
}
