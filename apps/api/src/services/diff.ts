/**
 * diff.ts — File-level and line-level diff between two versions (PRD §6.6).
 *
 * Powers the diff viewer. We compare the two manifests path-by-path to classify
 * each file (added / removed / modified / unchanged), then compute a simple
 * line-level diff via the classic longest-common-subsequence algorithm so the
 * UI can highlight added/deleted lines. LCS keeps the diff readable without
 * pulling in a heavyweight dependency.
 */

import type { DiffFile, DiffLine, VersionManifest } from "@aiab/shared";

export function diffManifests(from: VersionManifest, to: VersionManifest): DiffFile[] {
  const fromMap = new Map(from.files.map((f) => [f.path, f.content]));
  const toMap = new Map(to.files.map((f) => [f.path, f.content]));
  const allPaths = new Set([...fromMap.keys(), ...toMap.keys()]);

  const result: DiffFile[] = [];
  for (const path of [...allPaths].sort()) {
    const a = fromMap.get(path);
    const b = toMap.get(path);
    if (a === undefined && b !== undefined) {
      result.push({ path, status: "added", lines: allLines(b, "add") });
    } else if (a !== undefined && b === undefined) {
      result.push({ path, status: "removed", lines: allLines(a, "del") });
    } else if (a !== undefined && b !== undefined) {
      if (a === b) {
        result.push({ path, status: "unchanged", lines: [] });
      } else {
        result.push({ path, status: "modified", lines: lineDiff(a, b) });
      }
    }
  }
  return result;
}

function allLines(text: string, type: "add" | "del"): DiffLine[] {
  return text.split("\n").map((text) => ({ type, text }));
}

/** Line-level diff using LCS to find common lines, marking the rest add/del. */
function lineDiff(a: string, b: string): DiffLine[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const n = aLines.length;
  const m = bLines.length;

  // LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Walk the table to emit a unified-style sequence of add/del/context lines.
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      out.push({ type: "ctx", text: aLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: aLines[i] });
      i++;
    } else {
      out.push({ type: "add", text: bLines[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: aLines[i++] });
  while (j < m) out.push({ type: "add", text: bLines[j++] });
  return out;
}
