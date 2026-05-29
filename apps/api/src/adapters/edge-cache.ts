/**
 * edge-cache.ts — Local stand-in for the Workers Cache API (PRD Section 10).
 *
 * The PRD edge-caches idempotent GETs: the model catalog (TTL 5 min) and
 * project lists (TTL 30s, stale-while-revalidate 2 min). We model both fresh
 * and stale windows, plus the invalidation triggers from §10.5 (e.g. clearing
 * a user's project-list cache when they create/rename/delete a project).
 *
 * Each lookup reports a cache status (HIT / STALE / MISS) so routes can set the
 * `X-Cache` header and feed the cache-hit-rate metric the PRD tracks (§17).
 */

import { analytics } from "../util/logger.js";

type CacheStatus = "HIT" | "STALE" | "MISS";

interface CacheRecord {
  body: string;
  freshUntil: number;
  staleUntil: number;
}

class EdgeCache {
  private store = new Map<string, CacheRecord>();

  /**
   * Read-through cache. `compute` runs on MISS (and in the background on STALE
   * to refresh, emulating stale-while-revalidate).
   */
  async get(
    key: string,
    opts: { ttlSeconds: number; swrSeconds?: number },
    compute: () => Promise<string> | string
  ): Promise<{ body: string; status: CacheStatus }> {
    const rec = this.store.get(key);
    const nowMs = Date.now();

    if (rec && nowMs < rec.freshUntil) {
      analytics.track("cache_hit", { key });
      return { body: rec.body, status: "HIT" };
    }

    if (rec && nowMs < rec.staleUntil) {
      // Serve stale immediately, refresh in the background (SWR).
      analytics.track("cache_hit", { key, swr: true });
      void Promise.resolve(compute()).then((fresh) =>
        this.set(key, fresh, opts.ttlSeconds, opts.swrSeconds)
      );
      return { body: rec.body, status: "STALE" };
    }

    analytics.track("cache_miss", { key });
    const fresh = await compute();
    this.set(key, fresh, opts.ttlSeconds, opts.swrSeconds);
    return { body: fresh, status: "MISS" };
  }

  set(key: string, body: string, ttlSeconds: number, swrSeconds = 0): void {
    const nowMs = Date.now();
    this.store.set(key, {
      body,
      freshUntil: nowMs + ttlSeconds * 1000,
      staleUntil: nowMs + (ttlSeconds + swrSeconds) * 1000,
    });
  }

  /** Invalidate a single key (PRD §10.5 triggers). */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate every key matching a prefix (e.g. a user's project lists). */
  invalidatePrefix(prefix: string): void {
    for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
  }
}

export const edgeCache = new EdgeCache();

export const cacheKeys = {
  models: () => "GET:/api/models",
  projectList: (userId: string) => `GET:/api/projects:${userId}`,
  projectListPrefix: (userId: string) => `GET:/api/projects:${userId}`,
};
