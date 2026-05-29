/**
 * metrics.ts — GET /api/metrics (PRD §17).
 *
 * Exposes the in-memory analytics counters plus a few derived rates the PRD
 * tracks (cache-hit rate, dedup-hit rate). In production these would flow to a
 * real metrics pipeline; here it's a lightweight observability surface that the
 * dashboard and curious users can read. No auth — it's aggregate, non-PII data.
 */

import { Hono } from "hono";
import { analytics } from "../util/logger.js";

export const metricsRoute = new Hono();

metricsRoute.get("/", (c) => {
  const counts = analytics.snapshot();
  const hits = counts["cache_hit"] ?? 0;
  const misses = counts["cache_miss"] ?? 0;
  const generations = counts["generation_started"] ?? 0;
  const dedupHits = counts["dedup_hit"] ?? 0;

  const ratio = (a: number, b: number) => (a + b === 0 ? 0 : Number((a / (a + b)).toFixed(3)));

  return c.json({
    counts,
    derived: {
      edgeCacheHitRate: ratio(hits, misses),
      dedupHitRate: generations === 0 ? 0 : Number((dedupHits / generations).toFixed(3)),
    },
  });
});
