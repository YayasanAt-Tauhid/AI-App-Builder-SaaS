/**
 * projects.ts — Project CRUD (PRD §6.7, §12.2).
 *
 * List, create, read, rename/update, duplicate, and soft-delete projects.
 * The list response is edge-cached per user (TTL 30s, stale-while-revalidate
 * 2 min) and invalidated on every mutation (PRD §10.5). Detail responses carry
 * a 30s Cache-Control. All handlers enforce per-user ownership (PRD §14).
 */

import { Hono } from "hono";
import type { AuthContext } from "../auth/middleware.js";
import { getAuth } from "../auth/middleware.js";
import { projects, versions } from "../db/repo.js";
import { r2, r2keys } from "../adapters/r2.js";
import { loadManifest } from "../services/manifest.js";
import { edgeCache, cacheKeys } from "../adapters/edge-cache.js";
import { analytics } from "../util/logger.js";
import { uuid } from "../util/id.js";
import { getModel } from "@aiab/shared";

export const projectsRoute = new Hono<{ Variables: { auth: AuthContext } }>();

// GET /api/projects — list (search, sort, paginate), edge-cached.
projectsRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const search = c.req.query("search") ?? "";
  const sort = (c.req.query("sort") as "updated" | "created" | "name") ?? "updated";
  const limit = Number(c.req.query("limit") ?? 50);
  const offset = Number(c.req.query("offset") ?? 0);

  // Cache only the default (unfiltered) first page; filtered queries are live.
  const cacheable = !search && offset === 0 && sort === "updated";
  const compute = async () => {
    const { rows, total } = await projects.list(auth.clerkUserId, auth.userId, { search, sort, limit, offset });
    return JSON.stringify({ projects: rows, total });
  };

  if (cacheable) {
    const { body, status } = await edgeCache.get(
      cacheKeys.projectList(auth.userId),
      { ttlSeconds: 30, swrSeconds: 120 },
      compute
    );
    c.header("X-Cache", status);
    c.header("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
    c.header("Content-Type", "application/json");
    return c.body(body);
  }

  c.header("Content-Type", "application/json");
  return c.body(await compute());
});

// POST /api/projects — create an empty project.
projectsRoute.post("/", async (c) => {
  const auth = getAuth(c);
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; defaultModel?: string };
  const defaultModel = body.defaultModel && getModel(body.defaultModel) ? body.defaultModel : "claude-sonnet";
  const project = await projects.create(auth.clerkUserId, {
    userId: auth.userId,
    name: body.name?.trim() || "Untitled Project",
    defaultModel,
  });
  edgeCache.invalidatePrefix(cacheKeys.projectListPrefix(auth.userId));
  analytics.track("project_created", { userId: auth.userId, projectId: project.id });
  return c.json(project, 201);
});

// GET /api/projects/:id — detail + current version manifest.
projectsRoute.get("/:id", async (c) => {
  const auth = getAuth(c);
  const project = await projects.get(auth.clerkUserId, c.req.param("id"));
  if (!project || project.userId !== auth.userId || project.status !== "active") {
    return c.json({ error: "not_found" }, 404);
  }
  const manifest = project.currentVersionId
    ? await loadManifest(project.id, project.currentVersionId)
    : null;
  c.header("Cache-Control", "private, max-age=30");
  return c.json({ project, currentManifest: manifest });
});

// PATCH /api/projects/:id — rename / update metadata.
projectsRoute.patch("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const project = await projects.get(auth.clerkUserId, id);
  if (!project || project.userId !== auth.userId) return c.json({ error: "not_found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    defaultModel?: string;
  };
  await projects.update(auth.clerkUserId, id, {
    name: body.name,
    description: body.description,
    defaultModel: body.defaultModel,
  });
  edgeCache.invalidatePrefix(cacheKeys.projectListPrefix(auth.userId));
  return c.json(await projects.get(auth.clerkUserId, id));
});

// POST /api/projects/:id/duplicate — clone the project + its current version.
projectsRoute.post("/:id/duplicate", async (c) => {
  const auth = getAuth(c);
  const source = await projects.get(auth.clerkUserId, c.req.param("id"));
  if (!source || source.userId !== auth.userId) return c.json({ error: "not_found" }, 404);

  const clone = await projects.create(auth.clerkUserId, {
    userId: auth.userId,
    name: `${source.name} (copy)`,
    description: source.description,
    defaultModel: source.defaultModel,
  });

  // Copy the current version's files into the clone as its first version.
  if (source.currentVersionId) {
    const manifest = await loadManifest(source.id, source.currentVersionId);
    const srcVersion = await versions.get(auth.clerkUserId, source.currentVersionId);
    if (manifest && srcVersion) {
      const newVersionId = uuid();
      const newManifest = { ...manifest, versionId: newVersionId };
      for (const file of manifest.files) {
        await r2.putText(r2keys.file(clone.id, newVersionId, file.path), file.content);
      }
      await r2.putText(r2keys.manifest(clone.id, newVersionId), JSON.stringify(newManifest));
      await versions.create(auth.clerkUserId, {
        id: newVersionId,
        projectId: clone.id,
        parentVersionId: null,
        prompt: srcVersion.prompt,
        modelUsed: srcVersion.modelUsed,
        fileManifestKey: r2keys.manifest(clone.id, newVersionId),
        contentHash: srcVersion.contentHash,
        creditsCost: 0,
      });
      await projects.update(auth.clerkUserId, clone.id, { currentVersionId: newVersionId });
    }
  }

  edgeCache.invalidatePrefix(cacheKeys.projectListPrefix(auth.userId));
  return c.json(await projects.get(auth.clerkUserId, clone.id), 201);
});

// DELETE /api/projects/:id — soft delete (recoverable 30 days, PRD §6.7).
projectsRoute.delete("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const project = await projects.get(auth.clerkUserId, id);
  if (!project || project.userId !== auth.userId) return c.json({ error: "not_found" }, 404);
  await projects.softDelete(auth.clerkUserId, id);
  edgeCache.invalidatePrefix(cacheKeys.projectListPrefix(auth.userId));
  return c.json({ deleted: true });
});
