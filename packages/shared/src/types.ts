/**
 * types.ts — Shared TypeScript types for the whole platform.
 *
 * These mirror the Data Model in the PRD (Section 11) and the API
 * Specification (Section 12). Keeping them in one shared package means the
 * Hono API and the Next.js client can never drift out of sync about the
 * shape of a Project, Version, credit transaction, or SSE event.
 */

/** A user's billing plan. Drives model access, credits, and concurrency. */
export type Plan = "free" | "pro";

/** Lifecycle status of a project. Soft-deleted projects are recoverable. */
export type ProjectStatus = "active" | "deleted";

/** Reasons a credit transaction is written to the ledger. */
export type CreditReason =
  | "signup_grant"
  | "generation"
  | "refund"
  | "purchase"
  | "plan_refill"
  | "adjustment";

/** A platform user. Source of truth lives in the user's D1 shard. */
export interface User {
  id: string;
  clerkUserId: string;
  email: string;
  plan: Plan;
  creditsBalance: number;
  createdAt: string;
  updatedAt: string;
}

/** A project — a container for an evolving generated app and its versions. */
export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  currentVersionId: string | null;
  defaultModel: string;
  thumbnailUrl: string | null;
  status: ProjectStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A single file inside a generated project. */
export interface ProjectFile {
  /** Path relative to project root, e.g. "src/App.tsx". */
  path: string;
  /** Full text contents of the file. */
  content: string;
}

/** JSON manifest stored in R2 indexing all files of a version. */
export interface VersionManifest {
  versionId: string;
  files: ProjectFile[];
  /** The Sandpack template this project should preview with. */
  template: SandpackTemplate;
  /** Entry file shown by default in the editor. */
  entry: string;
}

/** Sandpack templates we support for live preview. */
export type SandpackTemplate = "react" | "react-ts" | "vanilla" | "static";

/** An immutable snapshot of a project's files at a point in time. */
export interface Version {
  id: string;
  projectId: string;
  parentVersionId: string | null;
  prompt: string;
  modelUsed: string;
  /** R2 key of the JSON manifest for this version. */
  fileManifestKey: string;
  /** hash(prompt + model + files) used for dedup. */
  contentHash: string;
  creditsCost: number;
  createdAt: string;
}

/** A row in the durable credit ledger (D1). */
export interface CreditTransaction {
  id: string;
  userId: string;
  /** negative = debit, positive = credit/refill. */
  delta: number;
  reason: CreditReason;
  refVersionId: string | null;
  createdAt: string;
}

/** Metadata describing an available AI model in the catalog. */
export interface ModelInfo {
  id: string;
  name: string;
  provider: "anthropic" | "openai" | "google" | "deepseek";
  tier: Plan | "free+pro";
  isDefault: boolean;
  strength: string;
  relativeCost: "low" | "medium" | "medium-high" | "high";
  /** Credits charged per 1K tokens (input+output blended), for estimation. */
  creditsPer1kTokens: number;
}

// ---------------------------------------------------------------------------
// API request / response shapes (Section 12)
// ---------------------------------------------------------------------------

export interface GenerateRequest {
  projectId?: string;
  prompt: string;
  model: string;
  context?: { files?: ProjectFile[] };
}

export interface AbortRequest {
  generationId: string;
}

/** Server-Sent Event payloads (PRD Appendix 21.3, plus a `start` handshake). */
export type SSEEvent =
  // `start` is an extension to the PRD schema: it hands the client the
  // generationId up-front so it can call /generate/abort mid-stream.
  | { event: "start"; data: { generationId: string } }
  | { event: "token"; data: { delta: string } }
  | { event: "file"; data: { path: string; status: "start" | "complete" } }
  | { event: "error"; data: { code: string; message: string } }
  | {
      event: "done";
      data: {
        projectId: string;
        versionId: string;
        generationId: string;
        creditsCost: number;
        fromCache: boolean;
      };
    };

export interface CreditsResponse {
  balance: number;
  plan: Plan;
  recent: CreditTransaction[];
}

export interface PlanResponse {
  plan: Plan;
  limits: PlanLimits;
}

/** Per-plan guardrails (PRD Section 13 + Open Question 5). */
export interface PlanLimits {
  monthlyCredits: number;
  concurrency: number;
  maxFiles: number;
  maxBytes: number;
  models: "all" | "free-tier";
  watermark: boolean;
}

export interface DiffFile {
  path: string;
  status: "added" | "removed" | "modified" | "unchanged";
  /** Unified-style line hunks for the line-level diff viewer. */
  lines: DiffLine[];
}

export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
}
