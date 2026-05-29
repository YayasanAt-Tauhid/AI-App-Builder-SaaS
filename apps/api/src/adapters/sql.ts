/**
 * sql.ts — The async SQL interface shared by both runtimes (PRD §8.4, §11).
 *
 * This is the shape of Cloudflare D1's prepared-statement API
 * (`prepare(sql).bind(...).first()/.all()/.run()`). Both backends implement it:
 * the Cloudflare backend hands back the D1 binding directly, and the Node
 * backend wraps better-sqlite3 in an async facade. Because the *interface* is
 * D1's, `db/repo.ts` is written once and runs unchanged on either runtime.
 */

export interface SqlStatement {
  /** Bind positional parameters, returning a bound statement (D1 semantics). */
  bind(...params: unknown[]): SqlStatement;
  /** First matching row, or null. */
  first<T = Record<string, unknown>>(): Promise<T | null>;
  /** All matching rows under `results` (matches D1's return shape). */
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  /** Execute a write. */
  run(): Promise<unknown>;
}

export interface Sql {
  prepare(query: string): SqlStatement;
}

/**
 * Deterministic FNV-1a hash → shard index. Mirrors `hash(user_id) % shards`
 * (PRD §8.4) so all of a user's rows resolve to the same shard on both runtimes.
 */
export function shardFor(shardKey: string, shardCount: number): number {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < shardKey.length; i++) {
    hash ^= BigInt(shardKey.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return Number(hash % BigInt(shardCount));
}
