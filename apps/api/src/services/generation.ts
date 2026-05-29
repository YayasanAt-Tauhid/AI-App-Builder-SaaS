/**
 * generation.ts — The generation orchestration (PRD §6.1, §7.3, §10.3, §13.3).
 *
 * This is the heart of the product and follows the PRD's generation sequence:
 *   1. Validate the model + plan gating.
 *   2. Check the KV prompt-dedup cache (skip a redundant generation, no debit).
 *   3. Reserve credits + claim a concurrency slot on the CreditMeter (strong
 *      consistency). Bail with 402/409 if it refuses.
 *   4. Open the provider stream, piping token deltas out as SSE and emitting
 *      `file` events as <file> blocks open/close.
 *   5. On completion: parse files, enforce plan caps, write blobs + manifest to
 *      R2, insert the Version row in the user's D1 shard, settle actual credits,
 *      save the dedup entry, and invalidate the project-list edge cache.
 *   6. On abort: refund the reservation and release the slot.
 *
 * It's an async generator of SSEEvent so the route can stream it directly while
 * also injecting keep-alive pings.
 */

import {
  contentHash,
  estimateCredits,
  getModel,
  manifestPlanCheck,
  PLAN_LIMITS,
  planCanUseModel,
  tokensToCredits,
} from "@aiab/shared";
import type { ProjectFile, SSEEvent, VersionManifest } from "@aiab/shared";
import type { AuthContext } from "../auth/middleware.js";
import { getCreditMeter } from "../adapters/credit-meter.js";
import { kv, kvKeys } from "../adapters/kv.js";
import { r2, r2keys } from "../adapters/r2.js";
import { edgeCache, cacheKeys } from "../adapters/edge-cache.js";
import { projects, versions } from "../db/repo.js";
import { getProvider } from "../ai/provider.js";
import { buildUserMessage, SYSTEM_PROMPT } from "../ai/system-prompt.js";
import { manifestBytes, parseManifest, StreamingFileDetector } from "../ai/parser.js";
import { enqueue } from "./queue.js";
import { uuid } from "../util/id.js";
import { analytics, log } from "../util/logger.js";

export interface GenerationParams {
  auth: AuthContext;
  projectId?: string;
  prompt: string;
  model: string;
  contextFiles?: ProjectFile[];
  skipDedup: boolean;
}

/** Tracks in-flight generations so the abort endpoint can cancel + refund. */
interface InFlight {
  clerkUserId: string;
  controller: AbortController;
}
const inFlight = new Map<string, InFlight>();

/** Cancel a running generation. Returns refunded credits (0 if unknown). */
export async function abortGeneration(generationId: string): Promise<number> {
  const entry = inFlight.get(generationId);
  if (!entry) return 0;
  entry.controller.abort();
  const { refunded } = await getCreditMeter(entry.clerkUserId).refund(generationId);
  inFlight.delete(generationId);
  analytics.track("generation_aborted", { generationId });
  return refunded;
}

function deriveProjectName(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  return cleaned.length > 48 ? cleaned.slice(0, 45) + "…" : cleaned || "Untitled Project";
}

export async function* runGeneration(params: GenerationParams): AsyncGenerator<SSEEvent> {
  const { auth, prompt, model: modelId, contextFiles, skipDedup } = params;
  const shardKey = auth.clerkUserId;
  const startedAt = Date.now();

  // --- 1. Validate model + plan gating -----------------------------------
  const model = getModel(modelId);
  if (!model) {
    yield { event: "error", data: { code: "unknown_model", message: `Unknown model: ${modelId}` } };
    return;
  }
  if (!planCanUseModel(auth.plan, model)) {
    yield {
      event: "error",
      data: { code: "model_not_allowed", message: `${model.name} requires the Pro plan.` },
    };
    return;
  }

  analytics.track("generation_started", { userId: auth.userId, model: modelId });

  // --- 2. Prompt dedup cache (PRD §10.3) ----------------------------------
  const hash = contentHash(prompt, modelId, contextFiles ?? []);
  if (!skipDedup) {
    const cached = kv.get(kvKeys.dedup(auth.userId, hash));
    if (cached) {
      const { versionId, projectId } = JSON.parse(cached);
      analytics.track("dedup_hit", { userId: auth.userId });
      log.info("generation.dedup_hit", { userId: auth.userId, versionId });
      yield {
        event: "done",
        data: { projectId, versionId, generationId: "dedup", creditsCost: 0, fromCache: true },
      };
      return;
    }
  }

  // --- 3. Reserve credits + concurrency slot (CreditMeter DO) -------------
  const generationId = uuid();
  const meter = getCreditMeter(shardKey);
  const est = estimateCredits(
    modelId,
    prompt.length,
    (contextFiles ?? []).reduce((n, f) => n + f.content.length, 0)
  );
  const reservation = await meter.reserve(generationId, est);
  if (!reservation.ok) {
    yield { event: "error", data: { code: reservation.code, message: reservation.message } };
    return;
  }

  const controller = new AbortController();
  inFlight.set(generationId, { clerkUserId: shardKey, controller });

  // Hand the client the generationId so it can abort this stream if needed.
  yield { event: "start", data: { generationId } };

  let fullText = "";
  let usage = { inputTokens: 0, outputTokens: 0, providerCacheHit: false, engine: "mock" as string };
  const detector = new StreamingFileDetector();

  try {
    // --- 4. Stream from the provider -------------------------------------
    const { provider, engine } = getProvider(modelId);
    const system = SYSTEM_PROMPT;
    const userMessage = buildUserMessage(prompt, contextFiles);
    const maxOutputTokens = 8192;

    const gen = provider.stream({ modelId, system, userMessage, signal: controller.signal, maxOutputTokens });
    const it = gen[Symbol.asyncIterator]();
    while (true) {
      const { value, done } = await it.next();
      if (done) {
        usage = value;
        break;
      }
      fullText += value;
      yield { event: "token", data: { delta: value } };
      // Emit file start/complete events as <file> blocks appear in the stream.
      const { started, completed } = detector.push(fullText);
      for (const path of started) yield { event: "file", data: { path, status: "start" } };
      for (const path of completed) yield { event: "file", data: { path, status: "complete" } };
    }

    if (controller.signal.aborted) {
      yield { event: "error", data: { code: "aborted", message: "Generation aborted by user." } };
      return;
    }

    // --- 5a. Parse + enforce plan caps -----------------------------------
    const versionId = uuid();
    const manifest: VersionManifest = parseManifest(versionId, fullText);
    const limits = PLAN_LIMITS[auth.plan];
    const capError = manifestPlanCheck(manifest.files.length, manifestBytes(manifest.files), limits);
    if (capError) {
      await meter.refund(generationId);
      yield { event: "error", data: { code: "plan_limit", message: capError } };
      return;
    }

    // --- 5b. Resolve or create the project -------------------------------
    let projectId = params.projectId;
    let parentVersionId: string | null = null;
    if (projectId) {
      const project = projects.get(shardKey, projectId);
      if (!project || project.userId !== auth.userId) {
        await meter.refund(generationId);
        yield { event: "error", data: { code: "not_found", message: "Project not found." } };
        return;
      }
      parentVersionId = project.currentVersionId;
    } else {
      const project = projects.create(shardKey, {
        userId: auth.userId,
        name: deriveProjectName(prompt),
        defaultModel: modelId,
      });
      projectId = project.id;
      analytics.track("project_created", { userId: auth.userId, projectId });
    }

    // --- 5c. Write blobs + manifest to R2 (key layout per PRD §11.3) ------
    const manifestKey = r2keys.manifest(projectId, versionId);
    for (const file of manifest.files) {
      r2.putText(r2keys.file(projectId, versionId, file.path), file.content);
    }
    r2.putText(manifestKey, JSON.stringify(manifest));

    // --- 5d. Settle actual credits --------------------------------------
    const actualCredits = tokensToCredits(modelId, usage.inputTokens, usage.outputTokens);
    const settled = await meter.settle(generationId, actualCredits, versionId);

    // --- 5e. Insert the Version row + advance current version ------------
    versions.create(shardKey, {
      id: versionId,
      projectId,
      parentVersionId,
      prompt,
      modelUsed: modelId,
      fileManifestKey: manifestKey,
      contentHash: hash,
      creditsCost: settled.debited,
    });
    projects.update(shardKey, projectId, { currentVersionId: versionId, defaultModel: modelId });

    // --- 5f. Save dedup entry + invalidate caches (PRD §10.3, §10.5) -----
    kv.put(
      kvKeys.dedup(auth.userId, hash),
      JSON.stringify({ versionId, projectId, ts: Date.now() }),
      120 // 2 minutes
    );
    edgeCache.invalidatePrefix(cacheKeys.projectListPrefix(auth.userId));

    // --- 5g. Async post-processing off the request path (Queues) ---------
    enqueue({ type: "thumbnail", projectId, versionId });
    enqueue({ type: "zip-prebuild", projectId, versionId, shardKey });

    analytics.track("generation_completed", {
      userId: auth.userId,
      projectId,
      versionId,
      model: modelId,
      engine,
      credits: settled.debited,
      providerCacheHit: usage.providerCacheHit,
      latencyMs: Date.now() - startedAt,
    });

    yield {
      event: "done",
      data: {
        projectId,
        versionId,
        generationId,
        creditsCost: settled.debited,
        fromCache: false,
      },
    };
  } catch (err) {
    // Provider/network failure: release the reservation so the user isn't charged.
    await meter.refund(generationId);
    const message = err instanceof Error ? err.message : "Generation failed.";
    log.error("generation.failed", { userId: auth.userId, generationId, message });
    yield { event: "error", data: { code: "generation_failed", message } };
  } finally {
    inFlight.delete(generationId);
  }
}
