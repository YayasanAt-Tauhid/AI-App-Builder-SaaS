/**
 * parser.test.ts — Parsing model output into a file manifest.
 * Verifies the strict <meta>/<file> format parses correctly, the streaming
 * detector reports file start/complete, and malformed output falls back safely.
 */
import { describe, it, expect } from "vitest";
import { parseManifest, StreamingFileDetector } from "../src/ai/parser.js";

const SAMPLE = `<meta template="react" entry="App.js" />
<file path="App.js">
export default function App(){ return null }
</file>
<file path="styles.css">
body{}
</file>`;

describe("parseManifest", () => {
  it("extracts meta + all files", () => {
    const m = parseManifest("v1", SAMPLE);
    expect(m.template).toBe("react");
    expect(m.entry).toBe("App.js");
    expect(m.files.map((f) => f.path).sort()).toEqual(["App.js", "styles.css"]);
  });

  it("falls back to a single page when nothing parses", () => {
    const m = parseManifest("v2", "the model rambled without files");
    expect(m.files).toHaveLength(1);
    expect(m.template).toBe("static");
  });

  it("repoints entry if the declared one is missing", () => {
    const m = parseManifest("v3", `<meta template="react" entry="missing.js" />\n<file path="A.js">x</file>`);
    expect(m.entry).toBe("A.js");
  });
});

describe("StreamingFileDetector", () => {
  it("detects a file opening then completing as text streams in", () => {
    const d = new StreamingFileDetector();
    const r1 = d.push(`<meta template="react" entry="App.js" />\n<file path="App.js">cons`);
    expect(r1.started).toContain("App.js");
    expect(r1.completed).toEqual([]);
    const r2 = d.push(`<meta template="react" entry="App.js" />\n<file path="App.js">const x=1</file>`);
    expect(r2.completed).toContain("App.js");
  });
});
