/**
 * version-panel.tsx — Version timeline, diff, and restore (PRD §6.6).
 *
 * Lists every version newest-first with its model, prompt, and credit cost.
 * "Diff" compares a version against the current one; "Restore" non-destructively
 * rolls back (creating a new version). Both use the API client; after a restore
 * we tell the parent to reload the project so the editor/preview refresh.
 */
"use client";

import * as React from "react";
import useSWR from "swr";
import type { DiffFile, Version } from "@aiab/shared";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { Badge, Button, Spinner } from "@/components/ui";
import { DiffView } from "@/components/diff-view";

export function VersionPanel({
  projectId,
  currentVersionId,
  onRestored,
}: {
  projectId: string;
  currentVersionId: string | null;
  onRestored: () => void;
}) {
  const { data, isLoading, mutate } = useSWR<{ versions: Version[] }>(
    `/api/projects/${projectId}/versions`
  );
  const [diff, setDiff] = React.useState<{ vid: string; files: DiffFile[] } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function showDiff(vid: string) {
    if (!currentVersionId) return;
    setBusy(vid);
    try {
      const res = await api.diff(projectId, vid, currentVersionId);
      setDiff({ vid, files: res.files });
    } finally {
      setBusy(null);
    }
  }

  async function restore(vid: string) {
    setBusy(vid);
    try {
      await api.restore(projectId, vid);
      await mutate();
      onRestored();
    } finally {
      setBusy(null);
    }
  }

  const versions = data?.versions ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
        Version history
      </div>

      {diff && (
        <div className="border-b border-border p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Diff vs current</span>
            <Button size="sm" variant="ghost" onClick={() => setDiff(null)}>
              Close
            </Button>
          </div>
          <div className="max-h-72 overflow-auto">
            <DiffView files={diff.files} />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading && (
          <div className="grid place-items-center p-6">
            <Spinner />
          </div>
        )}
        {!isLoading && versions.length === 0 && (
          <div className="p-4 text-sm text-muted">No versions yet. Generate something!</div>
        )}
        <ul className="divide-y divide-border">
          {versions.map((v, idx) => (
            <li key={v.id} className="p-3 text-sm">
              <div className="mb-1 flex items-center gap-2">
                <Badge tone={v.id === currentVersionId ? "primary" : "muted"}>
                  {v.id === currentVersionId ? "current" : `v${versions.length - idx}`}
                </Badge>
                <span className="text-xs text-muted">{v.modelUsed}</span>
                <span className="ml-auto text-xs text-muted">{timeAgo(v.createdAt)}</span>
              </div>
              <p className="mb-2 line-clamp-2 text-muted">{v.prompt}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">⚡ {v.creditsCost} credits</span>
                <div className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === v.id || v.id === currentVersionId}
                    onClick={() => showDiff(v.id)}
                  >
                    Diff
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === v.id || v.id === currentVersionId}
                    onClick={() => restore(v.id)}
                  >
                    {busy === v.id ? <Spinner /> : "Restore"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
