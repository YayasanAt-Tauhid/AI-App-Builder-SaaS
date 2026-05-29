# PRD Revision — AI App Builder SaaS
## v1.1 · Cloudflare Paid Architecture & Optimization

| Field | Value |
|---|---|
| **Revises** | PRD v1.0 (2026-05-29) |
| **Revision** | 1.1 |
| **Status** | Draft (decisions ready for sign-off) |
| **Scope of change** | §7 Architecture, §8 Stack, §9 (note), §12 Billing & Credits, §14 (notes), §18 Risks, §19 Open Questions #1 & #5 |
| **Theme** | Adopt **Workers Paid** as the hosting baseline; resolve Cloudflare-related open questions and risks; add cost/performance optimizations |
| **Owner** | Product + Engineering |

> This document replaces the listed sections of v1.0. Sections not mentioned here are unchanged. Cloudflare limits/pricing cited in the Appendix are current as of the revision date and should be re-verified before implementation.

---

## 0. Revision Summary — Decision Log

| # | Topic | Decision | Why |
|---|---|---|---|
| D1 | **Hosting baseline** | **Workers Paid** (Standard usage model, $5/mo minimum) | Unlocks long-lived streaming, higher subrequest limits, Durable Objects KV backend, and full Hyperdrive. |
| D2 | **Relational store** (closes Open Q #1) | **Neon Postgres via Hyperdrive** — *not* D1 | D1 has a hard 10 GB/database, single-writer ceiling. Hyperdrive (pooling + query cache, included on Paid) makes external Postgres feel edge-local; Postgres is portable → also reduces vendor lock-in. |
| D3 | **Credit metering** | **Per-user Durable Object** as the live counter + lock; Postgres as the durable ledger | KV is eventually consistent (~60s propagation), unsafe as a balance for debits. A single-threaded DO gives strongly-consistent reserve→debit→refund — kills the double-debit risk. |
| D4 | **Concurrency & rate limiting** | Enforced in the same per-user Durable Object | Free = 1 in-flight generation, Pro = 3; per-user request throttling. |
| D5 | **SSE streaming** (closes risk) | Keep SSE; rely on Paid plan’s unlimited wall-clock duration + CPU-only billing | Streaming from a provider is I/O, not CPU. The "timeout" risk largely disappears on Paid. |
| D6 | **Async post-processing** | **Cloudflare Queues** for thumbnail render + zip pre-build | Keeps the streaming Worker lean; critical version write stays inline so `versionId` returns fast. |
| D7 | **Project size limits** (closes Open Q #5) | Bound by **file count + total source bytes per plan**, not storage | Files live in R2 (cheap, no egress); the real cost driver is generation tokens, not storage. |
| D8 | **KV repositioning** | KV used only for config/model-catalog cache and soft rate-limit hints — **never** as the source of truth for credits | Reflects KV's eventual-consistency model. |

---

## 7. System Architecture (REVISED)

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
│             EDGE BACKEND — Cloudflare Workers (Paid)               │
│                          Hono framework                            │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │ Auth/JWT   │ │ Generation   │ │ Versioning   │ │ Export /    │ │
│  │ middleware │ │ + SSE proxy  │ │ service      │ │ Billing API │ │
│  └────────────┘ └──────┬───────┘ └──────┬───────┘ └──────┬──────┘ │
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
 │ AI Provider│  │ Cloudflare R2│ │  Hyperdrive  │ │ Cloudflare   │
 │ Gateway    │  │ (project     │ │  (pool+cache)│ │ Queues       │
 │(Claude,GPT,│  │  files, zips,│ │      │       │ │(thumbnails,  │
 │ Gemini,    │  │  thumbnails) │ │      ▼       │ │ zip prebuild)│
 │ DeepSeek)  │  │              │ │ Neon Postgres│ │              │
 └────────────┘  └──────────────┘ │ (source of   │ └──────────────┘
                                   │  truth: users│
   ┌──────────────┐                │  projects,   │   ┌──────────┐
   │ Cloudflare KV│                │  versions,   │   │  Clerk   │
   │ (model-catalog│               │  txn ledger) │   │ (auth +  │
   │  + config cache)              └──────────────┘   │ webhooks)│
   └──────────────┘                                   └──────────┘
```

### 7.2 Component Responsibilities (REVISED)

| Component | Responsibility |
|---|---|
| **Next.js client** | UI, editor, preview, SSE consumption, auth session. |
| **Cloudflare Workers (Hono)** | API routing, JWT verification, AI provider proxy/stream, versioning, storage orchestration. |
| **CreditMeter Durable Object (per user)** | **Strongly-consistent** credit reserve/debit/refund; concurrency slot enforcement; per-user rate limiting. The live counter + lock. |
| **AI Provider Gateway** | Normalize requests across providers; stream token deltas; token accounting. |
| **Hyperdrive → Neon Postgres** | Source of truth for users, projects, versions, and the credit-transaction ledger. Hyperdrive supplies connection pooling + read-query caching at the edge. |
| **Cloudflare R2** | Durable storage of project file blobs, export zips, thumbnails. No egress charge. |
| **Cloudflare KV** | Model-catalog registry + config cache, soft rate-limit hints. **Not** the credit source of truth. |
| **Cloudflare Queues** | Async post-processing (thumbnail render, zip pre-build) off the request path. |
| **Clerk** | Identity, sessions, lifecycle + billing webhooks. |

### 7.3 Generation Sequence (REVISED — SSE + DO + Hyperdrive)

```
Client          Worker (Hono)        CreditMeter DO     AI Provider     R2 / Postgres(HD) / Queue
  │ POST /generate │                      │                  │                  │
  │───────────────▶│ verify JWT (Clerk)   │                  │                  │
  │                │ reserve(estCredits) ─▶│ serialized check │                  │
  │                │   + claim slot        │ (strong consist.)│                  │
  │                │◀── ok | 402/409 ──────│                  │                  │
  │                │ open provider stream ───────────────────▶│                  │
  │  SSE token Δ    │◀──── token deltas ───────────────────────│                  │
  │◀───────────────│ pipe via TransformStream (no buffering)  │                  │
  │ ...keep-alive...│ (comment ping every ~15–25s)            │                  │
  │                │ on complete:          │                  │                  │
  │                │  parse files          │                  │                  │
  │                │  write blobs ─────────┼──────────────────┼─────────────────▶│ R2
  │                │  insert version+manifest ────────────────┼─────────────────▶│ Postgres (Hyperdrive)
  │                │  settle(actualCredits)▶│ debit + release  │                  │
  │                │  enqueue thumbnail/zip ┼──────────────────┼─────────────────▶│ Queue
  │ SSE done(verId) │                      │                  │                  │
  │◀───────────────│                       │                  │                  │
  │ (on abort) ─────▶ refund(unused) ──────▶│ credit back + release slot          │
```

Key properties: credit operations are serialized in the DO (no double-debit); the critical version row + manifest are written inline so `versionId` returns immediately; non-critical artifacts are produced asynchronously via Queues.

---

## 8. Technical Stack (REVISED — §8.2 Backend)

| Concern | Choice |
|---|---|
| Runtime | **Cloudflare Workers — Paid plan** (Standard usage model) |
| Framework | **Hono** |
| Object storage | **Cloudflare R2** (project blobs, zips, thumbnails) |
| Relational store | **Neon Postgres via Cloudflare Hyperdrive** *(decision finalized; supersedes the D1-vs-Postgres open question)* |
| Strong-consistency primitives | **Durable Objects** — `CreditMeter` per user (credits, concurrency, rate limiting) |
| Async jobs | **Cloudflare Queues** (thumbnail render, zip pre-build) |
| KV / cache | **Cloudflare KV** — model-catalog + config cache, soft rate-limit hints only |
| Streaming | **Server-Sent Events (SSE)** over HTTPS |
| Auth verification | Clerk JWT verification middleware |
| Billing | Stripe (via Clerk Billing or direct) — *provider choice still open (Open Q #3)* |

`§8.1 Frontend` and `§8.3 Tooling & Quality` are unchanged from v1.0.

### 8.4 Wrangler limits (reference)

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

## 9. AI Model Layer (NOTE — addition to §9.3)

Emphasis, not a change: **prompt caching is a first-class cost lever**, not optional. The shared system prompt and the carried project context are re-sent on every iteration; caching them (where the provider supports it) cuts both cost and first-token latency materially on the iterate loop, which is the dominant usage pattern. Treat cache-hit rate as a tracked metric (see §16).

---

## 12. Billing & Credits System (REVISED)

### 12.1 Metering architecture (REVISED)

- **Source of truth (durable ledger):** the `CreditTransaction` table in Postgres (unchanged schema from v1.0 §10).
- **Live counter + lock:** a per-user **`CreditMeter` Durable Object**, addressed by `idFromName(userId)`. Because a Durable Object is single-threaded, all credit operations for a user are **serialized and strongly consistent** — eliminating the race conditions that an eventually-consistent KV balance would allow.
- **KV is no longer the balance of record.** It may hold a cached, display-only snapshot for non-critical UI reads, but every *decision* (can this generation proceed? how much to debit?) goes through the DO.

### 12.2 Credit lifecycle (REVISED)

1. **Signup grant** → free credits written to Postgres ledger + DO state via Clerk webhook.
2. **Generation**
   - `reserve(estCredits, generationId)` on the DO → atomically checks balance **and** claims a concurrency slot. Returns `402` if insufficient credits, `409` if concurrency cap reached.
   - On completion: `settle(generationId, actualCredits)` → debits actual usage, releases the slot, appends a ledger row.
   - On abort: `refund(generationId, unusedCredits)` → credits back the unsent portion, releases the slot.
3. **Plan refill** → monthly refill on the billing cycle (Stripe webhook) updates ledger + DO.
4. **Top-ups (P1)** → one-time purchases, same path.

All three operations are **idempotent on `generationId`**, so retries and duplicate webhooks cannot double-apply.

### 12.3 Concurrency & rate limiting (NEW — folded into the DO)

| Plan | In-flight generations | Per-user throttle |
|---|---|---|
| **Free** | 1 | conservative (KV soft-hint + DO hard cap) |
| **Pro** | 3 concurrent | higher, with priority queue |

Enforced authoritatively inside `CreditMeter`. KV counters may provide a cheap first-pass hint, but the DO is the binding limit.

### 12.4 Guardrails (unchanged + reinforced)

- Hard stop at 0 balance (clear upgrade CTA); soft warning at 10% remaining.
- Per-generation max-token cap (the primary runaway-cost control).
- Concurrency + rate limits via the DO (above).

`§12.2 Plans` pricing table from v1.0 is unchanged and still **placeholder pending finance modeling (Open Q #2)**.

---

## 14. Non-Functional Requirements (NOTES)

- **Performance / Reliability:** SSE long-duration is no longer a constraint — on the Paid plan, wall-clock duration is unbounded and billing is on CPU time only (active execution), so multi-minute streaming generations are both reliable and cheap. Target first-token < 2s P50 stands.
- **Scalability:** Postgres (via Hyperdrive) removes the D1 10 GB / single-writer ceiling for the relational tier; Workers remain stateless; R2/KV scale independently. The per-user DO model scales horizontally (one lightweight instance per active user).

Other NFR rows from v1.0 are unchanged.

---

## 18. Risks & Mitigations (REVISED rows)

| Risk | Status | Mitigation (updated) |
|---|---|---|
| AI provider outages / rate limits | Open | Multi-provider fallback; queue + retry; status page. (unchanged) |
| Cost overruns on AI usage | **Mitigated** | Prompt caching (§9 note); billing is on CPU-ms not wall-clock (streaming is cheap); per-gen token caps; model-tier gating; R2 has no egress fees; Queues offload non-critical CPU. |
| Generated code doesn’t compile/preview | Open | Strict output format, validation step, optional auto-repair (Open Q #6). (unchanged) |
| **SSE on Workers edge cases** | **Resolved** | Paid plan: unlimited wall-clock duration, CPU-only billing, subrequest default 10,000. Pipe via `TransformStream` (no full-response buffering); keep-alive comment ping every ~15–25s; client reconnect logic. |
| Sandpack limitations for complex projects | Open | Document supported templates; fallback to download-and-run. (unchanged) |
| **Vendor lock-in (Cloudflare)** | **Mitigated** | Relational tier is portable Postgres (Hyperdrive is a transport optimization, not a data store); storage access behind interfaces. Compute remains the main Cloudflare-specific surface. |
| **Billing double-debit / refund** | **Mitigated** | `CreditMeter` Durable Object serializes all credit ops with strong consistency; operations idempotent on `generationId`; Postgres ledger + periodic reconciliation. |
| **D1 vs Postgres scale uncertainty** | **Resolved** | Decision finalized: Neon Postgres via Hyperdrive (see §8, Open Q #1). |

---

## 19. Open Questions — Resolutions

**#1 — Relational store → RESOLVED.**
Adopt **Neon Postgres via Cloudflare Hyperdrive**. Rationale: D1’s hard 10 GB-per-database, single-writer SQLite model is a real ceiling and a rework risk; Hyperdrive’s connection pooling + read-query caching (included on the Paid plan, no extra charge, no egress) makes external Postgres feel edge-local, while Postgres remains a mature, portable, horizontally-scalable store. Affects M0 wiring.

**#5 — Project scope limits → RESOLVED (policy set; numbers tunable).**
Limit by **file count + total source bytes per plan**, because file blobs live in R2 (cheap, no egress) — storage is not the binding cost; generation **tokens** and provider context windows are. Illustrative caps (tune with §12.2 finance modeling):

| | Free | Pro |
|---|---|---|
| Max files / project | ~30 | ~200 |
| Max total source size | ~2 MB | ~25 MB |
| Manifest | kept small (JSON index only; contents in R2) | same |

**Still open (carried from v1.0):** #2 pricing & credit allotments (finance), #3 Stripe-direct vs Clerk Billing, #4 exact provider model versions, #6 auto-repair pass (extra credits), #7 share-link scope for v1, #8 one-click-deploy target. These are unaffected by this revision.

---

## Appendix A — Cloudflare Paid Plan Reference (verify before build)

> Figures current as of the revision date; re-confirm against Cloudflare docs at implementation time.

**Workers Paid (Standard usage model)**
- Minimum **$5/month** per account.
- 10M requests included (+$0.30 / additional million); 30M CPU-ms included (+$0.02 / additional million).
- **No charge or limit for duration (wall-clock).** CPU time only counts active execution.
- Max CPU per invocation: **30s default, up to 5 minutes** (configurable via `cpu_ms`).
- Subrequests: **10,000 default** on Paid (configurable up to 10M). WebSocket: the initial upgrade is billed as one request; messages are not.

**D1 (rejected as primary store, for reference)**
- **10 GB hard cap per database**, single-writer (SQLite). 50,000 DBs/account, 1 TB/account, Time Travel 30 days. Throughput ≈ 1000 qps if avg query ≈ 1ms.

**Hyperdrive (Paid)**
- Included on the Paid plan; **unlimited queries**; connection pooling + query caching at **no additional charge**; **no egress** fees. ~100 origin connections per configuration; max query duration 60s.

**KV**
- Eventually consistent — writes may take **up to ~60s** to propagate globally; ~1 write/s per unique key. Suitable for cache/config, **not** for transactional balances.

**Durable Objects (Paid)**
- Single-threaded, strongly consistent. SQLite or KV storage backend available on Paid. Billed for compute duration (wall-clock) while actively running or idle-in-memory.

---

## Appendix B — `CreditMeter` Durable Object (conceptual sketch)

```ts
// One instance per user: env.CREDIT_METER.idFromName(userId)
// Single-threaded => every method runs to completion before the next,
// giving serialized, strongly-consistent credit accounting per user.
export class CreditMeter {
  // Atomically: check balance AND claim a concurrency slot.
  // -> { ok: true, slot } | { ok: false, code: 'NO_CREDITS' | 'CONCURRENCY' }
  async reserve(estCredits: number, generationId: string) { /* ... */ }

  // Debit the actual usage, release the slot, append a ledger row.
  // Idempotent on generationId.
  async settle(generationId: string, actualCredits: number) { /* ... */ }

  // Credit back the unused portion (on abort), release the slot.
  // Idempotent on generationId.
  async refund(generationId: string, unusedCredits: number) { /* ... */ }

  // Plan-aware slot caps: Free = 1, Pro = 3.
  // Per-user request throttling lives here too.
}
```

Postgres holds the durable `CreditTransaction` ledger; a periodic reconciliation job compares DO state ↔ ledger to catch any drift.

---

*End of revision v1.1.*
