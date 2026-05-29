/**
 * editor-pane.tsx — VS Code-grade editing via Monaco (PRD §6.4).
 *
 * A file tree/tabs on the left, the Monaco editor on the right. Edits update
 * the in-memory file set (which drives the live preview) and are persisted as a
 * new version when the user clicks Save. Dark-first theme to match the app.
 */
"use client";

import * as React from "react";
import Editor from "@monaco-editor/react";
import type { ProjectFile } from "@aiab/shared";
import { cn } from "@/lib/utils";

/** Infer a Monaco language id from a file extension. */
function languageFor(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return "plaintext";
}

export function EditorPane({
  files,
  activePath,
  onActivePathChange,
  onChange,
}: {
  files: ProjectFile[];
  activePath: string;
  onActivePathChange: (path: string) => void;
  onChange: (path: string, content: string) => void;
}) {
  const active = files.find((f) => f.path === activePath) ?? files[0];

  return (
    <div className="flex h-full">
      {/* File tree / tabs */}
      <aside className="w-48 shrink-0 overflow-auto border-r border-border bg-surface2/40 py-2">
        <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted">Files</div>
        <ul>
          {files.map((f) => (
            <li key={f.path}>
              <button
                onClick={() => onActivePathChange(f.path)}
                className={cn(
                  "w-full truncate px-3 py-1.5 text-left text-sm",
                  f.path === active?.path ? "bg-primary/15 text-foreground" : "text-muted hover:bg-surface2"
                )}
                title={f.path}
              >
                {f.path}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Editor */}
      <div className="min-w-0 flex-1">
        {active ? (
          <Editor
            height="100%"
            theme="vs-dark"
            path={active.path}
            language={languageFor(active.path)}
            value={active.content}
            onChange={(val) => onChange(active.path, val ?? "")}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: "on",
            }}
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted">No file selected</div>
        )}
      </div>
    </div>
  );
}
