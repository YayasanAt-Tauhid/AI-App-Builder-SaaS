/**
 * diff.test.ts — Version diffing.
 * Confirms added/removed/modified/unchanged classification and that the
 * line-level diff marks the right lines as add/del.
 */
import { describe, it, expect } from "vitest";
import { diffManifests } from "../src/services/diff.js";
import type { VersionManifest } from "@aiab/shared";

function mf(files: { path: string; content: string }[]): VersionManifest {
  return { versionId: "x", files, template: "react", entry: files[0]?.path ?? "App.js" };
}

describe("diffManifests", () => {
  it("classifies file-level changes", () => {
    const from = mf([
      { path: "A.js", content: "1" },
      { path: "B.js", content: "keep" },
    ]);
    const to = mf([
      { path: "A.js", content: "2" },
      { path: "C.js", content: "new" },
    ]);
    const byPath = Object.fromEntries(diffManifests(from, to).map((f) => [f.path, f.status]));
    expect(byPath["A.js"]).toBe("modified");
    expect(byPath["B.js"]).toBe("removed");
    expect(byPath["C.js"]).toBe("added");
  });

  it("produces line-level add/del for a modified file", () => {
    const from = mf([{ path: "A.js", content: "a\nb\nc" }]);
    const to = mf([{ path: "A.js", content: "a\nB\nc" }]);
    const file = diffManifests(from, to).find((f) => f.path === "A.js")!;
    expect(file.lines.some((l) => l.type === "del" && l.text === "b")).toBe(true);
    expect(file.lines.some((l) => l.type === "add" && l.text === "B")).toBe(true);
  });
});
