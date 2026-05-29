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
apps/web   Next.js 16 (App Router, RSC) · React 19 · Tailwind v4 · Monaco · Sandpack · SWR
apps/api   Hono API (portable) + Node server
           ├─ adapters/d1.ts          sharded SQLite  → Cloudflare D1 (shard by user)
           ├─ adapters/r2.ts          filesystem      → Cloudflare R2 (file blobs/zips)
           ├─ adapters/kv.ts          in-memory TTL   → Cloudflare KV (dedup, rate limit)
           ├─ adapters/edge-cache.ts  in-memory SWR   → Workers Cache API
           ├─ adapters/credit-meter.ts serialized DO  → CreditMeter Durable Object
           ├─ services/queue.ts       async in-proc   → Cloudflare Queues
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

The handler logic is plain Hono, so each adapter maps to its Cloudflare binding:
D1 (sharded), R2, KV, a `CreditMeter` Durable Object class, and a Queue consumer.
Add a `wrangler.toml` with those bindings, set provider/Clerk/Stripe secrets,
and point the web app's `NEXT_PUBLIC_API_URL` at the deployed Worker.

See `apps/api/.env.example` for every supported key and what enabling it unlocks.
