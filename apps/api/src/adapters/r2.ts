/**
 * r2.ts — Local stand-in for Cloudflare R2 object storage (PRD 7.2, 11.3).
 *
 * R2 stores project file manifests, file blobs, export zips, and thumbnails.
 * Locally we back it with the filesystem under .data/r2/<key>. The key layout
 * matches the PRD exactly (projects/{projectId}/versions/{versionId}/...), so
 * swapping in a real R2 binding later is a one-file change. We also model the
 * Cache-Control header the PRD wants on file blobs (1-hour TTL) by returning it
 * from `getMeta`, even though the filesystem itself ignores it.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { env } from "../env.js";

const root = join(env.dataDir, "r2");

function pathFor(key: string): string {
  return join(root, key);
}

export const r2 = {
  /** Store a UTF-8 string (manifests, source files). */
  putText(key: string, value: string, _cacheControl = "public, max-age=3600"): void {
    const file = pathFor(key);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, value, "utf8");
  },

  /** Store binary data (zips, thumbnails). */
  putBytes(key: string, value: Uint8Array): void {
    const file = pathFor(key);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, value);
  },

  getText(key: string): string | null {
    const file = pathFor(key);
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  },

  getBytes(key: string): Buffer | null {
    const file = pathFor(key);
    return existsSync(file) ? readFileSync(file) : null;
  },

  exists(key: string): boolean {
    return existsSync(pathFor(key));
  },

  delete(key: string): void {
    const file = pathFor(key);
    if (existsSync(file)) rmSync(file);
  },

  /** R2-style metadata, including the Cache-Control we'd set on blobs. */
  getMeta(key: string): { cacheControl: string } | null {
    return this.exists(key) ? { cacheControl: "public, max-age=3600" } : null;
  },
};

// ---- Key builders (single source of truth for R2 layout) ----------------

export const r2keys = {
  manifest: (projectId: string, versionId: string) =>
    `projects/${projectId}/versions/${versionId}/manifest.json`,
  file: (projectId: string, versionId: string, path: string) =>
    `projects/${projectId}/versions/${versionId}/files/${path}`,
  exportZip: (projectId: string, versionId: string) =>
    `projects/${projectId}/exports/${versionId}.zip`,
  thumbnail: (projectId: string, versionId: string) =>
    `projects/${projectId}/thumbnails/${versionId}.png`,
};
