/**
 * models.ts — GET /api/models (PRD §6.2, §12.7).
 *
 * Serves the 8-model catalog, edge-cached for 5 minutes (PRD §10.2). The
 * response is computed once and cached; subsequent hits return instantly and
 * report their cache status via the X-Cache header for the cache-hit metric.
 */

import { Hono } from "hono";
import { MODEL_CATALOG } from "@aiab/shared";
import { edgeCache, cacheKeys } from "../adapters/edge-cache.js";

export const modelsRoute = new Hono();

modelsRoute.get("/", async (c) => {
  const { body, status } = await edgeCache.get(
    cacheKeys.models(),
    { ttlSeconds: 300 }, // 5 minutes
    () => JSON.stringify({ models: MODEL_CATALOG })
  );
  c.header("X-Cache", status);
  c.header("Cache-Control", "public, max-age=300");
  c.header("Content-Type", "application/json");
  return c.body(body);
});
