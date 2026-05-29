/**
 * sql-cf.ts — Cloudflare D1 SQL backend (sharded).
 *
 * D1's prepared-statement API *is* the `Sql` interface this codebase targets,
 * so there's almost nothing to adapt: pick the shard by hashing the user
 * (PRD §8.4) and hand back the binding. The schema is applied via D1 migrations
 * (see migrations/), not at runtime.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { shardFor, type Sql } from "../sql.js";
import { shardBinding, type Env } from "./bindings.js";

/** A sharded SQL provider over D1 bindings. */
export function createCfSql(env: Env, shardCount: number) {
  return {
    sql(shardKey: string): Sql {
      const index = shardFor(shardKey, shardCount);
      // D1Database already implements prepare(sql).bind(...).first()/.all()/.run().
      return shardBinding(env, index) as unknown as Sql;
    },
  };
}

export type { D1Database };
