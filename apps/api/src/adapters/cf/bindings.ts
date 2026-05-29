/**
 * bindings.ts — The Cloudflare Worker environment (wrangler.toml bindings).
 *
 * One D1 binding per shard (DB_0 … DB_{N-1}, PRD §8.4), an R2 bucket, a KV
 * namespace, a Queue producer, and the CreditMeter Durable Object namespace,
 * plus the same string secrets the Node app reads from process.env. SHARD_COUNT
 * is a string var; everything else is a binding.
 */

import type {
  D1Database,
  R2Bucket,
  KVNamespace,
  Queue,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";

export interface Env {
  // D1 shards. Add DB_0..DB_{N-1} in wrangler.toml to match SHARD_COUNT.
  DB_0: D1Database;
  DB_1?: D1Database;
  DB_2?: D1Database;
  DB_3?: D1Database;
  [key: string]: unknown;

  BUCKET: R2Bucket;
  KV: KVNamespace;
  QUEUE: Queue;
  CREDIT_METER: DurableObjectNamespace;

  // Vars / secrets (mirror apps/api/.env.example).
  SHARD_COUNT?: string;
  WEB_ORIGIN?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  FORCE_MOCK?: string;
  CLERK_JWT_ISSUER?: string;
  CLERK_JWKS_URL?: string;
  CLERK_WEBHOOK_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
}

/** Resolve the D1 binding for a shard index, asserting it's configured. */
export function shardBinding(env: Env, index: number): D1Database {
  const db = env[`DB_${index}`] as D1Database | undefined;
  if (!db) throw new Error(`D1 shard binding DB_${index} is not configured in wrangler.toml`);
  return db;
}
