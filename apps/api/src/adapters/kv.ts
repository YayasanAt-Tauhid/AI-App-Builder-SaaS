/**
 * kv.ts — Local stand-in for Cloudflare KV (PRD 7.2, 11.2).
 *
 * KV holds non-transactional, fast-lookup data: the model-catalog cache, soft
 * rate-limit counters, and — most importantly for the generation path — the
 * prompt dedup entries (key `dedup:{userId}:{contentHash}`, TTL 2 min).
 * Implemented as an in-memory Map with per-key expiry, matching KV's TTL
 * semantics. A real deployment swaps this for the KV binding.
 */

interface Entry {
  value: string;
  expiresAt: number | null;
}

class KvStore {
  private map = new Map<string, Entry>();

  get(key: string): string | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && Date.now() > e.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return e.value;
  }

  /** Put with optional TTL in seconds (KV's `expirationTtl`). */
  put(key: string, value: string, ttlSeconds?: number): void {
    this.map.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  /** Atomic-ish increment for soft rate-limit counters. */
  increment(key: string, ttlSeconds: number): number {
    const current = Number(this.get(key) ?? 0) + 1;
    this.put(key, String(current), ttlSeconds);
    return current;
  }
}

export const kv = new KvStore();

// ---- Key builders -------------------------------------------------------

export const kvKeys = {
  dedup: (userId: string, contentHash: string) => `dedup:${userId}:${contentHash}`,
  rateLimit: (userId: string, window: string) => `ratelimit:${userId}:${window}`,
  modelCatalog: () => `model-catalog`,
};
