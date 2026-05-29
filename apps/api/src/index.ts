/**
 * index.ts — Hono application + Node server bootstrap.
 *
 * Wires the public routes (models, metrics, webhooks), then an authenticated
 * sub-app for everything else (generate, projects, versions, export, billing).
 * The handler logic is plain Hono, so the same `app` could be exported to a
 * Cloudflare Worker; here we serve it with @hono/node-server for local dev.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env.js";
import { log } from "./util/logger.js";
import type { AuthContext } from "./auth/middleware.js";
import { authMiddleware } from "./auth/middleware.js";
import { modelsRoute } from "./routes/models.js";
import { metricsRoute } from "./routes/metrics.js";
import { webhooksRoute } from "./routes/webhooks.js";
import { generateRoute } from "./routes/generate.js";
import { projectsRoute } from "./routes/projects.js";
import { versionsRoute } from "./routes/versions.js";
import { exportRoute } from "./routes/export.js";
import { billingRoute } from "./routes/billing.js";

const app = new Hono<{ Variables: { auth: AuthContext } }>();

// CORS so the Next.js client (a different origin in dev) can call the API,
// including the headers we use for dev-auth and dedup control.
app.use(
  "*",
  cors({
    origin: env.webOrigin,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Dev-User", "X-Skip-Dedup"],
    credentials: true,
  })
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    authMode: env.authMode,
    billingMode: env.billingMode,
    forceMock: env.forceMock,
    shards: env.shardCount,
  })
);

// --- Public routes (no JWT) ---
app.route("/api/models", modelsRoute);
app.route("/api/metrics", metricsRoute);
app.route("/api/webhooks", webhooksRoute);

// --- Authenticated routes ---
const api = new Hono<{ Variables: { auth: AuthContext } }>();
api.use("*", authMiddleware);
api.route("/generate", generateRoute);
api.route("/projects", projectsRoute);
api.route("/projects", versionsRoute); // timeline, diff, restore, save
api.route("/projects", exportRoute); // export endpoints
api.route("/", billingRoute); // /credits, /billing/*
app.route("/api", api);

app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));
app.onError((err, c) => {
  log.error("unhandled_error", { error: err.message, path: c.req.path });
  return c.json({ error: "internal_error", message: err.message }, 500);
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  log.info("api.listening", {
    port: info.port,
    authMode: env.authMode,
    billingMode: env.billingMode,
    forceMock: env.forceMock,
  });
});

export { app };
