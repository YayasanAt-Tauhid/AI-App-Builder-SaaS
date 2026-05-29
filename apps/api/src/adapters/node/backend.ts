/**
 * backend.ts (node) — Assembles the Node backend: sharded SQLite + filesystem R2
 * + in-memory KV + in-process CreditMeter registry + an in-process job queue.
 *
 * This is the backend the local dev server, seed script, and tests run against.
 * It deliberately owns the only imports of better-sqlite3/fs, so the Cloudflare
 * Worker bundle (which imports the cf backend instead) never pulls them in.
 */

import type { Backend } from "../runtime.js";
import type { CreditMeterHandle } from "../credit-meter.js";
import { CreditMeter, hydrateCreditMeter } from "../credit-meter.js";
import { processQueueJob, type QueueJob } from "../../services/queue.js";
import { log } from "../../util/logger.js";
import { createNodeSql } from "./sql-node.js";
import { createNodeR2 } from "./r2-node.js";
import { createNodeKv } from "./kv-node.js";

export function createNodeBackend(opts: { dataDir: string; shardCount: number }): Backend {
  const { sql } = createNodeSql(opts.dataDir, opts.shardCount);
  const r2 = createNodeR2(opts.dataDir);
  const kv = createNodeKv();

  // One CreditMeter per user, hydrated lazily from D1 (mirrors the DO registry).
  const meters = new Map<string, CreditMeter>();

  // In-process job queue, drained on the next tick so the request path is free.
  const jobs: QueueJob[] = [];
  let draining = false;
  async function drain() {
    try {
      while (jobs.length) {
        const job = jobs.shift()!;
        try {
          await processQueueJob(job);
        } catch (err) {
          log.error("queue.job_failed", { type: job.type, error: String(err) });
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    sql,
    r2,
    kv,
    async creditMeter(clerkUserId: string): Promise<CreditMeterHandle> {
      let m = meters.get(clerkUserId);
      if (!m) {
        m = await hydrateCreditMeter(clerkUserId);
        meters.set(clerkUserId, m);
      }
      return m;
    },
    dispatchJob(job: QueueJob) {
      jobs.push(job);
      if (!draining) {
        draining = true;
        setTimeout(drain, 0);
      }
    },
  };
}
