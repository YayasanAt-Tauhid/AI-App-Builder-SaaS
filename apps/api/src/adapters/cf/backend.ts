/**
 * backend.ts (cf) — Assembles the Cloudflare backend: D1 (sharded) + R2 + KV +
 * the CreditMeter Durable Object + a Queue producer.
 *
 * The CreditMeter handle forwards each call to the per-user DO (keyed by
 * idFromName(clerkUserId)); the DO holds the live balance and runs operations
 * single-threaded. Background jobs are sent to the Queue binding, whose consumer
 * lives in worker.ts.
 */

import type { Backend } from "../runtime.js";
import type { CreditMeterHandle, ReserveResult } from "../credit-meter.js";
import type { CreditReason, Plan } from "@aiab/shared";
import type { QueueJob } from "../../services/queue.js";
import { createCfSql } from "./sql-cf.js";
import { createCfR2 } from "./r2-cf.js";
import { createCfKv } from "./kv-cf.js";
import type { Env } from "./bindings.js";

/** The subset of the CreditMeter DO stub we call (RPC methods take clerkUserId). */
interface CreditMeterStub {
  reserve(clerkUserId: string, generationId: string, est: number): Promise<ReserveResult>;
  settle(
    clerkUserId: string,
    generationId: string,
    actual: number,
    refVersionId?: string | null
  ): Promise<{ debited: number; balance: number }>;
  refund(clerkUserId: string, generationId: string): Promise<{ refunded: number }>;
  grant(clerkUserId: string, amount: number, reason: CreditReason): Promise<{ balance: number }>;
  setPlan(clerkUserId: string, plan: Plan): Promise<void>;
}

export function createCfBackend(env: Env): Backend {
  const shardCount = Number(env.SHARD_COUNT ?? 4);
  const { sql } = createCfSql(env, shardCount);
  const r2 = createCfR2(env.BUCKET);
  const kv = createCfKv(env.KV);

  return {
    sql,
    r2,
    kv,
    async creditMeter(clerkUserId: string): Promise<CreditMeterHandle> {
      const id = env.CREDIT_METER.idFromName(clerkUserId);
      const stub = env.CREDIT_METER.get(id) as unknown as CreditMeterStub;
      // Adapt the DO stub (clerkUserId-first RPC) to the CreditMeterHandle shape.
      return {
        reserve: (generationId, est) => stub.reserve(clerkUserId, generationId, est),
        settle: (generationId, actual, refVersionId) =>
          stub.settle(clerkUserId, generationId, actual, refVersionId),
        refund: (generationId) => stub.refund(clerkUserId, generationId),
        grant: (amount, reason) => stub.grant(clerkUserId, amount, reason),
        setPlan: (plan) => stub.setPlan(clerkUserId, plan),
      };
    },
    async dispatchJob(job: QueueJob) {
      await env.QUEUE.send(job);
    },
  };
}
