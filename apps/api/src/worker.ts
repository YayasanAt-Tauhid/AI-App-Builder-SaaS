/**
 * worker.ts — Cloudflare Worker entrypoint.
 *
 * Serves the same Hono `app` as the Node server, but installs the Cloudflare
 * backend (D1 sharded · R2 · KV · CreditMeter DO · Queue) and adds a Queue
 * consumer for the background jobs (thumbnail render, zip pre-build). The
 * CreditMeter Durable Object class is re-exported so wrangler can bind it.
 *
 * Deploy with `wrangler deploy` after configuring wrangler.toml bindings and
 * applying the D1 migrations (see migrations/). Provider/Clerk/Stripe keys are
 * Worker secrets/vars and surface via process.env (nodejs_compat).
 */

import type {
  ExecutionContext,
  MessageBatch,
} from "@cloudflare/workers-types";
import { app } from "./app.js";
import { setBackend } from "./adapters/runtime.js";
import { createCfBackend } from "./adapters/cf/backend.js";
import { processQueueJob, type QueueJob } from "./services/queue.js";
import type { Env } from "./adapters/cf/bindings.js";

export { CreditMeterDO } from "./adapters/cf/credit-meter-do.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setBackend(createCfBackend(env));
    // Hono's fetch uses its own ExecutionContext type; the Workers one is
    // structurally compatible for our use, so cast at the boundary.
    return app.fetch(request, env as unknown as Record<string, unknown>, ctx as never);
  },

  async queue(batch: MessageBatch<QueueJob>, env: Env): Promise<void> {
    setBackend(createCfBackend(env));
    for (const message of batch.messages) {
      try {
        await processQueueJob(message.body);
        message.ack();
      } catch {
        message.retry();
      }
    }
  },
};
