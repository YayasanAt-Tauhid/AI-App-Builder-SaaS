/**
 * d1.ts — Local stand-in for Cloudflare D1, with sharding (PRD Section 8.4).
 *
 * Cloudflare D1 is SQLite at the edge with a per-database size ceiling, so the
 * PRD shards by a hash of the user. We reproduce that here with N separate
 * better-sqlite3 files (shard-0.sqlite ... shard-{N-1}.sqlite). The public
 * `db(shardKey)` helper resolves the right shard from a stable per-user key
 * (the Clerk user id), guaranteeing all of a user's rows live in one shard so
 * their transactions stay consistent — exactly the property the PRD relies on.
 *
 * Because D1's wire format *is* SQLite, this code is intentionally close to
 * what a Cloudflare deployment would run; only the connection handle differs.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { env } from "../env.js";
import { SCHEMA_SQL } from "../db/schema.js";
import { log } from "../util/logger.js";

const shardDir = join(env.dataDir, "d1");
const shards = new Map<number, Database.Database>();

/** Deterministic FNV-1a hash → shard index. Mirrors hash(user_id) % shards. */
export function shardFor(shardKey: string): number {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < shardKey.length; i++) {
    hash ^= BigInt(shardKey.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return Number(hash % BigInt(env.shardCount));
}

function openShard(index: number): Database.Database {
  mkdirSync(shardDir, { recursive: true });
  const file = join(shardDir, `shard-${index}.sqlite`);
  const conn = new Database(file);
  conn.pragma("journal_mode = WAL"); // better concurrency for a single writer
  conn.pragma("foreign_keys = ON");
  conn.exec(SCHEMA_SQL); // idempotent CREATE TABLE IF NOT EXISTS
  log.info("d1.shard.open", { shard: index, file });
  return conn;
}

/** Get the connection for a given shard index (opens lazily). */
export function shard(index: number): Database.Database {
  let conn = shards.get(index);
  if (!conn) {
    conn = openShard(index);
    shards.set(index, conn);
  }
  return conn;
}

/** Resolve the shard for a user key, then return its connection. */
export function db(shardKey: string): Database.Database {
  return shard(shardFor(shardKey));
}

/** Run a callback against every shard (used for cross-shard maintenance). */
export function eachShard<T>(fn: (conn: Database.Database, index: number) => T): T[] {
  const out: T[] = [];
  for (let i = 0; i < env.shardCount; i++) out.push(fn(shard(i), i));
  return out;
}
