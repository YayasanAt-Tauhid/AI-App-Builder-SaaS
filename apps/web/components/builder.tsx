/**
 * builder.tsx — The core builder workspace (PRD §5.1, §6.1–§6.8).
 *
 * Brings the whole iterate loop together: a prompt bar + model picker drive a
 * streaming generation; tokens/files stream into a live log; on completion the
 * resulting files load into the Monaco editor and Sandpack preview. The user
 * can edit (saved as a new version), re-prompt to iterate (current files are
 * sent as context), browse version history with diff/restore, and export a zip.
 *
 * Monaco and Sandpack are client-only and heavy, so they're dynamically
 * imported with SSR disabled.
 */
"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSWRConfig } from "swr";
import useSWR from "swr";
import type { PlanResponse, ProjectFile, SandpackTemplate } from "@aiab/shared";
import { api, streamGenerate, downloadExportBlob } from "@/lib/api";
import { getDefaultModel } from "@aiab/shared";
import { Button, Card, Spinner, Textarea } from "@/components/ui";
import { ModelPicker } from "@/components/model-picker";
import { VersionPanel } from "@/components/version-panel";
import { cn } from "@/lib/utils";

// Editors/preview touch `window`; load them only on the client.
const PreviewPane = dynamic(() => import("@/components/preview-pane").then((m) => m.PreviewPane), {
  ssr: false,
  loading: () => <PaneLoading label="Loading preview…" />,
});
const EditorPane = dynamic(() => import("@/components/editor-pane").then((m) => m.EditorPane), {
  ssr: false,
  loading: () => <PaneLoading label="Loading editor…" />,
});

function PaneLoading({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center gap-2 text-sm text-muted">
      <Spinner />
      {label}
    </div>
  );
}

export function Builder({
  initialProjectId,
  initialPrompt,
  initialModel,
}: {
  initialProjectId: string | null;
  initialPrompt?: string;
  initialModel?: string;
}) {
  const { mutate } = useSWRConfig();
  const { data: planData } = useSWR<PlanResponse>("/api/billing/plan");
  const plan = planData?.plan ?? "free";

  const [projectId, setProjectId] = React.useState<string | null>(initialProjectId);
  const [files, setFiles] = React.useState<ProjectFile[]>([]);
  const [template, setTemplate] = React.useState<SandpackTemplate>("react");
  const [entry, setEntry] = React.useState("App.js");
  const [activePath, setActivePath] = React.useState("App.js");
  const [currentVersionId, setCurrentVersionId] = React.useState<string | null>(null);

  const [prompt, setPrompt] = React.useState(initialPrompt ?? "");
  const [model, setModel] = React.useState(initialModel || getDefaultModel().id);

  const [generating, setGenerating] = React.useState(false);
  const [streamLog, setStreamLog] = React.useState<string[]>([]);
  const [tokenCount, setTokenCount] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"preview" | "code">("preview");
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const startedRef = React.useRef(false);

  // Load an existing project's current files on mount.
  React.useEffect(() => {
    if (!initialProjectId) return;
    api.getProject(initialProjectId).then((res) => {
      setModel(res.project.defaultModel);
      setCurrentVersionId(res.project.currentVersionId);
      if (res.currentManifest) loadManifest(res.currentManifest);
    }).catch(() => setError("Could not load project."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjectId]);

  function loadManifest(m: { files: ProjectFile[]; template: SandpackTemplate; entry: string; versionId?: string }) {
    setFiles(m.files);
    setTemplate(m.template);
    setEntry(m.entry);
    setActivePath(m.entry);
    setDirty(false);
  }

  const generate = React.useCallback(
    (skipDedup = false) => {
      const p = prompt.trim();
      if (!p || generating) return;
      setGenerating(true);
      setError(null);
      setStreamLog([]);
      setTokenCount(0);
      setTab("preview");

      // When iterating an existing project, send current files as context.
      const context = projectId && files.length ? { files } : undefined;

      abortRef.current = streamGenerate(
        { projectId: projectId ?? undefined, prompt: p, model, context },
        {
          onFile: (path, status) =>
            setStreamLog((log) => [...log, `${status === "start" ? "✎" : "✓"} ${path}`]),
          onToken: () => setTokenCount((c) => c + 1),
          onError: (_code, message) => {
            setError(message);
            setGenerating(false);
          },
          onDone: async (data) => {
            // Adopt the (possibly newly-created) project id without a remount.
            if (!projectId && data.projectId) {
              setProjectId(data.projectId);
              window.history.replaceState({}, "", `/projects/${data.projectId}`);
            }
            setCurrentVersionId(data.versionId);
            try {
              const res = await api.getVersion(data.projectId, data.versionId);
              if (res.manifest) loadManifest(res.manifest);
            } catch {
              /* ignore: preview will simply stay empty */
            }
            setGenerating(false);
            // Refresh credits + version timeline.
            mutate("/api/credits");
            mutate(`/api/projects/${data.projectId}/versions`);
          },
        },
        skipDedup
      );
    },
    [prompt, model, projectId, files, generating, mutate]
  );

  function stop() {
    abortRef.current?.abort();
    setGenerating(false);
  }

  function onEditFile(path: string, content: string) {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
    setDirty(true);
  }

  async function save() {
    if (!projectId || !dirty) return;
    setSaving(true);
    try {
      const res = await api.saveEdits(projectId, files, template, entry);
      setCurrentVersionId(res.version.id);
      setDirty(false);
      mutate(`/api/projects/${projectId}/versions`);
    } finally {
      setSaving(false);
    }
  }

  async function exportZip() {
    if (!projectId) return;
    setExporting(true);
    try {
      const { downloadUrl } = await api.exportProject(projectId, currentVersionId ?? undefined);
      const blob = await downloadExportBlob(downloadUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "app.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  // Auto-start a generation if we arrived with a prompt (from the dashboard).
  React.useEffect(() => {
    if (initialPrompt && !startedRef.current && !initialProjectId) {
      startedRef.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Prompt bar */}
      <div className="border-b border-border bg-surface/50 p-3">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Textarea
              rows={2}
              placeholder="Describe what to build or change… e.g. 'A todo app with dark mode and filters'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <ModelPicker value={model} onChange={setModel} plan={plan} />
            {generating ? (
              <Button variant="danger" onClick={stop}>
                Stop
              </Button>
            ) : (
              <Button onClick={() => generate()} disabled={!prompt.trim()}>
                {projectId ? "Iterate" : "Generate"}
              </Button>
            )}
          </div>
        </div>
        {error && <p className="mx-auto mt-2 max-w-7xl text-sm text-danger">⚠ {error}</p>}
      </div>

      {/* Workspace */}
      <div className="flex min-h-0 flex-1">
        {/* Main pane: preview / code */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
            <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
              Preview
            </TabButton>
            <TabButton active={tab === "code"} onClick={() => setTab("code")}>
              Code {dirty && <span className="text-accent">•</span>}
            </TabButton>
            <div className="ml-auto flex items-center gap-2">
              {tab === "code" && (
                <Button size="sm" variant="secondary" onClick={save} disabled={!dirty || saving}>
                  {saving ? <Spinner /> : "Save version"}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={exportZip} disabled={!projectId || exporting}>
                {exporting ? <Spinner /> : "Export .zip"}
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {generating ? (
              <StreamLog log={streamLog} tokenCount={tokenCount} />
            ) : tab === "preview" ? (
              <PreviewPane files={files} template={template} entry={entry} />
            ) : (
              <EditorPane files={files} activePath={activePath} onActivePathChange={setActivePath} onChange={onEditFile} />
            )}
          </div>
        </div>

        {/* Version history sidebar */}
        {projectId && (
          <aside className="hidden w-80 shrink-0 border-l border-border lg:block">
            <VersionPanel
              projectId={projectId}
              currentVersionId={currentVersionId}
              onRestored={async () => {
                const res = await api.getProject(projectId);
                setCurrentVersionId(res.project.currentVersionId);
                if (res.currentManifest) loadManifest(res.currentManifest);
              }}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm",
        active ? "bg-surface2 text-foreground" : "text-muted hover:bg-surface2"
      )}
    >
      {children}
    </button>
  );
}

function StreamLog({ log, tokenCount }: { log: string[]; tokenCount: number }) {
  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Generating… {tokenCount} tokens streamed
      </div>
      <Card className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs text-muted">
        {log.length === 0 ? (
          <span>Waiting for the model to start writing files…</span>
        ) : (
          log.map((line, i) => <div key={i}>{line}</div>)
        )}
      </Card>
    </div>
  );
}
