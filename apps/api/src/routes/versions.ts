/**
 * versions.ts — Version timeline, detail, diff, and restore (PRD §6.6, §12.3).
 *
 * Every generation/edit/restore is an immutable Version. This route exposes the
 * timeline, a single version's files, a file+line diff between any two versions,
 * and a non-destructive restore (restoring creates a *new* version pointing at
 * the old content, so history is never lost).
 */

import { Hono } from "hono";
import type { AuthContext } from "../auth/middleware.js";
import { getAuth } from "../auth/middleware.js";
import { projects, versions } from "../db/repo.js";
import { r2, r2keys } from "../adapters/r2.js";
import { loadManifest } from "../services/manifest.js";
import { diffManifests } from "../services/diff.js";
import { edgeCache, cacheKeys } from "../adapters/edge-cache.js";
import { analytics } from "../util/logger.js";
import { uuid } from "../util/id.js";

export const versionsRoute = new Hono<{ Variables: { auth: AuthContext } }>();

/** Guard: load a project and confirm the caller owns it. */
function ownedProject(c: any, id: string) {
  const auth = getAuth(c) as AuthContext;
  const project = projects.get(auth.clerkUserId, id);
  if (!project || project.userId !== auth.userId) return null;
  return { auth, project };
}

// GET /api/projects/:id/versions — timeline.
versionsRoute.get("/:id/versions", (c) => {
  const ctx = ownedProject(c, c.req.param("id"));
  if (!ctx) return c.json({ error: "not_found" }, 404);
  return c.json({ versions: versions.list(ctx.auth.clerkUserId, ctx.project.id) });
});

// GET /api/projects/:id/versions/:vid — version detail + files.
versionsRoute.get("/:id/versions/:vid", (c) => {
  const ctx = ownedProject(c, c.req.param("id"));
  if (!ctx) return c.json({ error: "not_found" }, 404);
  const version = versions.get(ctx.auth.clerkUserId, c.req.param("vid"));
  if (!version || version.projectId !== ctx.project.id) return c.json({ error: "not_found" }, 404);
  const manifest = loadManifest(ctx.project.id, version.id);
  // File blobs are immutable per version → cache for 1 hour (PRD §6.3, §10.2).
  c.header("Cache-Control", "private, max-age=3600");
  return c.json({ version, manifest });
});

// GET /api/projects/:id/diff?from=:a&to=:b — file + line level diff.
versionsRoute.get("/:id/diff", (c) => {
  const ctx = ownedProject(c, c.req.param("id"));
  if (!ctx) return c.json({ error: "not_found" }, 404);
  const fromId = c.req.query("from");
  const toId = c.req.query("to");
  if (!fromId || !toId) return c.json({ error: "from and to are required" }, 400);

  const from = loadManifest(ctx.project.id, fromId);
  const to = loadManifest(ctx.project.id, toId);
  if (!from || !to) return c.json({ error: "version_not_found" }, 404);

  return c.json({ from: fromId, to: toId, files: diffManifests(from, to) });
});

// POST /api/projects/:id/save — persist Monaco edits as a new version (PRD §6.4).
versionsRoute.post("/:id/save", async (c) => {
  const ctx = ownedProject(c, c.req.param("id"));
  if (!ctx) return c.json({ error: "not_found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as {
    files?: { path: string; content: string }[];
    template?: string;
    entry?: string;
  };
  if (!body.files || body.files.length === 0) return c.json({ error: "files required" }, 400);

  const newVersionId = uuid();
  const manifest = {
    versionId: newVersionId,
    files: body.files,
    template: (body.template as any) ?? "react",
    entry: body.entry ?? body.files[0].path,
  };
  for (const file of body.files) {
    r2.putText(r2keys.file(ctx.project.id, newVersionId, file.path), file.content);
  }
  r2.putText(r2keys.manifest(ctx.project.id, newVersionId), JSON.stringify(manifest));

  const created = versions.create(ctx.auth.clerkUserId, {
    id: newVersionId,
    projectId: ctx.project.id,
    parentVersionId: ctx.project.currentVersionId,
    prompt: "Manual edit",
    modelUsed: ctx.project.defaultModel,
    fileManifestKey: r2keys.manifest(ctx.project.id, newVersionId),
    contentHash: "edit",
    creditsCost: 0,
  });
  projects.update(ctx.auth.clerkUserId, ctx.project.id, { currentVersionId: newVersionId });
  edgeCache.invalidatePrefix(cacheKeys.projectListPrefix(ctx.auth.userId));
  analytics.track("code_edited", { userId: ctx.auth.userId, projectId: ctx.project.id });
  return c.json({ version: created }, 201);
});

// POST /api/projects/:id/versions/:vid/restore — non-destructive restore.
versionsRoute.post("/:id/versions/:vid/restore", (c) => {
  const ctx = ownedProject(c, c.req.param("id"));
  if (!ctx) return c.json({ error: "not_found" }, 404);
  const target = versions.get(ctx.auth.clerkUserId, c.req.param("vid"));
  if (!target || target.projectId !== ctx.project.id) return c.json({ error: "not_found" }, 404);
  const manifest = loadManifest(ctx.project.id, target.id);
  if (!manifest) return c.json({ error: "manifest_missing" }, 404);

  // Create a brand-new version whose content equals the restored one.
  const newVersionId = uuid();
  const newManifest = { ...manifest, versionId: newVersionId };
  for (const file of manifest.files) {
    r2.putText(r2keys.file(ctx.project.id, newVersionId, file.path), file.content);
  }
  r2.putText(r2keys.manifest(ctx.project.id, newVersionId), JSON.stringify(newManifest));

  const created = versions.create(ctx.auth.clerkUserId, {
    id: newVersionId,
    projectId: ctx.project.id,
    parentVersionId: ctx.project.currentVersionId,
    prompt: `Restore of version ${target.id.slice(0, 8)}`,
    modelUsed: target.modelUsed,
    fileManifestKey: r2keys.manifest(ctx.project.id, newVersionId),
    contentHash: target.contentHash,
    creditsCost: 0,
  });
  projects.update(ctx.auth.clerkUserId, ctx.project.id, { currentVersionId: newVersionId });

  // New version → invalidate file-blob/list caches (PRD §10.5).
  edgeCache.invalidatePrefix(cacheKeys.projectListPrefix(ctx.auth.userId));
  analytics.track("version_restored", { userId: ctx.auth.userId, projectId: ctx.project.id });
  return c.json({ version: created }, 201);
});
