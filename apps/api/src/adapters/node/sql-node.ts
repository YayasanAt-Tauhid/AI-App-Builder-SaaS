/**
 * sql-node.ts — Node SQL backend: sharded better-sqlite3 behind the D1 interface.
 *
 * Cloudflare D1 is SQLite at the edge with a per-database size ceiling, so the
 * PRD shards by a hash of the user (§8.4). We reproduce that with N separate
 * better-sqlite3 files (shard-0.sqlite … shard-{N-1}.sqlite), wrapped in an
 * async facade that matches D1's `prepare(sql).bind(...).first()/.all()/.run()`
 * API exactly — so `db/repo.ts` is unchanged across runtimes. better-sqlite3 is
 * synchronous; the facade simply resolves immediately.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA_SQL } from "../../db/schema.js";
import { shardFor, type Sql, type SqlStatement } from "../sql.js";
import { log } from "../../util/logger.js";

class NodeStatement implements SqlStatement {
  constructor(private readonly stmt: Database.Statement, private readonly params: unknown[] = []) {}
  bind(...params: unknown[]): SqlStatement {
    return new NodeStatement(this.stmt, params);
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.stmt.get(...(this.params as any[])) as T) ?? null;
  }
  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return { results: this.stmt.all(...(this.params as any[])) as T[] };
  }
  async run(): Promise<unknown> {
    return this.stmt.run(...(this.params as any[]));
  }
}

class NodeSql implements Sql {
  constructor(private readonly conn: Database.Database) {}
  prepare(query: string): SqlStatement {
    return new NodeStatement(this.conn.prepare(query));
  }
}

/** A sharded SQL provider over local SQLite files. */
export function createNodeSql(dataDir: string, shardCount: number) {
  const shardDir = join(dataDir, "d1");
  const shards = new Map<number, NodeSql>();

  function openShard(index: number): NodeSql {
    mkdirSync(shardDir, { recursive: true });
    const conn = new Database(join(shardDir, `shard-${index}.sqlite`));
    conn.pragma("journal_mode = WAL"); // better concurrency for a single writer
    conn.pragma("foreign_keys = ON");
    conn.exec(SCHEMA_SQL); // idempotent CREATE TABLE IF NOT EXISTS
    log.info("d1.shard.open", { shard: index });
    return new NodeSql(conn);
  }

  return {
    sql(shardKey: string): Sql {
      const index = shardFor(shardKey, shardCount);
      let conn = shards.get(index);
      if (!conn) {
        conn = openShard(index);
        shards.set(index, conn);
      }
      return conn;
    },
  };
}
