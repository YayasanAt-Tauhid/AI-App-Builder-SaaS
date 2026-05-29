/**
 * runtime.ts — Pluggable backend so the same handlers run on Node or Cloudflare.
 *
 * Everything Cloudflare-shaped (D1, R2, KV, Queues, the CreditMeter DO) is
 * reached through a single `Backend` object held here. Cloudflare bindings are
 * constant for a deployment, so a module-level holder is correct and simpler
 * than per-request plumbing: the Node entrypoint sets the Node backend at
 * startup; the Worker entrypoint sets the Cloudflare backend on first fetch.
 *
 * Keeping this module dependency-light (no better-sqlite3, no fs) is deliberate:
 * the Worker bundle imports the Cloudflare backend only, so native Node modules
 * never reach the edge build.
 */

import type { Sql } from "./sql.js";
import type { CreditMeterHandle } from "./credit-meter.js";
import type { QueueJob } from "../services/queue.js";

/** Object storage (R2). All methods async to match the R2 binding. */
export interface R2Backend {
  putText(key: string, value: string, cacheControl?: string): Promise<void>;
  putBytes(key: string, value: Uint8Array): Promise<void>;
  getText(key: string): Promise<string | null>;
  getBytes(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

/** Key/value store (KV). All methods async to match the KV binding. */
export interface KvBackend {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Backend {
  /** Resolve the SQL handle for a user's shard. */
  sql(shardKey: string): Sql;
  r2: R2Backend;
  kv: KvBackend;
  /** Get (or hydrate) the CreditMeter handle for a user. */
  creditMeter(clerkUserId: string): Promise<CreditMeterHandle>;
  /** Dispatch a background job (in-process locally; a Queue binding on CF). */
  dispatchJob(job: QueueJob): Promise<void> | void;
}

let backend: Backend | null = null;

/** Install the active backend (called once by the Node or Worker entrypoint). */
export function setBackend(b: Backend): void {
  backend = b;
}

/** Get the active backend. Throws if no entrypoint installed one. */
export function getBackend(): Backend {
  if (!backend) {
    throw new Error(
      "No storage backend installed. Call setBackend(createNodeBackend()) " +
        "(Node) or setBackend(createCfBackend(env)) (Worker) before handling requests."
    );
  }
  return backend;
}
