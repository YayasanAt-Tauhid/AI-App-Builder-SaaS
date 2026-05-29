/**
 * project-card.tsx — A project tile on the dashboard (PRD §6.7).
 *
 * Shows a deterministic gradient thumbnail, the name, last-updated time, and a
 * small action menu (open, rename, duplicate, delete). Mutations call the API
 * and ask the parent to refresh the (edge-cached) project list.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import type { Project } from "@aiab/shared";
import { api } from "@/lib/api";
import { gradientFor, timeAgo } from "@/lib/utils";
import { Button, Card } from "@/components/ui";

export function ProjectCard({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);

  async function rename() {
    const name = window.prompt("Rename project", project.name);
    if (!name || name === project.name) return;
    setBusy(true);
    await api.renameProject(project.id, name);
    setBusy(false);
    onChanged();
  }

  async function duplicate() {
    setBusy(true);
    await api.duplicateProject(project.id);
    setBusy(false);
    onChanged();
  }

  async function remove() {
    if (!window.confirm(`Delete "${project.name}"? It's recoverable for 30 days.`)) return;
    setBusy(true);
    await api.deleteProject(project.id);
    setBusy(false);
    onChanged();
  }

  return (
    <Card className="group overflow-hidden transition hover:border-primary/50">
      <Link href={`/projects/${project.id}`} className="block">
        <div className="h-28 w-full" style={{ background: gradientFor(project.id) }} />
      </Link>
      <div className="p-3">
        <Link href={`/projects/${project.id}`} className="block">
          <h3 className="truncate font-medium">{project.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {project.defaultModel} · updated {timeAgo(project.updatedAt)}
          </p>
        </Link>
        <div className="mt-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <Button size="sm" variant="ghost" onClick={rename} disabled={busy}>
            Rename
          </Button>
          <Button size="sm" variant="ghost" onClick={duplicate} disabled={busy}>
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto text-danger" onClick={remove} disabled={busy}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}
