/**
 * export.ts — POST /api/projects/:id/export (PRD §6.8, §12.4).
 *
 * Returns a short-lived download URL for a .zip of a project version. Zips are
 * pre-built into R2 by the queue worker after each generation, so this usually
 * just returns a link to the cached artifact; if it's missing we build it
 * on-demand. The actual bytes are served by GET /api/projects/:id/export/:vid.
 */

import { Hono } from "hono";
import type { AuthContext } from "../auth/middleware.js";
import { getAuth } from "../auth/middleware.js";
import { projects } from "../db/repo.js";
import { r2, r2keys } from "../adapters/r2.js";
import { buildZip } from "../services/export.js";
import { analytics } from "../util/logger.js";

export const exportRoute = new Hono<{ Variables: { auth: AuthContext } }>();

// POST /api/projects/:id/export — returns { downloadUrl }.
exportRoute.post("/:id/export", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const project = await projects.get(auth.clerkUserId, id);
  if (!project || project.userId !== auth.userId) return c.json({ error: "not_found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { versionId?: string };
  const versionId = body.versionId ?? project.currentVersionId;
  if (!versionId) return c.json({ error: "no_version" }, 400);

  // Build on demand if the queue hasn't pre-built it yet.
  if (!(await r2.exists(r2keys.exportZip(id, versionId)))) {
    const zip = await buildZip(auth.clerkUserId, id, versionId);
    if (!zip) return c.json({ error: "version_not_found" }, 404);
    await r2.putBytes(r2keys.exportZip(id, versionId), zip);
  }

  analytics.track("project_exported", { userId: auth.userId, projectId: id, versionId });
  // Short-TTL signed-style URL. Locally this points at the download handler.
  return c.json({ downloadUrl: `/api/projects/${id}/export/${versionId}?token=${Date.now()}` });
});

// GET /api/projects/:id/export/:vid — stream the zip bytes.
exportRoute.get("/:id/export/:vid", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const vid = c.req.param("vid");
  const project = await projects.get(auth.clerkUserId, id);
  if (!project || project.userId !== auth.userId) return c.json({ error: "not_found" }, 404);

  let bytes = await r2.getBytes(r2keys.exportZip(id, vid));
  if (!bytes) {
    const zip = await buildZip(auth.clerkUserId, id, vid);
    if (!zip) return c.json({ error: "version_not_found" }, 404);
    await r2.putBytes(r2keys.exportZip(id, vid), zip);
    bytes = zip;
  }

  c.header("Content-Type", "application/zip");
  c.header("Content-Disposition", `attachment; filename="${project.name.replace(/[^a-z0-9]+/gi, "-")}.zip"`);
  return c.body(new Uint8Array(bytes));
});
