/**
 * export.ts — Build a downloadable .zip of a project version (PRD §6.8).
 *
 * Bundles the full file tree plus a README with run instructions. Pre-built
 * zips are cached in R2 by the queue worker; this function does the actual
 * bundling and is reused by both the queue and the export route.
 */

import JSZip from "jszip";
import { versions } from "../db/repo.js";
import { loadManifest } from "./manifest.js";

export async function buildZip(
  shardKey: string,
  projectId: string,
  versionId: string
): Promise<Uint8Array | null> {
  const version = versions.get(shardKey, versionId);
  if (!version || version.projectId !== projectId) return null;
  const manifest = loadManifest(projectId, versionId);
  if (!manifest) return null;

  const zip = new JSZip();
  for (const file of manifest.files) {
    zip.file(file.path, file.content);
  }

  // Ensure a README with run instructions exists even if the model omitted one.
  if (!manifest.files.some((f) => f.path.toLowerCase() === "readme.md")) {
    zip.file(
      "README.md",
      `# Exported from AI App Builder

This project was generated with model "${version.modelUsed}".

## Run locally

\`\`\`bash
npm install
npm start
\`\`\`
`
    );
  }

  return zip.generateAsync({ type: "uint8array" });
}
