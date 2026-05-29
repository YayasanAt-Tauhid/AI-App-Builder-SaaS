/**
 * r2-cf.ts — Cloudflare R2 object-storage backend.
 *
 * Maps the runtime's R2Backend onto the R2 binding. The key layout (r2keys) is
 * identical to the local filesystem backend, so blobs land in the same place.
 * putText sets the Cache-Control the PRD wants on file blobs (§6.3, §10.2).
 */

import type { R2Bucket } from "@cloudflare/workers-types";
import type { R2Backend } from "../runtime.js";

export function createCfR2(bucket: R2Bucket): R2Backend {
  return {
    async putText(key, value, cacheControl = "public, max-age=3600") {
      await bucket.put(key, value, { httpMetadata: { cacheControl } });
    },
    async putBytes(key, value) {
      await bucket.put(key, value);
    },
    async getText(key) {
      const obj = await bucket.get(key);
      return obj ? await obj.text() : null;
    },
    async getBytes(key) {
      const obj = await bucket.get(key);
      return obj ? new Uint8Array(await obj.arrayBuffer()) : null;
    },
    async exists(key) {
      return (await bucket.head(key)) !== null;
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}
