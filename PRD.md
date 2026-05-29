# Product Requirements Document (PRD)
## AI App Builder SaaS

| Field | Value |
|---|---|
| **Product Name** | AI App Builder SaaS (working title) |
| **Document Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-05-29 |
| **Owner** | Product Team |
| **Stakeholders** | Engineering, Design, Growth, Finance, Support |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement & Vision](#2-problem-statement--vision)
3. [Goals, Non-Goals & Success Metrics](#3-goals-non-goals--success-metrics)
4. [Target Users & Personas](#4-target-users--personas)
5. [User Journeys](#5-user-journeys)
6. [Feature Requirements](#6-feature-requirements)
7. [System Architecture](#7-system-architecture)
8. [Technical Stack](#8-technical-stack)
9. [AI Model Layer](#9-ai-model-layer)
10. [Data Model](#10-data-model)
11. [API Specification](#11-api-specification)
12. [Billing & Credits System](#12-billing--credits-system)
13. [Authentication & Authorization](#13-authentication--authorization)
14. [Non-Functional Requirements](#14-non-functional-requirements)
15. [Security & Compliance](#15-security--compliance)
16. [Analytics & Observability](#16-analytics--observability)
17. [Release Plan & Milestones](#17-release-plan--milestones)
18. [Risks & Mitigations](#18-risks--mitigations)
19. [Open Questions](#19-open-questions)
20. [Appendix](#20-appendix)

---

## 1. Executive Summary

**AI App Builder SaaS** is a web platform that lets anyone generate, preview, edit, and export production-ready web applications using natural language prompts. Users describe what they want to build, and the platform leverages best-in-class large language models (Claude, GPT-4o, Gemini, DeepSeek and more) to generate complete, runnable codebases.

The product differentiates itself through:

- **Live in-browser preview** via Sandpack — no local setup required.
- **A full VS Code-grade editing experience** via the Monaco Editor.
- **Multi-model flexibility** — switch between 8 AI models to balance cost, speed, and quality.
- **Real-time streaming** of AI responses for an instant, interactive feel.
- **An edge-native backend** (Cloudflare Workers + Hono + R2 + KV) for global low latency and cost efficiency.
- **A credits-based billing model** with a generous free tier and a Pro upgrade.
- **First-class version history** with a timeline, diff viewer, and one-click restore.

The codebase produced and the platform itself prioritize **heavily commented, beginner-friendly code** so that users learn while they build.

---

## 2. Problem Statement & Vision

### 2.1 Problem

Building software remains slow, expensive, and inaccessible to non-engineers. Existing "AI coding" tools are often:

- Locked to a single model with no cost/quality control.
- Lacking a real, runnable preview (users must copy-paste code locally).
- Missing proper version history, so users lose work or cannot iterate safely.
- Opaque about cost, leading to bill shock.
- Generating unreadable code that users can't learn from or maintain.

### 2.2 Vision

> Empower anyone — from non-technical founders to senior engineers — to go from idea to a working, exportable web application in minutes, with full transparency, control, and the ability to learn from the generated code.

### 2.3 Strategic Bets

1. **Model-agnostic** beats single-model lock-in.
2. **Edge-native infrastructure** delivers global speed at low marginal cost.
3. **Preview + edit + history** turns one-shot generation into a real iterative workflow.
4. **Credits** align cost with value and protect margins.

---

## 3. Goals, Non-Goals & Success Metrics

### 3.1 Goals

- G1: Generate runnable, previewable web apps from a single prompt in < 30s to first token.
- G2: Support 8 AI models with seamless switching mid-session.
- G3: Provide a complete iterate loop: generate → preview → edit → regenerate → version → export.
- G4: Monetize via a credits system with Free and Pro plans.
- G5: Keep generated code heavily commented and beginner-friendly.

### 3.2 Non-Goals (v1)

- Native mobile app generation (iOS/Android).
- Multiplayer / real-time collaborative editing.
- Self-hosting / on-prem deployment.
- Marketplace for templates or plugins.
- One-click deploy to production hosting (planned for a later phase).

### 3.3 Success Metrics (North Star + Supporting)

| Metric | Target (90 days post-launch) |
|---|---|
| **North Star:** Weekly Active Builders (users who generate ≥1 app/week) | 5,000 |
| Time-to-first-preview (P50) | < 20s |
| First-token latency (P50) | < 2s |
| Free → Pro conversion rate | ≥ 4% |
| Project export rate (% of projects exported) | ≥ 35% |
| 7-day retention | ≥ 30% |
| Gross margin on AI usage | ≥ 60% |
| Generation success rate (compiles & previews) | ≥ 90% |

---

## 4. Target Users & Personas

### Persona A — "Maya, the Non-Technical Founder"
- Wants to validate an idea with a working prototype.
- Cannot code; needs preview and export to hand to a developer.
- Values speed, clarity, and predictable cost.

### Persona B — "Devon, the Full-Stack Developer"
- Uses the tool to scaffold boilerplate and accelerate delivery.
- Wants control over the model, the ability to edit code directly, and clean exports.
- Cares about code quality and version history.

### Persona C — "Sara, the Student / Learner"
- Learning to build web apps.
- Values heavily commented, beginner-friendly code and the free tier.

### Persona D — "Raj, the Agency / Freelancer"
- Builds many client prototypes.
- Needs project management (dashboard, CRUD), export, and Pro-tier credits.

---

## 5. User Journeys

### 5.1 First-Run (New User)

1. User lands on marketing page → clicks **"Start Building"**.
2. Signs up via Clerk (email, Google, GitHub).
3. Webhook provisions the user + grants **free credits**.
4. Lands on an empty **Dashboard** with a prominent prompt box.
5. Types a prompt: *"A todo app with dark mode and local storage."*
6. Selects a model (default: a fast, cost-efficient model).
7. AI streams the generated project; **Sandpack preview** renders live.
8. User edits in **Monaco**, re-prompts, and the diff is captured as a **version**.
9. User clicks **Export** → downloads a `.zip` of the project.

### 5.2 Returning User — Iterate

1. Opens Dashboard → selects an existing project.
2. Reviews **version timeline** → opens **diff viewer** between v3 and v5.
3. Restores v3, branches a new prompt, generates v6.
4. Runs low on credits → prompted to upgrade to **Pro**.

### 5.3 Upgrade

1. User hits credit limit or wants more.
2. Clicks **Upgrade** → Clerk/Stripe checkout.
3. Webhook updates plan → credits refilled → Pro features unlocked.

---

## 6. Feature Requirements

Each feature lists priority (`P0` = launch-blocking, `P1` = launch-desirable, `P2` = post-launch) and acceptance criteria.

### 6.1 AI Code Generation (P0)
- **Description:** Convert a natural-language prompt into a complete, runnable web project.
- **Requirements:**
  - Accept a freeform prompt plus optional context (existing project files).
  - Stream output token-by-token via SSE.
  - Produce a structured multi-file project (file tree + file contents).
  - Generated code is **heavily commented and beginner-friendly**.
- **Acceptance Criteria:**
  - Given a valid prompt, the system returns a project that compiles and renders in Sandpack ≥ 90% of the time.
  - First token arrives in < 2s (P50).
  - Output is parsed into discrete files with correct paths.

### 6.2 Multi-Model Switching (P0)
- **Description:** Choose among 8 AI models; switch at any time.
- **Requirements:**
  - Model picker UI with per-model metadata: provider, speed, cost (credits/1K tokens), strengths.
  - Switching persists per project/session.
  - Graceful fallback if a provider is down.
- **Acceptance Criteria:**
  - All 8 models selectable and functional.
  - Switching mid-session does not lose context.

### 6.3 Live Preview — Sandpack (P0)
- **Description:** In-browser live preview of generated code.
- **Requirements:**
  - Render the active project in an isolated Sandpack sandbox.
  - Hot-reload on file changes.
  - Console/error panel surfaced to the user.
- **Acceptance Criteria:**
  - Preview updates within 1s of an edit.
  - Runtime errors are displayed inline, not silently swallowed.

### 6.4 Code Editor — Monaco (P0)
- **Description:** VS Code-grade in-browser editing.
- **Requirements:**
  - Syntax highlighting, IntelliSense, multi-file tabs, file tree.
  - Dark-first theming consistent with app.
  - Edits sync to the preview and to version history.
- **Acceptance Criteria:**
  - Users can edit any file and see results in preview.
  - Editor state survives navigation within the app.

### 6.5 Real-Time Streaming (P0)
- **Description:** Stream AI responses via Server-Sent Events.
- **Requirements:**
  - SSE endpoint on Cloudflare Workers.
  - Incremental rendering of file contents as they arrive.
  - Cancelable generations (abort) that refund unused credits where applicable.
- **Acceptance Criteria:**
  - Tokens render progressively; no full-response blocking.
  - Abort stops billing for unsent tokens.

### 6.6 Version History (P0)
- **Description:** Timeline, diff viewer, and restore.
- **Requirements:**
  - Every generation/edit checkpoint creates a version snapshot.
  - **Timeline** view of versions with timestamps, model used, prompt.
  - **Diff viewer** (file-level + line-level) between any two versions.
  - **Restore** to any prior version (creates a new version, non-destructive).
- **Acceptance Criteria:**
  - Diff highlights additions/deletions correctly.
  - Restore is non-destructive and reversible.

### 6.7 Project Management — Dashboard CRUD (P0)
- **Description:** Full lifecycle management of projects.
- **Requirements:**
  - Create, read, update, rename, duplicate, delete projects.
  - Search, sort, and filter projects.
  - Per-project metadata: name, created/updated, model, credits used, thumbnail.
- **Acceptance Criteria:**
  - All CRUD operations succeed and persist.
  - Deletion is soft (recoverable for 30 days) then hard-deleted.

### 6.8 Export / Download (P0)
- **Description:** Download generated project as a zip.
- **Requirements:**
  - Bundle full file tree into a `.zip`.
  - Include `README.md`, `package.json`, and run instructions.
- **Acceptance Criteria:**
  - Exported project runs locally with documented steps.

### 6.9 Authentication — Clerk + Webhooks (P0)
- **Description:** User auth and lifecycle sync.
- **Requirements:**
  - Email, Google, GitHub sign-in.
  - Webhooks for `user.created`, `user.updated`, `user.deleted`, subscription events.
  - Provision credits on signup; sync plan on subscription change.
- **Acceptance Criteria:**
  - New users receive free credits automatically.
  - Plan/credit state stays consistent with Clerk/Stripe.

### 6.10 Billing & Credits (P0)
- **Description:** Credits-based metering with Free and Pro plans.
- See [Section 12](#12-billing--credits-system).

### 6.11 Responsive Dark-First UI (P0)
- **Description:** Fully responsive, dark-first design.
- **Requirements:**
  - Mobile, tablet, desktop breakpoints.
  - Dark theme default; light theme toggle.
  - ShadCN/UI + Radix primitives; Tailwind v4.
- **Acceptance Criteria:**
  - Core flows usable on a 375px-wide viewport.
  - WCAG AA contrast in both themes.

### 6.12 Prompt Templates / Starters (P1)
- Curated starter prompts and project templates to reduce blank-canvas friction.

### 6.13 Shareable Preview Links (P1)
- Read-only public preview links for a project version.

### 6.14 One-Click Deploy (P2)
- Deploy generated app to Cloudflare Pages / Vercel.

---

## 7. System Architecture

### 7.1 High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                          │
│  Next.js 16 (App Router) + React 19                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐  │
│  │ ShadCN/Radix │ │ Monaco Editor│ │ Sandpack Live Preview     │  │
│  │ + Tailwind v4│ │ (VS Code UX) │ │ (in-browser sandbox)      │  │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘  │
│         │  Clerk Auth (JWT)        │  SSE stream consumer          │
└─────────┼───────────────────────────┼─────────────────────────────┘
          │ HTTPS / SSE                │
┌─────────▼───────────────────────────▼─────────────────────────────┐
│                  EDGE BACKEND — Cloudflare Workers                  │
│                          Hono framework                            │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │ Auth/JWT   │ │ Generation   │ │ Credits/     │ │ Versioning  │ │
│  │ middleware │ │ + SSE proxy  │ │ Billing      │ │ service     │ │
│  └────────────┘ └──────┬───────┘ └──────┬───────┘ └──────┬──────┘ │
└──────────────────────────┼────────────────┼────────────────┼───────┘
                           │                │                │
          ┌────────────────┼────────────────┼────────────────┼──────┐
          ▼                ▼                ▼                ▼       ▼
   ┌────────────┐  ┌──────────────┐  ┌──────────┐   ┌──────────┐ ┌──────┐
   │ AI Provider│  │ Cloudflare R2│  │CF KV     │   │ Postgres │ │Clerk │
   │ Gateway    │  │ (project     │  │(metadata,│   │/D1 (rel. │ │(auth │
   │(Claude,GPT,│  │  files,zips) │  │ credits  │   │ data:    │ │ +    │
   │ Gemini,    │  │              │  │ cache)   │   │ users,   │ │ web- │
   │ DeepSeek)  │  │              │  │          │   │ projects)│ │hooks)│
   └────────────┘  └──────────────┘  └──────────┘   └──────────┘ └──────┘
```

### 7.2 Component Responsibilities

| Component | Responsibility |
|---|---|
| **Next.js client** | UI, editor, preview, SSE consumption, auth session. |
| **Cloudflare Workers (Hono)** | API routing, auth verification, AI provider proxy, credit metering, versioning, file storage orchestration. |
| **AI Provider Gateway** | Normalize requests across providers; stream responses; track tokens. |
| **Cloudflare R2** | Durable storage of project file blobs and exported zips. |
| **Cloudflare KV** | Fast metadata lookups, credit balances cache, session/rate-limit counters. |
| **Relational DB (Postgres or D1)** | Source of truth for users, projects, versions, transactions. |
| **Clerk** | Identity, sessions, webhooks for lifecycle and billing events. |

### 7.3 Generation Sequence (SSE)

```
Client                Worker (Hono)           AI Provider         R2 / KV / DB
  │  POST /generate       │                         │                  │
  │ (prompt, model,       │                         │                  │
  │  projectId, ctx)      │                         │                  │
  │──────────────────────▶│                         │                  │
  │                       │ verify JWT (Clerk)      │                  │
  │                       │ check credits (KV) ─────┼─────────────────▶│
  │                       │ open provider stream    │                  │
  │                       │────────────────────────▶│                  │
  │   SSE: token deltas    │◀────────────────────────│                  │
  │◀──────────────────────│  (proxy & accumulate)   │                  │
  │   ... (streaming) ...  │                         │                  │
  │                       │ on complete:            │                  │
  │                       │  parse files            │                  │
  │                       │  write blobs ───────────┼─────────────────▶│ R2
  │                       │  create version ────────┼─────────────────▶│ DB
  │                       │  debit credits ─────────┼─────────────────▶│ KV+DB
  │  SSE: done(versionId)  │                         │                  │
  │◀──────────────────────│                         │                  │
```

---

## 8. Technical Stack

### 8.1 Frontend

| Concern | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, React Server Components) |
| UI runtime | **React 19** |
| Component library | **ShadCN/UI** on **Radix UI** primitives |
| Styling | **Tailwind CSS v4** |
| Theme | Dark-first, fully responsive, light toggle |
| Editor | **Monaco Editor** |
| Preview | **Sandpack** |
| Auth client | **Clerk** React SDK |
| State/data | React Query / Server Actions; SSE via `EventSource`/fetch streams |

### 8.2 Backend

| Concern | Choice |
|---|---|
| Runtime | **Cloudflare Workers** |
| Framework | **Hono** |
| Object storage | **Cloudflare R2** |
| KV / metadata | **Cloudflare KV** |
| Relational store | **Cloudflare D1** or external **Postgres** (Neon) — see [Open Questions](#19-open-questions) |
| Streaming | **Server-Sent Events (SSE)** |
| Auth verification | Clerk JWT verification middleware |
| Billing | Stripe (via Clerk Billing or direct) |

### 8.3 Tooling & Quality

- TypeScript across the stack (strict).
- ESLint + Prettier; conventional commits.
- Vitest / Playwright for unit and E2E.
- **Code generation outputs are heavily commented** by design (system prompt enforced).

---

## 9. AI Model Layer

### 9.1 Supported Models (8)

| # | Model | Provider | Tier Default | Strength | Relative Cost |
|---|---|---|---|---|---|
| 1 | Claude Opus | Anthropic | Pro | Best reasoning & code quality | High |
| 2 | Claude Sonnet | Anthropic | Free+Pro | Balanced quality/speed | Medium |
| 3 | Claude Haiku | Anthropic | Free | Fast, cheap | Low |
| 4 | GPT-4o | OpenAI | Pro | Strong general + multimodal | High |
| 5 | GPT-4o mini | OpenAI | Free | Fast, cheap | Low |
| 6 | Gemini 1.5 Pro | Google | Pro | Long context | Medium-High |
| 7 | Gemini 1.5 Flash | Google | Free | Fast, long context | Low |
| 8 | DeepSeek-V3 / Coder | DeepSeek | Free+Pro | Code-specialized, cost-efficient | Low |

> Exact model versions are configurable via a server-side registry so the catalog can be updated without client changes. When building Claude-backed flows, default to the latest, most capable Claude models available.

### 9.2 Provider Abstraction

- A unified `ModelProvider` interface normalizes:
  - Request shape (system prompt, messages, params).
  - Streaming token deltas → common SSE event schema.
  - Token accounting (input/output) → credits.
- **Fallback policy:** on provider 5xx/timeout, optionally retry on a same-tier alternate (user-configurable, off by default to avoid surprise model swaps).

### 9.3 System Prompt Principles

- Always instruct the model to:
  - Produce a complete, runnable project with an explicit file manifest.
  - Write **heavily commented, beginner-friendly** code.
  - Follow a strict output format for reliable parsing (file path + fenced contents).
- Use prompt caching where the provider supports it to reduce cost/latency on shared system prompts and project context.

---

## 10. Data Model

### 10.1 Entities (relational source of truth)

```
User
  id (uuid, pk)
  clerk_user_id (string, unique)
  email
  plan (enum: free | pro)
  credits_balance (int)            # mirrored to KV for fast reads
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

### 10.2 KV Layout (fast lookups)

| Key | Value |
|---|---|
| `credits:{userId}` | current balance (int) + version stamp |
| `project-meta:{projectId}` | denormalized project metadata for list views |
| `ratelimit:{userId}:{window}` | request counters |
| `model-catalog` | current model registry (TTL cached) |

### 10.3 R2 Layout

```
projects/{projectId}/versions/{versionId}/manifest.json
projects/{projectId}/versions/{versionId}/files/{path}
projects/{projectId}/exports/{versionId}.zip
projects/{projectId}/thumbnails/{versionId}.png
```

---

## 11. API Specification

All endpoints are served by Cloudflare Workers (Hono) and require a valid Clerk JWT unless noted. Base path: `/api`.

### 11.1 Generation

```
POST /api/generate
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
  event: done    data: { projectId, versionId, creditsCost }
```

```
POST /api/generate/abort
Body: { generationId: string }
Response: { aborted: true, refundedCredits: number }
```

### 11.2 Projects (CRUD)

```
GET    /api/projects                 # list (search, sort, filter, paginate)
POST   /api/projects                 # create empty project
GET    /api/projects/:id             # detail + current version manifest
PATCH  /api/projects/:id             # rename / update metadata
POST   /api/projects/:id/duplicate   # clone
DELETE /api/projects/:id             # soft delete
```

### 11.3 Versions

```
GET  /api/projects/:id/versions              # timeline
GET  /api/projects/:id/versions/:vid         # version detail + files
GET  /api/projects/:id/diff?from=:a&to=:b    # diff payload (file + line level)
POST /api/projects/:id/versions/:vid/restore # restore -> new version
```

### 11.4 Export

```
POST /api/projects/:id/export        # build zip from current/selected version
  Body: { versionId?: string }
  Response: { downloadUrl }          # signed R2 URL, short TTL
```

### 11.5 Billing & Credits

```
GET  /api/credits                    # balance + recent transactions
GET  /api/billing/plan               # current plan + limits
POST /api/billing/checkout           # create Stripe checkout session
POST /api/billing/portal             # customer portal session
```

### 11.6 Webhooks (no JWT; signature-verified)

```
POST /api/webhooks/clerk             # user.created/updated/deleted
POST /api/webhooks/stripe            # subscription + payment events
```

### 11.7 Models

```
GET /api/models                      # catalog with metadata, cost, tier
```

---

## 12. Billing & Credits System

### 12.1 Model Overview

- **Credits** are the universal unit of consumption.
- Each generation debits credits based on `(tokens_in + tokens_out) × model_rate`, rounded up.
- Balances are stored in the DB (source of truth) and mirrored in KV for fast checks.

### 12.2 Plans

| Plan | Price | Monthly Credits | Models | Concurrency | Extras |
|---|---|---|---|---|---|
| **Free** | $0 | e.g. 200 credits/mo | Low/medium-cost models (Haiku, GPT-4o mini, Gemini Flash, DeepSeek, Claude Sonnet) | 1 generation | Watermarked share links |
| **Pro** | e.g. $20/mo | e.g. 5,000 credits/mo | All 8 models incl. Opus, GPT-4o, Gemini Pro | 3 concurrent | Priority queue, no watermark, larger projects, export presets |

> Pricing and credit allotments are placeholders pending finance modeling (see [Open Questions](#19-open-questions)).

### 12.3 Credit Lifecycle

1. **Signup grant** → free credits via Clerk webhook.
2. **Generation** → pre-check balance (KV) → reserve → on completion, debit actual usage; on abort, refund the unsent portion.
3. **Plan refill** → monthly refill on billing cycle (Stripe webhook).
4. **Top-ups** (P1) → one-time credit purchases.

### 12.4 Guardrails

- Hard stop when balance hits 0 (clear upgrade CTA).
- Soft warning at 10% remaining.
- Per-generation max token cap to prevent runaway cost.
- Rate limiting per user/plan via KV counters.

---

## 13. Authentication & Authorization

- **Clerk** handles sign-up/in (email, Google, GitHub), sessions, and JWT issuance.
- Workers verify the Clerk JWT on every protected request.
- **Webhooks** (signature-verified) keep the local `User`/`Subscription` records in sync:
  - `user.created` → create User + grant free credits.
  - `user.updated` → sync profile.
  - `user.deleted` → soft-delete user data (then purge per retention policy).
  - Subscription events (via Stripe/Clerk Billing) → update plan + refill credits.
- **Authorization:** users may only access their own projects/versions; enforced at the Worker layer by matching `user_id`.

---

## 14. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | First token < 2s P50; preview update < 1s; dashboard list < 500ms P95. |
| **Scalability** | Edge-native; stateless Workers; storage scales via R2/KV. Target 10k concurrent generations. |
| **Availability** | 99.9% monthly uptime for core API. Graceful degradation if one AI provider is down. |
| **Reliability** | Idempotent generation completion; no double-debits; non-destructive versioning. |
| **Accessibility** | WCAG 2.1 AA; keyboard navigable; screen-reader labels on core controls. |
| **Responsiveness** | Usable from 375px → 4K; dark-first. |
| **Internationalization** | English at launch; architecture ready for i18n (P2). |
| **Browser support** | Latest 2 versions of Chrome, Edge, Firefox, Safari. |

---

## 15. Security & Compliance

- **Transport:** HTTPS everywhere; SSE over HTTPS.
- **Secrets:** Provider API keys stored as Worker secrets; never exposed to client.
- **Sandbox isolation:** Sandpack runs untrusted generated code client-side in an isolated iframe; no access to user credentials.
- **Webhook security:** Verify Clerk/Stripe signatures; reject unsigned/replayed events.
- **Authorization:** Strict per-user data isolation.
- **Rate limiting & abuse:** KV-based limits; prompt-abuse filtering; provider usage caps.
- **Data privacy:** Store only necessary user data; honor deletion (GDPR/CCPA-style) within retention window.
- **PII:** Email + auth identifiers only; payment data handled by Stripe (PCI scope offloaded).
- **Content safety:** Apply provider safety settings; block disallowed generation requests.
- **Audit:** Credit transactions and version history provide an audit trail.

---

## 16. Analytics & Observability

### 16.1 Product Analytics (events)

- `signup_completed`, `project_created`, `generation_started`, `generation_completed`, `generation_aborted`, `preview_rendered`, `code_edited`, `version_restored`, `project_exported`, `upgrade_clicked`, `plan_upgraded`.

### 16.2 Operational Observability

- Structured logs from Workers (request id, user id, model, latency, tokens, credits).
- Metrics: first-token latency, full-generation latency, success rate, provider error rates, credit debit accuracy.
- Alerting on provider error spikes, elevated latency, and billing anomalies.
- Distributed tracing across generate → provider → storage.

---

## 17. Release Plan & Milestones

| Phase | Scope | Exit Criteria |
|---|---|---|
| **M0 — Foundations** | Repo, CI, Clerk auth, Workers+Hono skeleton, DB/KV/R2 wiring | Auth works; webhooks provision users + credits. |
| **M1 — Core Generation** | `/generate` SSE, single model, Sandpack preview, Monaco editor | Prompt → streamed → previewable project. |
| **M2 — Multi-Model + Credits** | 8-model catalog, model switching, credit metering, Free/Pro plans | Switching works; credits debit/refund correctly. |
| **M3 — Projects + Versions** | Dashboard CRUD, version timeline, diff viewer, restore | Full iterate loop; non-destructive restore. |
| **M4 — Export + Polish** | Zip export, responsive dark-first UI, accessibility pass | Exported app runs locally; AA contrast. |
| **M5 — Billing GA** | Stripe checkout/portal, refills, guardrails | End-to-end paid upgrade. |
| **M6 — Beta → GA** | Observability, load testing, hardening | Meets NFRs; success metrics instrumented. |

---

## 18. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| AI provider outages / rate limits | Generation failures | Multi-provider fallback; queue + retry; status page. |
| Cost overruns on AI usage | Margin erosion | Credits, per-gen token caps, model-tier gating, prompt caching. |
| Generated code doesn't compile/preview | Poor UX | Strict output format, validation step, auto-repair retry. |
| SSE on Workers edge cases (timeouts, buffering) | Broken streaming | Keep-alive pings, chunked flush, client reconnect logic. |
| Sandpack limitations for complex projects | Preview gaps | Document supported templates; fallback to download-and-run. |
| Vendor lock-in (Cloudflare) | Strategic risk | Abstract storage interfaces; keep DB portable. |
| Billing edge cases (double-debit, refund) | Trust/financial | Idempotency keys, transactional debits, reconciliation jobs. |
| D1 vs Postgres scale uncertainty | Rework risk | Decide early (see Open Questions); abstract data access. |

---

## 19. Open Questions

1. **Relational store:** Cloudflare D1 (edge-native, simpler) vs external Postgres/Neon (mature, scalable)? Decision affects M0.
2. **Pricing:** Final price points, credit allotments, and per-model credit rates — pending finance/usage modeling.
3. **Billing provider:** Stripe direct vs Clerk Billing integration?
4. **Model versions:** Exact provider model versions to ship in the catalog at launch.
5. **Project scope limits:** Max files / max project size per plan?
6. **Auto-repair:** Should failed generations trigger an automatic repair pass (extra credits)?
7. **Sharing:** Scope of public share links for v1 vs P1.
8. **One-click deploy:** Target platform (Cloudflare Pages vs Vercel) for the P2 phase.

---

## 20. Appendix

### 20.1 Glossary

| Term | Definition |
|---|---|
| **Credit** | Unit of AI consumption billed to a user. |
| **Generation** | One AI request producing/updating a project. |
| **Version** | An immutable snapshot of a project's files at a point in time. |
| **Manifest** | JSON index of files belonging to a version. |
| **SSE** | Server-Sent Events; one-way server→client streaming over HTTP. |

### 20.2 Generated Code Quality Standard

All generated projects must:
- Include a top-of-file comment explaining each file's purpose.
- Use clear, descriptive names; avoid clever one-liners.
- Comment non-obvious logic in plain language for beginners.
- Ship with a `README.md` containing setup and run instructions.

### 20.3 SSE Event Schema (reference)

| Event | Payload | Meaning |
|---|---|---|
| `token` | `{ delta }` | Incremental text chunk. |
| `file` | `{ path, status }` | A file has started/completed parsing. |
| `error` | `{ code, message }` | Recoverable or fatal error. |
| `done` | `{ projectId, versionId, creditsCost }` | Generation complete. |

---

*End of document.*
