/**
 * parser.ts — Turn raw model output into a structured file manifest (PRD §6.1).
 *
 * Two responsibilities:
 *  1. A streaming detector that, as deltas arrive, notices when a <file> opens
 *     and closes so the API can emit `file` SSE events in real time.
 *  2. A final parse that extracts the <meta> directive and all <file> blocks
 *     into a VersionManifest the rest of the system stores and previews.
 *
 * The format is the strict one defined in system-prompt.ts. If the model
 * produces nothing parseable (a misbehaving provider), we fall back to a single
 * file so the user always gets *something* runnable rather than an empty error.
 */

import type { ProjectFile, SandpackTemplate, VersionManifest } from "@aiab/shared";

const META_RE = /<meta\s+template="([^"]+)"\s+entry="([^"]+)"\s*\/>/;
const FILE_RE = /<file\s+path="([^"]+)">\n?([\s\S]*?)\n?<\/file>/g;

/**
 * Incremental detector. Feed it the *full accumulated text* each time and it
 * returns any newly-started or newly-completed file paths since the last call.
 */
export class StreamingFileDetector {
  private openPath: string | null = null;
  private completed = new Set<string>();
  private started = new Set<string>();

  push(fullText: string): { started: string[]; completed: string[] } {
    const startedNow: string[] = [];
    const completedNow: string[] = [];

    // Detect newly completed files.
    const re = new RegExp(FILE_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(fullText))) {
      const path = m[1];
      if (!this.completed.has(path)) {
        this.completed.add(path);
        completedNow.push(path);
      }
    }

    // Detect a currently-open file (an opening tag with no matching close yet).
    const lastOpen = fullText.lastIndexOf("<file path=");
    const lastClose = fullText.lastIndexOf("</file>");
    if (lastOpen > lastClose) {
      const openMatch = fullText.slice(lastOpen).match(/<file\s+path="([^"]+)">/);
      const path = openMatch?.[1];
      if (path && !this.started.has(path)) {
        this.started.add(path);
        this.openPath = path;
        startedNow.push(path);
      }
    } else {
      this.openPath = null;
    }

    return { started: startedNow, completed: completedNow };
  }
}

const VALID_TEMPLATES: SandpackTemplate[] = ["react", "react-ts", "vanilla", "static"];

/** Final parse of the complete model output into a manifest. */
export function parseManifest(versionId: string, raw: string): VersionManifest {
  const files: ProjectFile[] = [];
  const re = new RegExp(FILE_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    files.push({ path: m[1].trim(), content: m[2] });
  }

  const metaMatch = raw.match(META_RE);
  let template: SandpackTemplate = "react";
  let entry = "App.js";
  if (metaMatch) {
    const t = metaMatch[1] as SandpackTemplate;
    if (VALID_TEMPLATES.includes(t)) template = t;
    entry = metaMatch[2].trim();
  }

  // Fallback: never hand back an empty project.
  if (files.length === 0) {
    template = "static";
    entry = "index.html";
    files.push({
      path: "index.html",
      content: `<!-- Fallback page: the model did not return parseable files. -->
<!doctype html>
<html><body style="font-family:sans-serif;padding:2rem">
<h1>Generation produced no files</h1>
<pre style="white-space:pre-wrap">${escapeHtml(raw).slice(0, 4000)}</pre>
</body></html>`,
    });
  }

  // If the declared entry isn't present, point at the first file we got.
  if (!files.some((f) => f.path === entry)) entry = files[0].path;

  return { versionId, files, template, entry };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Total source size in bytes (used to enforce per-plan byte caps). */
export function manifestBytes(files: ProjectFile[]): number {
  return files.reduce((sum, f) => sum + Buffer.byteLength(f.content, "utf8"), 0);
}
