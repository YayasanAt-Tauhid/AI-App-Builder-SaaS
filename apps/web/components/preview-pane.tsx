/**
 * preview-pane.tsx — Live in-browser preview via Sandpack (PRD §6.3).
 *
 * Renders the current file set in an isolated Sandpack sandbox that hot-reloads
 * as files change. We surface runtime/compile errors inline (Sandpack's error
 * overlay) and offer a console panel so problems aren't silently swallowed.
 * Sandpack runs untrusted generated code client-side in a sandboxed iframe
 * (PRD §16), so it can't touch the user's credentials.
 */
"use client";

import * as React from "react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
  SandpackConsole,
} from "@codesandbox/sandpack-react";
import type { ProjectFile, SandpackTemplate } from "@aiab/shared";

export function PreviewPane({
  files,
  template,
  entry,
}: {
  files: ProjectFile[];
  template: SandpackTemplate;
  entry: string;
}) {
  const [showConsole, setShowConsole] = React.useState(false);

  // Map our files into Sandpack's "/path" → { code } shape.
  const sandpackFiles = React.useMemo(() => {
    const out: Record<string, { code: string }> = {};
    for (const f of files) {
      const key = f.path.startsWith("/") ? f.path : `/${f.path}`;
      out[key] = { code: f.content };
    }
    return out;
  }, [files]);

  if (files.length === 0) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted">
        Generate or open a project to see a live preview here.
      </div>
    );
  }

  const activeFile = entry.startsWith("/") ? entry : `/${entry}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted">
        <span>Live preview</span>
        <button
          className="ml-auto rounded px-2 py-1 hover:bg-surface2"
          onClick={() => setShowConsole((s) => !s)}
        >
          {showConsole ? "Hide console" : "Show console"}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <SandpackProvider
          // `key` forces a clean remount when the template changes.
          key={template}
          template={template}
          theme="dark"
          files={sandpackFiles}
          options={{ activeFile, recompileMode: "delayed", recompileDelay: 400 }}
        >
          <SandpackLayout style={{ height: "100%", border: "none", borderRadius: 0 }}>
            <SandpackPreview
              showOpenInCodeSandbox={false}
              showRefreshButton
              style={{ height: showConsole ? "60%" : "100%" }}
            />
            {showConsole && <SandpackConsole style={{ height: "40%" }} />}
          </SandpackLayout>
        </SandpackProvider>
      </div>
    </div>
  );
}
