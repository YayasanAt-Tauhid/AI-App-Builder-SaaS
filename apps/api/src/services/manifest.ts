/**
 * manifest.ts — Helpers to read a version's file manifest from R2.
 *
 * A version's files live in R2 as a manifest.json plus individual blobs. The
 * manifest is the canonical index, so reading it back is enough to reconstruct
 * the full project for preview, diff, export, or iteration context.
 */

import type { VersionManifest } from "@aiab/shared";
import { r2, r2keys } from "../adapters/r2.js";

export function loadManifest(projectId: string, versionId: string): VersionManifest | null {
  const raw = r2.getText(r2keys.manifest(projectId, versionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VersionManifest;
  } catch {
    return null;
  }
}
