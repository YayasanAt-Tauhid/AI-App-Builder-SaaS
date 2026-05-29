# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A locally-runnable implementation of `PRD.md` ("AI App Builder SaaS"): generate, preview, edit,
version, and export web apps from natural-language prompts. The PRD targets a Cloudflare edge stack
(Workers · D1 · R2 · KV · Durable Objects · Queues). This repo realizes that architecture as a
**portable Hono API** plus **local adapters** that stand in for each Cloudflare primitive, so it runs
end-to-end on any machine with no cloud setup.

Two design invariants that explain most decisions:
- **Edge-portable, not edge-specific.** Handler logic is plain Hono; everything Cloudflare-shaped lives
  behind an adapter (`apps/api/src/adapters/*`). Changing a backing store should be a per-adapter change,
  not a handler rewrite. Keep new I/O behind an adapter rather than calling Node/fs/sqlite from routes.
- **Mock + real-key ready.** External services (AI providers, Clerk, Stripe) have real integration code
  with automatic mock fallback. With **no env keys set**, the API runs fully: dev auth, a deterministic
  offline code generator, and a simulated billing upgrade. A feature must keep working key-free.

## Commands

```bash
pnpm install            # Node 22+, pnpm 10+ (better-sqlite3 native build is allowlisted in root package.json)
pnpm dev                # API on :8787 + web on :3000 (concurrently, hot reload)
pnpm seed               # create a dev user + sample projects (apps/api/src/seed.ts)
pnpm build              # tsc-build API, next build web
pnpm typecheck          # tsc --noEmit across all packages
pnpm test               # Vitest suite (API only: parser, diff, credit math)
pnpm lint               # next lint (web)
```

Run a single test (the test suite lives in `apps/api/test/`):
```bash
pnpm --filter @aiab/api test -- diff           # by file name substring
pnpm --filter @aiab/api test -- -t "plan gating"   # by test name
```

Target one workspace with `pnpm --filter @aiab/api …` or `--filter @aiab/web …`.

## Architecture

pnpm workspace monorepo. Three packages:

- **`packages/shared`** — types, the 8-model catalog (`models.ts`), and pure domain logic (credit math
  in `credits.ts`, FNV-1a hashing in `hash.ts`). Consumed directly as TypeScript source by both apps
  (`main`/`exports` point at `./src/index.ts`; web sets `transpilePackages: ["@aiab/shared"]`).
  **Internal relative imports here must be extensionless** — adding `.js` extensions breaks Turbopack's
  resolution of the package from the web build.
- **`apps/api`** — Hono API (`src/index.ts` bootstraps it on `@hono/node-server`).
- **`apps/web`** — Next.js 16 (App Router, RSC, React 19), Tailwind v4, Monaco editor, Sandpack preview, SWR.

### API request layering (`apps/api/src`)
`index.ts` mounts **public routes** (`/api/models`, `/api/metrics`, `/api/webhooks`) with no auth, then an
authenticated sub-app (`authMiddleware`) for `/api/generate`, `/api/projects` (CRUD + versions + export),
and billing (`/api/credits`, `/api/billing/*`). Layers:
- `routes/*` — thin HTTP handlers, one per resource.
- `services/*` — orchestration (`generation.ts` is the core flow; also `diff`, `export`, `manifest`,
  `provisioning`, `queue`, `stripe`).
- `adapters/*` — the Cloudflare stand-ins (see below).
- `ai/*` — provider abstraction + generation parsing.

### Adapters (the Cloudflare mapping)
| Adapter | Local impl | Stands in for | Notes |
|---|---|---|---|
| `d1.ts` | sharded `better-sqlite3` | D1 | Shards by `hash(clerkUserId) % D1_SHARD_COUNT` (default 4) so all of a user's rows live in one shard — preserves transactional integrity. |
| `r2.ts` | filesystem (`DATA_DIR`) | R2 | File blobs + manifests + zips; key layout matches PRD §11.3. |
| `kv.ts` | in-memory TTL map | KV | Prompt dedup + rate limiting. |
| `edge-cache.ts` | in-memory SWR | Workers Cache API | HIT/STALE/MISS, `invalidatePrefix`. |
| `credit-meter.ts` | per-user in-process object | `CreditMeter` Durable Object | Operations **serialized** with an async mutex and **idempotent on `generationId`** — the guarantees a real DO gives against double-debit/overspend. Concurrency slots: Free 1 / Pro 3. |
| `services/queue.ts` | async in-process | Queues | Thumbnail + pre-build-zip jobs. |

### Generation flow (`services/generation.ts`, mirrors PRD §7.3)
validate model + plan → check KV **dedup** cache (cache hit returns `done` with `fromCache:true`, **no
debit**) → **reserve** credits + a concurrency slot on the CreditMeter → emit `start` (with `generationId`)
→ stream provider tokens as SSE `token`/`file` events (`file` events fire as `<file>` blocks open/close) →
parse the manifest, enforce plan caps (refund on violation) → write blobs + manifest to R2 → insert the
Version row → **settle** actual credits → save the dedup KV entry (120s) → invalidate the project-list edge
cache → enqueue thumbnail/zip jobs → emit `done`. **Abort refunds** credits and releases the slot.

### AI provider layer (`ai/*`)
`provider.ts` is a factory returning an `AsyncGenerator` of text deltas (returning token usage). It selects
the real provider (`anthropic.ts` / `openai.ts` — also DeepSeek / `google.ts`) when that provider's key is
present, else `mock.ts`. `FORCE_MOCK=1` forces the mock even with keys. Generation output is a strict format
the model must follow — `<meta template="..." entry="..." />` then `<file path="...">…</file>` blocks —
parsed by `parser.ts` (streaming detector + final manifest parse, with single-file fallback if unparseable).
`system-prompt.ts` instructs the model; preview is Sandpack's **react** template, so generated files use a
**root-level layout** (e.g. `App.js`), and `parser.ts` defaults the entry to `App.js`. Changes to the output
format must stay consistent across `system-prompt.ts`, `parser.ts`, and `mock.ts`.

### Auth & billing modes
`env.ts` exposes `authMode` / `billingMode` getters and `providerKeyFor(...)`. Auth uses Clerk JWTs (jose
JWKS) when `CLERK_JWT_ISSUER`/`CLERK_JWKS_URL` are set; otherwise **dev-auth** identifies the user by the
`x-dev-user` request header. Billing uses real Stripe Checkout/Portal when `STRIPE_SECRET_KEY` is set,
otherwise the `/billing/mock-checkout` flow. `GET /health` reports the active modes.

## Conventions
- All env vars are optional and documented in `apps/api/.env.example` / `apps/web/.env.example`; defaults
  give a working key-free local app. Local D1 shards + R2 blobs live under `DATA_DIR` (`apps/api/.data`,
  git-ignored).
- The web client talks to the API via `lib/api.ts`; SSE generation is a POST whose `ReadableStream` is parsed
  on the client. After creating a project mid-stream the builder uses `history.replaceState` (not navigation)
  to avoid remounting.
- Commit/push only to branch `claude/app-dev-from-prd-9j04M` unless told otherwise. Do not open a PR unless
  explicitly asked.
