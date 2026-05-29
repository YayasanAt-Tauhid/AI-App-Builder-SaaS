# AI App Builder SaaS

Generate, preview, edit, and export production-ready web apps from natural
language — with **live preview**, **multi-model AI**, **version history**, and a
**credits-based billing model**.

This repository is a **locally-runnable implementation of [`PRD.md`](./PRD.md)**.
The PRD targets a Cloudflare edge stack (Workers · D1 · R2 · KV · Durable
Objects · Queues); to make it run end-to-end on any machine with zero cloud
setup, the backend is written in **portable Hono** and ships with **local
adapters** that stand in for each Cloudflare primitive. Swapping in the real
bindings later is largely a per-adapter change.

External services (AI providers, Clerk auth, Stripe billing) use **real
integration code with automatic mock fallback** — so the app is fully demoable
**with no API keys**, and goes live the moment you add them.

---

## Quick start

```bash
pnpm install        # Node 22+, pnpm 10+
pnpm seed           # optional: create a dev user + a couple of sample projects
pnpm dev            # starts the API (:8787) and the web app (:3000)
```

Open **http://localhost:3000**, click **Start Building**, type a prompt
(e.g. _"A todo app with dark mode and local storage"_), pick a model, and watch
it stream, preview, and become editable. No keys required — it uses the built-in
deterministic generator until you add a provider key.

To use real models / auth / billing, copy the example envs and fill in keys:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

---

## What's implemented (PRD feature map)

| PRD § | Feature | Where |
|------|---------|-------|
| 6.1 | AI code generation (SSE, multi-file, dedup) | `apps/api/src/services/generation.ts`, `routes/generate.ts` |
| 6.2 | Multi-model switching (8 models, edge-cached catalog) | `packages/shared/src/models.ts`, `routes/models.ts`, `components/model-picker.tsx` |
| 6.3 | Live preview (Sandpack, console/errors) | `apps/web/components/preview-pane.tsx` |
| 6.4 | Code editor (Monaco, file tree, save→version) | `apps/web/components/editor-pane.tsx`, `routes/versions.ts` |
| 6.5 | Real-time streaming (SSE, keep-alive, abort+refund) | `routes/generate.ts`, `lib/api.ts` |
| 6.6 | Version history (timeline, diff, restore) | `routes/versions.ts`, `services/diff.ts`, `components/version-panel.tsx` |
| 6.7 | Project CRUD (search, duplicate, soft-delete) | `routes/projects.ts`, `components/project-card.tsx` |
| 6.8 | Export `.zip` (queue pre-build) | `services/export.ts`, `services/queue.ts`, `routes/export.ts` |
| 6.9 | Auth + webhooks (Clerk JWT / dev fallback) | `auth/middleware.ts`, `routes/webhooks.ts` |
| 6.10 / 13 | Credits & billing (CreditMeter DO, reserve/settle/refund) | `adapters/credit-meter.ts`, `routes/billing.ts` |
| 6.11 | Responsive dark-first UI (Tailwind v4, theme toggle) | `apps/web/app/globals.css`, `lib/theme.tsx` |
| 9 | AI model layer (provider abstraction + prompt caching) | `apps/api/src/ai/*` |
| 10 | Caching (edge cache, prompt dedup, SWR, blob TTL) | `adapters/edge-cache.ts`, `adapters/kv.ts`, `providers.tsx` |
| 11 | Data model (sharded D1) | `adapters/d1.ts`, `db/schema.ts`, `db/repo.ts` |
| 17 | Observability (structured logs, metrics endpoint) | `util/logger.ts`, `routes/metrics.ts` |

---

## Architecture

```
apps/web   Next.js 16 (App Router, RSC) · React 19 · Tailwind v4 (ShadCN/UI on Radix)
           · Monaco · Sandpack · SWR · Clerk (optional, dev-auth fallback)
apps/api   Hono API (portable) — runs on Node or Cloudflare via a pluggable Backend
           ├─ adapters/runtime.ts     Backend interface + holder (Node | Cloudflare)
           ├─ adapters/sql.ts         async D1-shaped SQL interface + shard hash
           ├─ adapters/node/*         better-sqlite3 (sharded) · filesystem R2 · in-mem KV
           ├─ adapters/cf/*           D1 (sharded) · R2 · KV · CreditMeter Durable Object
           ├─ adapters/edge-cache.ts  in-isolate SWR  → Workers Cache semantics
           ├─ services/queue.ts       job contract    → in-proc (Node) | Queue (CF)
           ├─ app.ts                  the Hono app (shared, side-effect free)
           ├─ index.ts / worker.ts    Node server | Cloudflare Worker entrypoints
           └─ ai/*                    Anthropic / OpenAI / DeepSeek / Gemini + mock
packages/shared   Types, the 8-model catalog, and pure credit/hash logic (used by both)
```

The **generation flow** mirrors PRD §7.3: validate model + plan → check the KV
**dedup** cache → **reserve** credits + a concurrency slot on the CreditMeter →
stream provider tokens out as SSE (emitting `file` events as `<file>` blocks
open/close) → parse files, enforce plan caps, write blobs + manifest to R2,
insert the Version row, **settle** actual credits, save the dedup entry, and
invalidate the project-list edge cache. Abort **refunds** and releases the slot.

### Notes on portability
- **D1 sharding** uses `hash(clerkUserId) % shardCount` so all of a user's rows
  live in one shard (transactional integrity), exactly as the PRD describes.
- **CreditMeter** is a per-user object whose operations are **serialized** with
  an async mutex and **idempotent on `generationId`** — the same guarantees a
  real Durable Object provides against double-debits and overspend.
- **Prompt caching** is wired for real providers (Anthropic `cache_control`,
  OpenAI/Gemini cached-token usage is surfaced to the metrics endpoint).

---

## Scripts

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Run API + web together (hot reload) |
| `pnpm build` | Type-build the API and production-build the web app |
| `pnpm typecheck` | Type-check every package |
| `pnpm test` | Run the Vitest suite (parser, diff, credit math) |
| `pnpm seed` | Create a dev user + sample projects |

---

## Going to production (Cloudflare)

The handler logic is plain Hono, and the storage layer is runtime-agnostic: the
same code runs on Node (via `src/adapters/node/*`) or on Cloudflare (via
`src/adapters/cf/*`), selected by a `Backend` installed at startup. The
Cloudflare target is wired and ready in `apps/api`:

- **`src/worker.ts`** — the Worker entry (`fetch` + Queue `consumer`), serving
  the same Hono `app` and re-exporting the `CreditMeterDO` Durable Object.
- **`wrangler.toml`** — bindings for D1 (one DB per shard), R2, KV, the Queue,
  and the CreditMeter Durable Object.
- **`migrations/0001_init.sql`** — the D1 schema (mirrors `src/db/schema.ts`).

Deploy from `apps/api`:

```bash
# 1. Create resources, paste the ids into wrangler.toml
wrangler d1 create aiab-shard-0   # …1, 2, 3
wrangler r2 bucket create aiab-blobs
wrangler kv namespace create KV
wrangler queues create aiab-jobs

# 2. Apply the schema to every shard
pnpm --filter @aiab/api cf:migrate

# 3. Set secrets (any subset; everything has a mock fallback)
wrangler secret put ANTHROPIC_API_KEY   # and CLERK_*, STRIPE_*

# 4. Deploy, then point the web app at the Worker URL
pnpm --filter @aiab/api cf:deploy        # NEXT_PUBLIC_API_URL=https://aiab-api.<acct>.workers.dev
```

> The data layer is async end-to-end (D1's API). The Node backend wraps
> better-sqlite3 in the same async D1-shaped interface, so local dev, tests, and
> the edge build exercise identical handler code. The CreditMeter runs in-process
> locally and inside the Durable Object on Cloudflare — same class, same
> serialization/idempotency guarantees.

See `apps/api/.env.example` for every supported key and what enabling it unlocks.
