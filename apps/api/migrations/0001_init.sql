-- 0001_init.sql — Initial schema for one D1 shard (PRD §11.1).
--
-- Apply to every shard: `wrangler d1 migrations apply aiab-shard-N`.
-- This mirrors src/db/schema.ts (SCHEMA_SQL), which the local Node backend runs
-- at shard-open time. Keep the two in sync when the schema changes.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  clerk_user_id   TEXT UNIQUE NOT NULL,
  email           TEXT NOT NULL,
  plan            TEXT NOT NULL DEFAULT 'free',
  credits_balance INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  current_version_id  TEXT,
  default_model       TEXT NOT NULL,
  thumbnail_url       TEXT,
  status              TEXT NOT NULL DEFAULT 'active',
  deleted_at          TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS versions (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL,
  parent_version_id  TEXT,
  prompt             TEXT NOT NULL,
  model_used         TEXT NOT NULL,
  file_manifest_key  TEXT NOT NULL,
  content_hash       TEXT NOT NULL,
  credits_cost       INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_project ON versions(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  delta           INTEGER NOT NULL,
  reason          TEXT NOT NULL,
  ref_version_id  TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_txn_user ON credit_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  stripe_subscription_id  TEXT,
  plan                    TEXT NOT NULL DEFAULT 'free',
  status                  TEXT NOT NULL DEFAULT 'active',
  current_period_end      TEXT
);
