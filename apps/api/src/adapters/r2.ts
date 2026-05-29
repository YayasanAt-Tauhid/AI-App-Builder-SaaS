/**
 * r2.ts — R2 object storage facade + key layout (PRD §7.2, §11.3).
 *
 * Delegates to the active backend's R2 implementation (filesystem locally, the
 * R2 binding on Cloudflare). `r2keys` is the single source of truth for the key
 * layout — matched verbatim by both backends — so handlers never hardcode paths.
 */

import { getBackend } from "./runtime.js";

export const r2 = {
  putText: (key: string, value: string, cacheControl?: string) =>
    getBackend().r2.putText(key, value, cacheControl),
  putBytes: (key: string, value: Uint8Array) => getBackend().r2.putBytes(key, value),
  getText: (key: string) => getBackend().r2.getText(key),
  getBytes: (key: string) => getBackend().r2.getBytes(key),
  exists: (key: string) => getBackend().r2.exists(key),
  delete: (key: string) => getBackend().r2.delete(key),
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
