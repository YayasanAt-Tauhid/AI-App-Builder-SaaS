/**
 * r2-node.ts — Node R2 backend: filesystem under .data/r2/<key>.
 *
 * The key layout matches the PRD exactly (§11.3), so the Cloudflare R2 backend
 * is a drop-in swap. Methods are async to match the R2 binding; the filesystem
 * calls are synchronous under the hood and resolve immediately.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { R2Backend } from "../runtime.js";

export function createNodeR2(dataDir: string): R2Backend {
  const root = join(dataDir, "r2");
  const pathFor = (key: string) => join(root, key);

  return {
    async putText(key, value) {
      const file = pathFor(key);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, value, "utf8");
    },
    async putBytes(key, value) {
      const file = pathFor(key);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, value);
    },
    async getText(key) {
      const file = pathFor(key);
      return existsSync(file) ? readFileSync(file, "utf8") : null;
    },
    async getBytes(key) {
      const file = pathFor(key);
      return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
    },
    async exists(key) {
      return existsSync(pathFor(key));
    },
    async delete(key) {
      const file = pathFor(key);
      if (existsSync(file)) rmSync(file);
    },
  };
}
