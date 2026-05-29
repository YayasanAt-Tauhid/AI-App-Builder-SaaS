/**
 * repo.ts — Typed data access over the sharded D1 layer.
 *
 * Every function takes a `shardKey` (the Clerk user id) so it can resolve the
 * correct shard before reading/writing. This is the one place that knows about
 * SQL; routes and services speak in domain types only. Row→object mapping
 * converts snake_case columns to the camelCase shapes in @aiab/shared.
 */

import type {
  CreditReason,
  CreditTransaction,
  Plan,
  Project,
  User,
  Version,
} from "@aiab/shared";
import { db } from "../adapters/d1.js";
import { uuid } from "../util/id.js";

const now = () => new Date().toISOString();

// ---- Row mappers --------------------------------------------------------

type Row = Record<string, any>;

function toUser(r: Row): User {
  return {
    id: r.id,
    clerkUserId: r.clerk_user_id,
    email: r.email,
    plan: r.plan,
    creditsBalance: r.credits_balance,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toProject(r: Row): Project {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description,
    currentVersionId: r.current_version_id,
    defaultModel: r.default_model,
    thumbnailUrl: r.thumbnail_url,
    status: r.status,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toVersion(r: Row): Version {
  return {
    id: r.id,
    projectId: r.project_id,
    parentVersionId: r.parent_version_id,
    prompt: r.prompt,
    modelUsed: r.model_used,
    fileManifestKey: r.file_manifest_key,
    contentHash: r.content_hash,
    creditsCost: r.credits_cost,
    createdAt: r.created_at,
  };
}

function toTxn(r: Row): CreditTransaction {
  return {
    id: r.id,
    userId: r.user_id,
    delta: r.delta,
    reason: r.reason,
    refVersionId: r.ref_version_id,
    createdAt: r.created_at,
  };
}

// ---- Users --------------------------------------------------------------

export const users = {
  getByClerkId(clerkUserId: string): User | null {
    const row = db(clerkUserId)
      .prepare("SELECT * FROM users WHERE clerk_user_id = ?")
      .get(clerkUserId) as Row | undefined;
    return row ? toUser(row) : null;
  },

  create(input: { clerkUserId: string; email: string; plan?: Plan; credits?: number }): User {
    const ts = now();
    const user: User = {
      id: uuid(),
      clerkUserId: input.clerkUserId,
      email: input.email,
      plan: input.plan ?? "free",
      creditsBalance: input.credits ?? 0,
      createdAt: ts,
      updatedAt: ts,
    };
    db(input.clerkUserId)
      .prepare(
        `INSERT INTO users (id, clerk_user_id, email, plan, credits_balance, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(user.id, user.clerkUserId, user.email, user.plan, user.creditsBalance, ts, ts);
    return user;
  },

  setBalance(clerkUserId: string, balance: number): void {
    db(clerkUserId)
      .prepare("UPDATE users SET credits_balance = ?, updated_at = ? WHERE clerk_user_id = ?")
      .run(balance, now(), clerkUserId);
  },

  setPlan(clerkUserId: string, plan: Plan): void {
    db(clerkUserId)
      .prepare("UPDATE users SET plan = ?, updated_at = ? WHERE clerk_user_id = ?")
      .run(plan, now(), clerkUserId);
  },

  softDelete(clerkUserId: string): void {
    // Remove the user's row; projects are tidied by the soft-delete window job.
    db(clerkUserId).prepare("DELETE FROM users WHERE clerk_user_id = ?").run(clerkUserId);
  },
};

// ---- Projects -----------------------------------------------------------

export const projects = {
  create(
    shardKey: string,
    input: { userId: string; name: string; description?: string; defaultModel: string }
  ): Project {
    const ts = now();
    const p: Project = {
      id: uuid(),
      userId: input.userId,
      name: input.name,
      description: input.description ?? "",
      currentVersionId: null,
      defaultModel: input.defaultModel,
      thumbnailUrl: null,
      status: "active",
      deletedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };
    db(shardKey)
      .prepare(
        `INSERT INTO projects (id, user_id, name, description, current_version_id, default_model,
           thumbnail_url, status, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, NULL, 'active', NULL, ?, ?)`
      )
      .run(p.id, p.userId, p.name, p.description, p.defaultModel, ts, ts);
    return p;
  },

  list(
    shardKey: string,
    userId: string,
    opts: { search?: string; sort?: "updated" | "created" | "name"; limit?: number; offset?: number } = {}
  ): { rows: Project[]; total: number } {
    const conn = db(shardKey);
    const search = opts.search ? `%${opts.search.toLowerCase()}%` : null;
    const order =
      opts.sort === "name"
        ? "name ASC"
        : opts.sort === "created"
          ? "created_at DESC"
          : "updated_at DESC";
    const where = `user_id = ? AND status = 'active'` + (search ? " AND lower(name) LIKE ?" : "");
    const params: any[] = search ? [userId, search] : [userId];
    const total = (
      conn.prepare(`SELECT COUNT(*) AS c FROM projects WHERE ${where}`).get(...params) as Row
    ).c as number;
    const rows = conn
      .prepare(`SELECT * FROM projects WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, opts.limit ?? 50, opts.offset ?? 0) as Row[];
    return { rows: rows.map(toProject), total };
  },

  get(shardKey: string, id: string): Project | null {
    const row = db(shardKey).prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
    return row ? toProject(row) : null;
  },

  update(
    shardKey: string,
    id: string,
    patch: Partial<Pick<Project, "name" | "description" | "defaultModel" | "currentVersionId" | "thumbnailUrl">>
  ): void {
    const sets: string[] = [];
    const vals: any[] = [];
    if (patch.name !== undefined) (sets.push("name = ?"), vals.push(patch.name));
    if (patch.description !== undefined) (sets.push("description = ?"), vals.push(patch.description));
    if (patch.defaultModel !== undefined) (sets.push("default_model = ?"), vals.push(patch.defaultModel));
    if (patch.currentVersionId !== undefined)
      (sets.push("current_version_id = ?"), vals.push(patch.currentVersionId));
    if (patch.thumbnailUrl !== undefined) (sets.push("thumbnail_url = ?"), vals.push(patch.thumbnailUrl));
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    vals.push(now(), id);
    db(shardKey).prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  },

  softDelete(shardKey: string, id: string): void {
    db(shardKey)
      .prepare("UPDATE projects SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?")
      .run(now(), now(), id);
  },
};

// ---- Versions -----------------------------------------------------------

export const versions = {
  create(
    shardKey: string,
    input: {
      id?: string;
      projectId: string;
      parentVersionId: string | null;
      prompt: string;
      modelUsed: string;
      fileManifestKey: string;
      contentHash: string;
      creditsCost: number;
    }
  ): Version {
    const v: Version = {
      id: input.id ?? uuid(),
      projectId: input.projectId,
      parentVersionId: input.parentVersionId,
      prompt: input.prompt,
      modelUsed: input.modelUsed,
      fileManifestKey: input.fileManifestKey,
      contentHash: input.contentHash,
      creditsCost: input.creditsCost,
      createdAt: now(),
    };
    db(shardKey)
      .prepare(
        `INSERT INTO versions (id, project_id, parent_version_id, prompt, model_used,
           file_manifest_key, content_hash, credits_cost, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        v.id,
        v.projectId,
        v.parentVersionId,
        v.prompt,
        v.modelUsed,
        v.fileManifestKey,
        v.contentHash,
        v.creditsCost,
        v.createdAt
      );
    return v;
  },

  list(shardKey: string, projectId: string): Version[] {
    const rows = db(shardKey)
      .prepare("SELECT * FROM versions WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as Row[];
    return rows.map(toVersion);
  },

  get(shardKey: string, id: string): Version | null {
    const row = db(shardKey).prepare("SELECT * FROM versions WHERE id = ?").get(id) as Row | undefined;
    return row ? toVersion(row) : null;
  },
};

// ---- Credit transactions (the durable ledger) ---------------------------

export const transactions = {
  add(
    shardKey: string,
    input: { userId: string; delta: number; reason: CreditReason; refVersionId?: string | null }
  ): CreditTransaction {
    const txn: CreditTransaction = {
      id: uuid(),
      userId: input.userId,
      delta: input.delta,
      reason: input.reason,
      refVersionId: input.refVersionId ?? null,
      createdAt: now(),
    };
    db(shardKey)
      .prepare(
        `INSERT INTO credit_transactions (id, user_id, delta, reason, ref_version_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(txn.id, txn.userId, txn.delta, txn.reason, txn.refVersionId, txn.createdAt);
    return txn;
  },

  recent(shardKey: string, userId: string, limit = 20): CreditTransaction[] {
    const rows = db(shardKey)
      .prepare("SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(userId, limit) as Row[];
    return rows.map(toTxn);
  },
};

// ---- Subscriptions ------------------------------------------------------

export const subscriptions = {
  upsert(
    shardKey: string,
    input: {
      userId: string;
      stripeSubscriptionId?: string;
      plan: Plan;
      status: "active" | "canceled" | "past_due";
      currentPeriodEnd?: string;
    }
  ): void {
    const conn = db(shardKey);
    const existing = conn.prepare("SELECT id FROM subscriptions WHERE user_id = ?").get(input.userId) as
      | Row
      | undefined;
    if (existing) {
      conn
        .prepare(
          `UPDATE subscriptions SET stripe_subscription_id = ?, plan = ?, status = ?, current_period_end = ?
           WHERE user_id = ?`
        )
        .run(input.stripeSubscriptionId ?? null, input.plan, input.status, input.currentPeriodEnd ?? null, input.userId);
    } else {
      conn
        .prepare(
          `INSERT INTO subscriptions (id, user_id, stripe_subscription_id, plan, status, current_period_end)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(uuid(), input.userId, input.stripeSubscriptionId ?? null, input.plan, input.status, input.currentPeriodEnd ?? null);
    }
  },
};
