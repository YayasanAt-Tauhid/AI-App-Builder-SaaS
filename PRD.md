Baik, berikut PRD lengkap dengan Caching Strategy yang sudah diintegrasikan ke dalam struktur dokumen:

---

Product Requirements Document (PRD)

AI App Builder SaaS

Field Value
Product Name AI App Builder SaaS (working title)
Document Version 1.2
Status Draft
Last Updated 2026-05-29
Owner Product Team
Stakeholders Engineering, Design, Growth, Finance, Support

---

Table of Contents

1. Executive Summary
2. Problem Statement & Vision
3. Goals, Non-Goals & Success Metrics
4. Target Users & Personas
5. User Journeys
6. Feature Requirements
7. System Architecture
8. Technical Stack
9. AI Model Layer
10. Caching Strategy
11. Data Model
12. API Specification
13. Billing & Credits System
14. Authentication & Authorization
15. Non-Functional Requirements
16. Security & Compliance
17. Analytics & Observability
18. Release Plan & Milestones
19. Risks & Mitigations
20. Open Questions
21. Appendix

---

1. Executive Summary

AI App Builder SaaS is a web platform that lets anyone generate, preview, edit, and export production-ready web applications using natural language prompts. Users describe what they want to build, and the platform leverages best-in-class large language models (Claude, GPT-4o, Gemini, DeepSeek and more) to generate complete, runnable codebases.

The product differentiates itself through:

· Live in-browser preview via Sandpack — no local setup required.
· A full VS Code-grade editing experience via the Monaco Editor.
· Multi-model flexibility — switch between 8 AI models to balance cost, speed, and quality.
· Real-time streaming of AI responses for an instant, interactive feel.
· An edge-native backend (Cloudflare Workers + Hono + R2 + D1 + KV + Durable Objects) for global low latency, cost efficiency, and strong consistency where needed.
· Multi-layer caching strategy (provider, edge, browser, dedup) to reduce latency and AI costs.
· A credits-based billing model with a generous free tier and a Pro upgrade.
· First-class version history with a timeline, diff viewer, and one-click restore.

The codebase produced and the platform itself prioritize heavily commented, beginner-friendly code so that users learn while they build.

---

2. Problem Statement & Vision

2.1 Problem

Building software remains slow, expensive, and inaccessible to non-engineers. Existing "AI coding" tools are often:

· Locked to a single model with no cost/quality control.
· Lacking a real, runnable preview (users must copy-paste code locally).
· Missing proper version history, so users lose work or cannot iterate safely.
· Opaque about cost, leading to bill shock.
· Generating unreadable code that users can't learn from or maintain.

2.2 Vision

Empower anyone — from non-technical founders to senior engineers — to go from idea to a working, exportable web application in minutes, with full transparency, control, and the ability to learn from the generated code.

2.3 Strategic Bets

1. Model-agnostic beats single-model lock-in.
2. Edge-native infrastructure delivers global speed at low marginal cost.
3. Preview + edit + history turns one-shot generation into a real iterative workflow.
4. Credits align cost with value and protect margins.
5. Intelligent caching at multiple layers minimizes latency and AI spend.

---

3. Goals, Non-Goals & Success Metrics

3.1 Goals

· G1: Generate runnable, previewable web apps from a single prompt in < 30s to first token.
· G2: Support 8 AI models with seamless switching mid-session.
· G3: Provide a complete iterate loop: generate → preview → edit → regenerate → version → export.
· G4: Monetize via a credits system with Free and Pro plans.
· G5: Keep generated code heavily commented and beginner-friendly.
· G6: Achieve ≥ 60% prompt cache hit rate for returning users via multi-layer caching.

3.2 Non-Goals (v1)

· Native mobile app generation (iOS/Android).
· Multiplayer / real-time collaborative editing.
· Self-hosting / on-prem deployment.
· Marketplace for templates or plugins.
· One-click deploy to production hosting (planned for a later phase).

3.3 Success Metrics (North Star + Supporting)

Metric Target (90 days post-launch)
North Star: Weekly Active Builders 5,000
Time-to-first-preview (P50) < 20s
First-token latency (P50) < 2s
Prompt cache hit rate (provider) ≥ 60% (returning users)
Edge cache hit rate (API GET) ≥ 80%
Dedup hit rate ≥ 5%
Free → Pro conversion rate ≥ 4%
Project export rate ≥ 35%
7-day retention ≥ 30%
Gross margin on AI usage ≥ 60%
Generation success rate (compiles & previews) ≥ 90%

---

4. Target Users & Personas

Persona A — "Maya, the Non-Technical Founder"

· Wants to validate an idea with a working prototype.
· Cannot code; needs preview and export to hand to a developer.
· Values speed, clarity, and predictable cost.

Persona B — "Devon, the Full-Stack Developer"

· Uses the tool to scaffold boilerplate and accelerate delivery.
· Wants control over the model, the ability to edit code directly, and clean exports.
· Cares about code quality and version history.

Persona C — "Sara, the Student / Learner"

· Learning to build web apps.
· Values heavily commented, beginner-friendly code and the free tier.

Persona D — "Raj, the Agency / Freelancer"

· Builds many client prototypes.
· Needs project management (dashboard, CRUD), export, and Pro-tier credits.

---

5. User Journeys

5.1 First-Run (New User)

1. User lands on marketing page → clicks "Start Building".
2. Signs up via Clerk (email, Google, GitHub).
3. Webhook provisions the user + grants free credits.
4. Lands on an empty Dashboard with a prominent prompt box.
5. Types a prompt: "A todo app with dark mode and local storage."
6. Selects a model (default: a fast, cost-efficient model).
7. AI streams the generated project; Sandpack preview renders live.
8. User edits in Monaco, re-prompts, and the diff is captured as a version.
9. User clicks Export → downloads a .zip of the project.

5.2 Returning User — Iterate

1. Opens Dashboard → selects an existing project.
2. Reviews version timeline → opens diff viewer between v3 and v5.
3. Restores v3, branches a new prompt, generates v6 (hits prompt cache → faster + cheaper).
4. Runs low on credits → prompted to upgrade to Pro.

5.3 Upgrade

1. User hits credit limit or wants more.
2. Clicks Upgrade → Clerk/Stripe checkout.
3. Webhook updates plan → credits refilled → Pro features unlocked.

---

6. Feature Requirements

Each feature lists priority (P0 = launch-blocking, P1 = launch-desirable, P2 = post-launch) and acceptance criteria.

6.1 AI Code Generation (P0)

· Description: Convert a natural-language prompt into a complete, runnable web project.
· Requirements:
  · Accept a freeform prompt plus optional context (existing project files).
  · Stream output token-by-token via SSE.
  · Produce a structured multi-file project (file tree + file contents).
  · Generated code is heavily commented and beginner-friendly.
  · Check prompt deduplication cache before initiating new generation.
· Acceptance Criteria:
  · Given a valid prompt, the system returns a project that compiles and renders in Sandpack ≥ 90% of the time.
  · First token arrives in < 2s (P50).
  · Output is parsed into discrete files with correct paths.
  · Duplicate prompts within 2 minutes return cached result without debiting credits.

6.2 Multi-Model Switching (P0)

· Description: Choose among 8 AI models; switch at any time.
· Requirements:
  · Model picker UI with per-model metadata: provider, speed, cost (credits/1K tokens), strengths.
  · Switching persists per project/session.
  · Graceful fallback if a provider is down.
  · Model catalog served from edge cache (TTL: 5 menit).
· Acceptance Criteria:
  · All 8 models selectable and functional.
  · Switching mid-session does not lose context.

6.3 Live Preview — Sandpack (P0)

· Description: In-browser live preview of generated code.
· Requirements:
  · Render the active project in an isolated Sandpack sandbox.
  · Hot-reload on file changes.
  · Console/error panel surfaced to the user.
  · File blobs cached with 1-hour TTL via R2 + Cache-Control headers.
· Acceptance Criteria:
  · Preview updates within 1s of an edit.
  · Runtime errors are displayed inline, not silently swallowed.

6.4 Code Editor — Monaco (P0)

· Description: VS Code-grade in-browser editing.
· Requirements:
  · Syntax highlighting, IntelliSense, multi-file tabs, file tree.
  · Dark-first theming consistent with app.
  · Edits sync to the preview and to version history.
· Acceptance Criteria:
  · Users can edit any file and see results in preview.
  · Editor state survives navigation within the app.

6.5 Real-Time Streaming (P0)

· Description: Stream AI responses via Server-Sent Events.
· Requirements:
  · SSE endpoint on Cloudflare Workers.
  · Incremental rendering of file contents as they arrive.
  · Cancelable generations (abort) that refund unused credits where applicable.
  · Keep-alive ping every 15–25s to maintain connection.
· Acceptance Criteria:
  · Tokens render progressively; no full-response blocking.
  · Abort stops billing for unsent tokens.

6.6 Version History (P0)

· Description: Timeline, diff viewer, and restore.
· Requirements:
  · Every generation/edit checkpoint creates a version snapshot.
  · Timeline view of versions with timestamps, model used, prompt.
  · Diff viewer (file-level + line-level) between any two versions.
  · Restore to any prior version (creates a new version, non-destructive).
· Acceptance Criteria:
  · Diff highlights additions/deletions correctly.
  · Restore is non-destructive and reversible.

6.7 Project Management — Dashboard CRUD (P0)

· Description: Full lifecycle management of projects.
· Requirements:
  · Create, read, update, rename, duplicate, delete projects.
  · Search, sort, and filter projects.
  · Per-project metadata: name, created/updated, model, credits used, thumbnail.
  · Project list responses cached at edge (TTL: 30 detik, stale-while-revalidate: 2 menit).
· Acceptance Criteria:
  · All CRUD operations succeed and persist.
  · Deletion is soft (recoverable for 30 days) then hard-deleted.
  · Cache invalidates on project update/rename/delete.

6.8 Export / Download (P0)

· Description: Download generated project as a zip.
· Requirements:
  · Bundle full file tree into a .zip.
  · Include README.md, package.json, and run instructions.
  · Pre-built zips cached via R2; async build via Queues.
· Acceptance Criteria:
  · Exported project runs locally with documented steps.

6.9 Authentication — Clerk + Webhooks (P0)

· Description: User auth and lifecycle sync.
· Requirements:
  · Email, Google, GitHub sign-in.
  · Webhooks for user.created, user.updated, user.deleted, subscription events.
  · Provision credits on signup; sync plan on subscription change.
· Acceptance Criteria:
  · New users receive free credits automatically.
  · Plan/credit state stays consistent with Clerk/Stripe.

6.10 Billing & Credits (P0)

· Description: Credits-based metering with Free and Pro plans.
· See Section 13.

6.11 Responsive Dark-First UI (P0)

· Description: Fully responsive, dark-first design.
· Requirements:
  · Mobile, tablet, desktop breakpoints.
  · Dark theme default; light theme toggle.
  · ShadCN/UI + Radix primitives; Tailwind v4.
· Acceptance Criteria:
  · Core flows usable on a 375px-wide viewport.
  · WCAG AA contrast in both themes.

6.12 Prompt Templates / Starters (P1)

· Curated starter prompts and project templates to reduce blank-canvas friction.

6.13 Shareable Preview Links (P1)

· Read-only public preview links for a project version.

6.14 One-Click Deploy (P2)

· Deploy generated app to Cloudflare Pages / Vercel.

---

7. System Architecture

7.1 High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                          │
│  Next.js 16 (App Router) + React 19                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐  │
│  │ ShadCN/Radix │ │ Monaco Editor│ │ Sandpack Live Preview     │  │
│  │ + Tailwind v4│ │ (VS Code UX) │ │ (in-browser sandbox)      │  │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Browser Cache (SWR, stale-while-revalidate)                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│         │  Clerk Auth (JWT)        │  SSE stream consumer          │
└─────────┼───────────────────────────┼─────────────────────────────┘
          │ HTTPS / SSE                │
┌─────────▼───────────────────────────▼─────────────────────────────┐
│             EDGE BACKEND — Cloudflare Workers (Paid)               │
│                          Hono framework                            │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │ Auth/JWT   │ │ Generation   │ │ Versioning   │ │ Export /    │ │
│  │ middleware │ │ + SSE proxy  │ │ service      │ │ Billing API │ │
│  └────────────┘ └──────┬───────┘ └──────┬───────┘ └──────┬──────┘ │
│                        │                │                │         │
│  ┌─────────────────────┼────────────────┼────────────────┼───────┐ │
│  │  Edge Cache Layer (Workers Cache API)                        │ │
│  │  • GET /api/models (TTL: 5 min)                              │ │
│  │  • GET /api/projects (TTL: 30s, SWR: 2 min)                 │ │
│  │  • GET project details (TTL: 30s)                             │ │
│  └─────────────────────┼────────────────┼────────────────┼───────┘ │
│                        │                │                │         │
│   ┌────────────────────▼────────────────▼────────────────▼─────┐  │
│   │  Durable Object: CreditMeter (one instance per user)        │  │
│   │  • strongly-consistent reserve / debit / refund             │  │
│   │  • concurrency slots (Free 1 / Pro 3)  • per-user throttle   │  │
│   └─────────────────────────────────────────────────────────────┘  │
└───────┬───────────────┬───────────────┬───────────────┬────────────┘
        │               │               │               │
        ▼               ▼               ▼               ▼
 ┌────────────┐  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
 │ AI Provider│  │ Cloudflare R2│ │   D1 (Sharded)│ │   Queues    │
 │ Gateway    │  │ (project     │ │ (source of   │ │(thumbnails,  │
 │(Claude,GPT,│  │  files, zips,│ │  truth: users│ │ zip prebuild)│
 │ Gemini,    │  │  thumbnails) │ │  projects,   │ │              │
 │ DeepSeek)  │  │              │ │  versions,   │ └──────────────┘
 │            │  │ Cache-Control│ │  txn ledger) │
 │ Prompt     │  │ headers set  │ │ Shard key:   │   ┌──────────┐
 │ Caching    │  │ for file     │ │ user_id      │   │  Clerk   │
 └────────────┘  │ blobs        │ │ (hash-based) │   │ (auth +  │
                 └──────────────┘ └──────────────┘   │ webhooks)│
   ┌──────────────┐                                  └──────────┘
   │ Cloudflare KV│
   │ (model-catalog│
   │  + config    │
   │  + dedup     │
   │  cache)      │
   └──────────────┘
```

7.2 Component Responsibilities

Component Responsibility
Next.js client UI, editor, preview, SSE consumption, auth session, browser cache via SWR.
Cloudflare Workers (Hono) API routing, JWT verification, AI provider proxy/stream, versioning, storage orchestration, edge cache management.
CreditMeter Durable Object (per user) Strongly-consistent credit reserve/debit/refund; concurrency slot enforcement; per-user rate limiting. The live counter + lock.
AI Provider Gateway Normalize requests across providers; stream token deltas; token accounting; leverage provider prompt caching.
D1 (Sharded) Source of truth for users, projects, versions, and the credit-transaction ledger. Sharded by a hash of user_id to scale beyond the 10 GB per-database limit.
Cloudflare R2 Durable storage of project file blobs, export zips, thumbnails. No egress charge. Cache-Control headers for file blobs.
Cloudflare KV Model-catalog registry + config cache, soft rate-limit hints, prompt dedup cache. Not the credit source of truth.
Cloudflare Queues Async post-processing (thumbnail render, zip pre-build) off the request path.
Clerk Identity, sessions, lifecycle + billing webhooks.
Workers Cache API Edge caching for idempotent GET responses (model catalog, project lists).

7.3 Generation Sequence (SSE + DO + D1 + Cache)

```
Client          Worker (Hono)        KV/Cache    CreditMeter DO     AI Provider     R2 / D1(Shard) / Queue
  │ POST /generate │                   │              │                  │                  │
  │───────────────▶│ verify JWT (Clerk)│              │                  │                  │
  │                │ hash(prompt+model │              │                  │                  │
  │                │  +context) ──────▶│ cek dedup    │                  │                  │
  │                │◀── miss ──────────│              │                  │                  │
  │                │ resolveD1Shard    │              │                  │                  │
  │                │ reserve(estCredits)─────────────▶│ serialized check │                  │
  │                │   + claim slot    │              │ (strong consist.)│                  │
  │                │◀── ok | 402/409 ────────────────│                  │                  │
  │                │ open provider stream (cached    │                  │                  │
  │                │  system prompt + context) ──────────────────────▶│                  │
  │  SSE token Δ    │◀──── token deltas ───────────────────────────────│                  │
  │◀───────────────│ pipe via TransformStream       │                  │                  │
  │ ...keep-alive...│ (comment ping every ~15–25s)   │                  │                  │
  │                │ on complete:    │              │                  │                  │
  │                │  parse files    │              │                  │                  │
  │                │  write blobs ───┼──────────────┼──────────────────┼─────────────────▶│ R2
  │                │  insert version+manifest ──────┼──────────────────┼─────────────────▶│ D1 (Shard)
  │                │  settle(actualCredits)─────────▶ debit + release  │                  │
  │                │  simpan dedup hash ───────────▶│ KV (TTL: 2 min)  │                  │
  │                │  enqueue thumbnail/zip ────────┼──────────────────┼─────────────────▶│ Queue
  │                │  invalidate project list cache │                  │                  │
  │ SSE done(verId) │                              │                  │                  │
  │◀───────────────│                               │                  │                  │
  │ (on abort) ─────▶ refund(unused) ──────────────▶│ credit back + release slot          │
```

Key properties: prompt dedup check via KV prevents redundant generations; credit operations serialized in DO; critical version row + manifest written inline so versionId returns immediately; non-critical artifacts produced asynchronously via Queues; project list edge cache invalidated on mutation.

---

8. Technical Stack

8.1 Frontend

Concern Choice
Framework Next.js 16 (App Router, React Server Components)
UI runtime React 19
Component library ShadCN/UI on Radix UI primitives
Styling Tailwind CSS v4
Theme Dark-first, fully responsive, light toggle
Editor Monaco Editor
Preview Sandpack
Auth client Clerk React SDK
State/data React Query / Server Actions; SSE via EventSource/fetch streams
Client cache SWR with stale-while-revalidate

8.2 Backend

Concern Choice
Runtime Cloudflare Workers — Paid plan (Standard usage model)
Framework Hono
Object storage Cloudflare R2 (project blobs, zips, thumbnails) with Cache-Control headers
Relational store Cloudflare D1 (Sharded) — shard key is a hash of user_id to scale beyond the 10 GB per-database limit
Strong-consistency primitives Durable Objects — CreditMeter per user (credits, concurrency, rate limiting)
Edge cache Cloudflare Workers Cache API
Async jobs Cloudflare Queues (thumbnail render, zip pre-build)
KV / cache Cloudflare KV — model-catalog + config cache, soft rate-limit hints, prompt dedup
Streaming Server-Sent Events (SSE) over HTTPS
Auth verification Clerk JWT verification middleware
Billing Stripe (via Clerk Billing or direct) — provider choice still open (Open Q #3)

8.3 Tooling & Quality

· TypeScript across the stack (strict).
· ESLint + Prettier; conventional commits.
· Vitest / Playwright for unit and E2E.
· Code generation outputs are heavily commented by design (system prompt enforced).

8.4 D1 Sharding Strategy

To overcome D1's 10 GB/database limit, we will shard D1 databases by a hash of the user_id. A middleware layer will route database queries to the correct shard based on the authenticated user.

· Shard key: hash(user_id) % number_of_shards
· Initial shard count: 4 (40 GB total capacity), easily scalable by adding new shards.
· Resolution: All Worker requests for a user will connect to the same D1 shard, ensuring transactional integrity for that user's data.
· Reference: This approach is inspired by the manual sharding strategy detailed by Tristan Trommer.

8.5 Wrangler Limits (reference)

```jsonc
{
  "limits": {
    // Streaming is I/O-bound; active CPU stays low. Default 30s is ample
    // and protects against runaway/buggy generations.
    "cpu_ms": 30000,
    // Paid default is already 10,000. Raise only if a single generation
    // fans out to many subrequests (it normally won't).
    "subrequests": 10000
  }
}
```

---

9. AI Model Layer

9.1 Supported Models (8)

# Model Provider Tier Default Strength Relative Cost
1 Claude Opus Anthropic Pro  Best reasoning & code quality High
2 Claude Sonnet Anthropic Free+Pro ✓ Balanced quality/speed Medium
3 Claude Haiku Anthropic Free  Fast, cheap Low
4 GPT-4o OpenAI Pro  Strong general + multimodal High
5 GPT-4o mini OpenAI Free  Fast, cheap Low
6 Gemini 1.5 Pro Google Pro  Long context Medium-High
7 Gemini 1.5 Flash Google Free  Fast, long context Low
8 DeepSeek-V3 / Coder DeepSeek Free+Pro  Code-specialized, cost-efficient Low

Exact model versions are configurable via a server-side registry so the catalog can be updated without client changes. When building Claude-backed flows, default to the latest, most capable Claude models available.

9.2 Provider Abstraction

· A unified ModelProvider interface normalizes:
  · Request shape (system prompt, messages, params).
  · Streaming token deltas → common SSE event schema.
  · Token accounting (input/output) → credits.
· Fallback policy: on provider 5xx/timeout, optionally retry on a same-tier alternate (user-configurable, off by default to avoid surprise model swaps).

9.3 System Prompt Principles

· Always instruct the model to:
  · Produce a complete, runnable project with an explicit file manifest.
  · Write heavily commented, beginner-friendly code.
  · Follow a strict output format for reliable parsing (file path + fenced contents).
· Prompt caching is a first-class cost lever. The shared system prompt and carried project context are re-sent on every iteration; caching them (where the provider supports it) cuts both cost and first-token latency materially on the iterate loop. Treat cache-hit rate as a tracked metric (see §10 & §17).

---

10. Caching Strategy

10.1 Overview

Untuk mengurangi latensi, beban backend, dan biaya AI, diterapkan strategi caching bertingkat di beberapa layer.

10.2 Layer Cache

Layer Teknologi Data TTL Tujuan
Provider Cache Anthropic/OpenAI Prompt Caching System prompt + project context yang dikirim ulang Sesuai provider (biasanya 5–10 menit) Potong biaya & latensi token pertama
Edge Cache Cloudflare Workers Cache API GET responses idempotent (model catalog, project list) 30 detik – 5 menit Kurangi request ke Worker & D1
Browser Cache SWR / stale-while-revalidate headers Model catalog, project metadata 2 menit stale + revalidate UI instant untuk data yang jarang berubah
File Blob Cache R2 + Cache-Control headers Generated project files (per version) 1 jam Preview load cepat untuk file yang tidak berubah
Prompt Dedup KV (temporary) Hash(prompt + model + context) → generationId terakhir 2 menit Cegah generation identik berulang

10.3 Prompt Deduplication Flow

```
Client POST /generate
  → Worker hitung content_hash(prompt + model + context)
  → Cek KV: dedup:{userId}:{content_hash}
    → Ada & masih valid (< 2 menit)? Return versi existing (tanpa debit kredit baru)
    → Tidak ada? Lanjutkan generation normal, simpan hash ke KV
```

Acceptance Criteria:

· Prompt identik dalam < 2 menit tidak memicu generation baru (hemat kredit user)
· Cache busting: user bisa override dengan header X-Skip-Dedup: true
· Tidak berlaku untuk prompt dengan context.files berbeda

10.4 Workers Cache API Implementation (Contoh)

```typescript
// GET /api/models — cached di edge
const cacheKey = new Request(url, { method: 'GET' });
const cache = caches.default;

let response = await cache.match(cacheKey);
if (!response) {
  response = await handleGetModels(c.env);
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
}
return response;
```

10.5 Cache Invalidation Triggers

Event Cache yang Dihapus
Project updated/rename Edge cache project list user tersebut
Model catalog diperbarui (admin) Edge cache /api/models
User upgrade ke Pro Project limits cache, model access cache
Version baru dibuat File blob cache untuk project terkait
Project dihapus (soft delete) Edge cache project list

10.6 Monitoring Cache

Metrik tambahan untuk observability:

Metrik Target
Prompt cache hit rate (provider) ≥ 60% untuk iterasi (returning user)
Dedup hit rate ≥ 5%
Edge cache hit rate (API GET) ≥ 80%
Cache-related latency reduction P50 turun 40% untuk cached responses

---

11. Data Model

11.1 Entities (relational source of truth in sharded D1)

```
User
  id (uuid, pk)
  clerk_user_id (string, unique)
  email
  plan (enum: free | pro)
  credits_balance (int)            # mirrored to DO for fast reads
  created_at, updated_at

Project
  id (uuid, pk)
  user_id (fk -> User)
  name
  description
  current_version_id (fk -> Version, nullable)
  default_model (string)
  thumbnail_url (R2 key, nullable)
  status (enum: active | deleted)
  deleted_at (nullable)            # soft delete (30-day window)
  created_at, updated_at

Version
  id (uuid, pk)
  project_id (fk -> Project)
  parent_version_id (fk -> Version, nullable)
  prompt (text)
  model_used (string)
  file_manifest_key (R2 key)       # JSON manifest of files
  content_hash (string)            # hash(prompt + model + files) for dedup
  credits_cost (int)
  created_at

File (logical; stored as blobs in R2, indexed in manifest)
  path
  r2_key
  size
  content_hash

CreditTransaction
  id (uuid, pk)
  user_id (fk -> User)
  delta (int)                      # negative = debit, positive = credit/refill
  reason (enum: signup_grant | generation | refund | purchase | plan_refill | adjustment)
  ref_version_id (nullable)
  created_at

Subscription
  id (uuid, pk)
  user_id (fk -> User)
  stripe_subscription_id
  plan (enum: free | pro)
  status (enum: active | canceled | past_due)
  current_period_end
```

11.2 KV Layout (fast lookups for non-transactional data)

Key Value
model-catalog current model registry (TTL cached)
ratelimit:{userId}:{window} soft request counters for rate limiting
dedup:{userId}:{content_hash} generationId + timestamp for prompt dedup (TTL: 2 min)

11.3 R2 Layout

```
projects/{projectId}/versions/{versionId}/manifest.json
projects/{projectId}/versions/{versionId}/files/{path}
projects/{projectId}/exports/{versionId}.zip
projects/{projectId}/thumbnails/{versionId}.png
```

---

12. API Specification

All endpoints are served by Cloudflare Workers (Hono) and require a valid Clerk JWT unless noted. Base path: /api.

12.1 Generation

```
POST /api/generate
Headers: [optional] X-Skip-Dedup: true
Body: {
  projectId?: string,        # omit to create a new project
  prompt: string,
  model: string,             # model id from catalog
  context?: { files: [...] } # optional existing files for iteration
}
Response: text/event-stream (SSE)
  event: token   data: { delta: "..." }
  event: file    data: { path, status }
  event: error   data: { code, message }
  event: done    data: { projectId, versionId, creditsCost, fromCache: false }
```

```
POST /api/generate/abort
Body: { generationId: string }
Response: { aborted: true, refundedCredits: number }
```

12.2 Projects (CRUD)

```
GET    /api/projects                 # list (search, sort, filter, paginate) — cached edge
POST   /api/projects                 # create empty project — invalidates list cache
GET    /api/projects/:id             # detail + current version manifest — cached 30s
PATCH  /api/projects/:id             # rename / update metadata — invalidates list cache
POST   /api/projects/:id/duplicate   # clone
DELETE /api/projects/:id             # soft delete — invalidates list cache
```

12.3 Versions

```
GET  /api/projects/:id/versions              # timeline
GET  /api/projects/:id/versions/:vid         # version detail + files
GET  /api/projects/:id/diff?from=:a&to=:b    # diff payload (file + line level)
POST /api/projects/:id/versions/:vid/restore # restore -> new version — invalidates file blob cache
```

12.4 Export

```
POST /api/projects/:id/export        # build zip from current/selected version
  Body: { versionId?: string }
  Response: { downloadUrl }          # signed R2 URL, short TTL
```

12.5 Billing & Credits

```
GET  /api/credits                    # balance + recent transactions
GET  /api/billing/plan               # current plan + limits
POST /api/billing/checkout           # create Stripe checkout session
POST /api/billing/portal             # customer portal session
```

12.6 Webhooks (no JWT; signature-verified)

```
POST /api/webhooks/clerk             # user.created/updated/deleted
POST /api/webhooks/stripe            # subscription + payment events
```

12.7 Models

```
GET /api/models                      # catalog with metadata, cost, tier — cached edge (TTL: 5 min)
```

---

13. Billing & Credits System

13.1 Model Overview

· Credits are the universal unit of consumption.
· Each generation debits credits based on (tokens_in + tokens_out) × model_rate, rounded up.
· The CreditMeter Durable Object is the live, strongly-consistent counter for reservations and debits.
· The CreditTransaction table in D1 is the durable ledger of record for all transactions.

13.2 Plans

Plan Price Monthly Credits Models Concurrency Extras
Free $0 e.g. 200 credits/mo Low/medium-cost models (Haiku, GPT-4o mini, Gemini Flash, DeepSeek, Claude Sonnet) 1 generation Watermarked share links
Pro e.g. $20/mo e.g. 5,000 credits/mo All 8 models incl. Opus, GPT-4o, Gemini Pro 3 concurrent Priority queue, no watermark, larger projects, export presets

Pricing and credit allotments are placeholders pending finance modeling (see Open Questions).

13.3 Credit Lifecycle

1. Signup grant → free credits written to D1 ledger + DO state via Clerk webhook.
2. Generation
   · reserve(estCredits, generationId) on the DO → atomically checks balance and claims a concurrency slot. Returns 402 if insufficient credits, 409 if concurrency cap reached.
   · On completion: settle(generationId, actualCredits) → debits actual usage, releases the slot, appends a row to the CreditTransaction ledger in the user's D1 shard.
   · On abort: refund(generationId, unusedCredits) → credits back the unsent portion, releases the slot.
3. Plan refill → monthly refill on the billing cycle (Stripe webhook) updates the user's D1 shard ledger + DO state.
4. Top-ups (P1) → one-time credit purchases.

All three operations (reserve, settle, refund) are idempotent on generationId to prevent double-application from retries or duplicate webhooks.

13.4 Guardrails

· Hard stop when balance hits 0 (clear upgrade CTA).
· Soft warning at 10% remaining.
· Per-generation max token cap to prevent runaway cost.
· Concurrency and rate limiting enforced by the CreditMeter Durable Object.

---

14. Authentication & Authorization

· Clerk handles sign-up/in (email, Google, GitHub), sessions, and JWT issuance.
· Workers verify the Clerk JWT on every protected request.
· Webhooks (signature-verified) keep the local User/Subscription records in sync in the appropriate D1 shard:
  · user.created → create User in D1 + grant free credits in DO.
  · user.updated → sync profile.
  · user.deleted → soft-delete user data (then purge per retention policy).
  · Subscription events (via Stripe/Clerk Billing) → update plan in D1 + refill credits in DO.
· Authorization: users may only access their own projects/versions; enforced at the Worker layer by matching user_id. The D1 shard is also resolved based on user_id, ensuring data isolation.

---

15. Non-Functional Requirements

Category Requirement
Performance First token < 2s P50; preview update < 1s; dashboard list < 500ms P95. SSE long-duration is no longer a constraint — on the Paid plan, wall-clock duration is unbounded and billing is on CPU time only (active execution), so multi-minute streaming generations are both reliable and cheap. Cache hit latency < 100ms P95.
Scalability Edge-native; stateless Workers; storage scales via R2/KV. D1 scales via sharding on user_id, removing the 10 GB single-database ceiling. The per-user DO model scales horizontally (one lightweight instance per active user). Cache layer reduces origin load. Target 10k concurrent generations.
Availability 99.9% monthly uptime for core API. Graceful degradation if one AI provider is down. Stale cache served during backend outages.
Reliability Idempotent generation completion; no double-debits; non-destructive versioning. Cache consistency maintained via invalidation triggers.
Accessibility WCAG 2.1 AA; keyboard navigable; screen-reader labels on core controls.
Responsiveness Usable from 375px → 4K; dark-first.
Internationalization English at launch; architecture ready for i18n (P2).
Browser support Latest 2 versions of Chrome, Edge, Firefox, Safari.

---

16. Security & Compliance

· Transport: HTTPS everywhere; SSE over HTTPS.
· Secrets: Provider API keys stored as Worker secrets; never exposed to client.
· Sandbox isolation: Sandpack runs untrusted generated code client-side in an isolated iframe; no access to user credentials.
· Webhook security: Verify Clerk/Stripe signatures; reject unsigned/replayed events.
· Authorization: Strict per-user data isolation via user_id matching and D1 shard resolution.
· Rate limiting & abuse: KV-based soft limits + Durable Object hard limits; prompt-abuse filtering; provider usage caps.
· Data privacy: Store only necessary user data; honor deletion (GDPR/CCPA-style) within retention window.
· PII: Email + auth identifiers only; payment data handled by Stripe (PCI scope offloaded).
· Content safety: Apply provider safety settings; block disallowed generation requests.
· Audit: Credit transactions and version history provide an audit trail.
· Cache security: Sensitive data never cached; cache keys scoped to authenticated user context.

---

17. Analytics & Observability

17.1 Product Analytics (events)

· signup_completed, project_created, generation_started, generation_completed, generation_aborted, preview_rendered, code_edited, version_restored, project_exported, upgrade_clicked, plan_upgraded, cache_hit, cache_miss, dedup_hit.

17.2 Operational Observability

· Structured logs from Workers (request id, user id, model, latency, tokens, credits, d1_shard, cache_status).
· Metrics: first-token latency, full-generation latency, prompt-cache-hit rate, dedup-hit rate, edge-cache-hit rate, success rate, provider error rates, credit debit accuracy, D1 shard size/usage, cache-related latency reduction.
· Alerting on provider error spikes, elevated latency, shard reaching capacity, cache hit rate drops, and billing anomalies.
· Distributed tracing across generate → provider → DO → D1 → storage → cache.

---

18. Release Plan & Milestones

Phase Scope Exit Criteria
M0 — Foundations Repo, CI, Clerk auth, Workers+Hono skeleton, D1(Sharded)/KV/R2 wiring, DO skeleton, basic cache layer Auth works; webhooks provision users + credits in correct D1 shard; edge cache for static endpoints
M1 — Core Generation /generate SSE, single model, Sandpack preview, Monaco editor, prompt dedup cache Prompt → streamed → previewable project; dedup works
M2 — Multi-Model + Credits 8-model catalog, model switching, CreditMeter DO with reserve/settle/refund, Free/Pro plans, provider cache utilization Switching works; credits debit/refund correctly with strong consistency; provider cache hits measurable
M3 — Projects + Versions Dashboard CRUD, version timeline, diff viewer, restore, edge cache for project lists, file blob cache Full iterate loop; non-destructive restore; cache invalidation on mutations
M4 — Export + Polish Zip export, responsive dark-first UI, accessibility pass, async processing via Queues, cache monitoring Exported app runs locally; AA contrast; cache metrics dashboard
M5 — Billing GA Stripe checkout/portal, refills, guardrails End-to-end paid upgrade
M6 — Beta → GA Observability, load testing, hardening, D1 shard monitoring, cache performance tuning Meets NFRs; success metrics instrumented

---

19. Risks & Mitigations

Risk Impact Mitigation
AI provider outages / rate limits Generation failures Multi-provider fallback; queue + retry; status page.
Cost overruns on AI usage Margin erosion Prompt caching (§9.3, §10); billing is on CPU-ms not wall-clock (streaming is cheap); per-gen token caps; model-tier gating; R2 has no egress fees; Queues offload non-critical CPU. Dedup cache prevents redundant generations.
Generated code doesn't compile/preview Poor UX Strict output format, validation step, auto-repair retry.
SSE on Workers edge cases (timeouts, buffering) Broken streaming Paid plan: unlimited wall-clock duration, CPU-only billing, subrequest default 10,000. Pipe via TransformStream; keep-alive ping; client reconnect.
Sandpack limitations for complex projects Preview gaps Document supported templates; fallback to download-and-run.
Vendor lock-in (Cloudflare) Strategic risk D1 uses standard SQLite format, portable. R2 is S3-compatible. Core logic is in Hono, portable to Node.js. Cache API is standard Web API.
Billing edge cases (double-debit, refund) Trust/financial CreditMeter Durable Object serializes all credit ops with strong consistency; operations idempotent on generationId; D1 ledger + periodic reconciliation.
D1 shard hot-spotting or capacity issues Scalability / Rework Start with a conservative number of shards (e.g., 4) based on hash of user_id. Monitor shard sizes; adding new shards requires rebalancing strategy documented in runbook.
Cache inconsistency / stale data UX degradation TTL-based expiry; explicit invalidation on mutations (§10.5); stale-while-revalidate pattern; stale cache served during outages as graceful degradation.
Prompt cache poisoning (dedup returning wrong version) Incorrect output Dedup key scoped to userId + content_hash; short TTL (2 min); X-Skip-Dedup override available.

---

20. Open Questions

1. ~~Relational store~~ → RESOLVED. Adopt Cloudflare D1 with Sharding based on a hash of user_id. This leverages D1's edge-native simplicity while overcoming the 10 GB limit, using a proven manual sharding strategy.
2. Pricing: Final price points, credit allotments, and per-model credit rates — pending finance/usage modeling.
3. Billing provider: Stripe direct vs Clerk Billing integration?
4. Model versions: Exact provider model versions to ship in the catalog at launch.
5. ~~Project scope limits~~ → RESOLVED. Limit by file count + total source bytes per plan. Illustrative caps: Free (30 files, 2 MB), Pro (200 files, 25 MB). Tune with finance modeling.
6. Auto-repair: Should failed generations trigger an automatic repair pass (extra credits)?
7. Sharing: Scope of public share links for v1 vs P1.
8. One-click deploy: Target platform (Cloudflare Pages vs Vercel) for the P2 phase.
9. Cache TTL tuning: Final TTL values to be determined through load testing and usage pattern analysis during beta.

---

21. Appendix

21.1 Glossary

Term Definition
Credit Unit of AI consumption billed to a user.
Generation One AI request producing/updating a project.
Version An immutable snapshot of a project's files at a point in time.
Manifest JSON index of files belonging to a version.
SSE Server-Sent Events; one-way server→client streaming over HTTP.
Durable Object (DO) Cloudflare's strongly-consistent, single-threaded compute primitive.
D1 Shard A single logical D1 database, isolated by a hash of user_id, forming part of a larger sharded data tier.
Prompt Caching Provider-side caching of repeated prompt prefixes (Anthropic/OpenAI).
Dedup Application-level deduplication of identical generation requests via KV.
Edge Cache Workers Cache API for idempotent GET responses at the CDN edge.
SWR Stale-while-revalidate — serve cached data while fetching fresh data in background.

21.2 Generated Code Quality Standard

All generated projects must:

· Include a top-of-file comment explaining each file's purpose.
· Use clear, descriptive names; avoid clever one-liners.
· Comment non-obvious logic in plain language for beginners.
· Ship with a README.md containing setup and run instructions.

21.3 SSE Event Schema (reference)

Event Payload Meaning
token { delta } Incremental text chunk.
file { path, status } A file has started/completed parsing.
error { code, message } Recoverable or fatal error.
done { projectId, versionId, creditsCost, fromCache } Generation complete. fromCache is true if served from dedup cache.

21.4 Cloudflare Paid Plan Reference

Figures current as of the revision date; re-confirm against Cloudflare docs at implementation time.

Workers Paid (Standard usage model)

· Minimum $5/month per account.
· 10M requests included (+$0.30 / additional million); 30M CPU-ms included (+$0.02 / additional million).
· No charge or limit for duration (wall-clock). CPU time only counts active execution.
· Max CPU per invocation: 30s default, up to 5 minutes (configurable via cpu_ms).
· Subrequests: 10,000 default on Paid (configurable up to 10M).

D1 (Sharded)

· Sharding strategy avoids the 10 GB hard cap per database. Storage is $0.75/GB/mo. Reads: 25B rows/month free, then $0.001/million rows. Writes: 50M rows/month free, then $1.00/million rows.
· Throughput & Limits: SQLite backend (single writer per shard), so sharding is key for write concurrency.

Workers Cache API

· Included with Workers Paid. No additional cost beyond request fees.
· Cache storage is free; cache operations count as subrequests.

Hyperdrive, KV, Durable Objects, R2, Queues

· Priced per usage, scales automatically.

---

End of document.

---

Dokumen PRD v1.2 sudah lengkap dengan integrasi Caching Strategy di:

· Section 10: Caching Strategy lengkap (overview, layer cache, dedup flow, implementasi, invalidation, monitoring)
· Section 3: Success metrics cache (prompt cache hit rate, edge cache hit rate, dedup hit rate)
· Section 7: Architecture diagram + component responsibilities mencakup cache layer
· Section 8: Stack mencakup Workers Cache API, SWR, Cache-Control headers
· Section 12: API spec mencakup cache headers dan X-Skip-Dedup
· Section 17: Observability mencakup metrik cache
· Section 18: Milestones mencakup cache implementation & tuning
· Section 19: Risks & mitigations untuk cache inconsistency/poisoning