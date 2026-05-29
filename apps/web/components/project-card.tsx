/**
 * project-card.tsx — A project tile on the dashboard (PRD §6.7).
 *
 * Shows a deterministic gradient thumbnail, the name, last-updated time, and a
 * Radix dropdown action menu (rename, duplicate, delete). Delete asks for
 * confirmation in a Radix Dialog. Mutations call the API and ask the parent to
 * refresh the (edge-cached) project list.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { Copy, MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Project } from "@aiab/shared";
import { api } from "@/lib/api";
import { gradientFor, timeAgo } from "@/lib/utils";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@/components/ui";

export function ProjectCard({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [name, setName] = React.useState(project.name);

  async function rename() {
    if (!name.trim() || name === project.name) return setRenameOpen(false);
    setBusy(true);
    await api.renameProject(project.id, name.trim());
    setBusy(false);
    setRenameOpen(false);
    onChanged();
  }

  async function duplicate() {
    setBusy(true);
    await api.duplicateProject(project.id);
    setBusy(false);
    onChanged();
  }

  async function remove() {
    setBusy(true);
    await api.deleteProject(project.id);
    setBusy(false);
    setDeleteOpen(false);
    onChanged();
  }

  return (
    <Card className="group relative overflow-hidden transition hover:border-primary/50">
      <Link href={`/projects/${project.id}`} className="block">
        <div className="h-28 w-full" style={{ background: gradientFor(project.id) }} />
      </Link>

      {/* Action menu (Radix DropdownMenu) */}
      <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="secondary" aria-label="Project actions" disabled={busy}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
              <Pencil className="h-4 w-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={duplicate}>
              <Copy className="h-4 w-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="p-3">
        <Link href={`/projects/${project.id}`} className="block">
          <h3 className="truncate font-medium">{project.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {project.defaultModel} · updated {timeAgo(project.updatedAt)}
          </p>
        </Link>
      </div>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>Give this project a clearer name.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`rename-${project.id}`}>Name</Label>
            <Input
              id={`rename-${project.id}`}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && rename()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={rename} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{project.name}”?</DialogTitle>
            <DialogDescription>
              This soft-deletes the project; it stays recoverable for 30 days before being purged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
