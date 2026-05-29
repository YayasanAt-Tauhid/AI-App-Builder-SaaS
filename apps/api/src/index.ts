/**
 * index.ts — Node server bootstrap.
 *
 * Installs the Node backend (sharded SQLite + filesystem R2 + in-memory KV),
 * then serves the shared Hono `app` with @hono/node-server. The Worker entry
 * (worker.ts) installs the Cloudflare backend and serves the same `app` instead.
 */

import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { setBackend } from "./adapters/runtime.js";
import { createNodeBackend } from "./adapters/node/backend.js";
import { log } from "./util/logger.js";
import { app } from "./app.js";

// Install the Node backend so the handlers' getBackend() calls resolve.
setBackend(createNodeBackend({ dataDir: env.dataDir, shardCount: env.shardCount }));

serve({ fetch: app.fetch, port: env.port }, (info) => {
  log.info("api.listening", {
    port: info.port,
    authMode: env.authMode,
    billingMode: env.billingMode,
    forceMock: env.forceMock,
  });
});

export { app };
