/**
 * diff-view.tsx — Render a file + line level diff (PRD §6.6).
 *
 * Takes the DiffFile[] payload from GET /api/projects/:id/diff and renders each
 * changed file with green/red line highlighting. Unchanged files are collapsed
 * to keep the view focused on what actually changed between two versions.
 */
"use client";

import type { DiffFile } from "@aiab/shared";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<DiffFile["status"], string> = {
  added: "text-success",
  removed: "text-danger",
  modified: "text-accent",
  unchanged: "text-muted",
};

export function DiffView({ files }: { files: DiffFile[] }) {
  const changed = files.filter((f) => f.status !== "unchanged");
  if (changed.length === 0) {
    return <div className="p-4 text-sm text-muted">No differences between these versions.</div>;
  }

  return (
    <div className="space-y-4">
      {changed.map((file) => (
        <div key={file.path} className="overflow-hidden rounded-[var(--radius)] border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-surface2 px-3 py-2 text-sm">
            <span className={cn("font-mono", STATUS_TONE[file.status])}>{file.path}</span>
            <span className="ml-auto text-xs uppercase text-muted">{file.status}</span>
          </div>
          <pre className="overflow-auto bg-surface text-xs leading-5">
            {file.lines.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "px-3 font-mono whitespace-pre-wrap",
                  line.type === "add" && "bg-success/10 text-success",
                  line.type === "del" && "bg-danger/10 text-danger",
                  line.type === "ctx" && "text-muted"
                )}
              >
                <span className="select-none opacity-60">
                  {line.type === "add" ? "+ " : line.type === "del" ? "- " : "  "}
                </span>
                {line.text || " "}
              </div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}
