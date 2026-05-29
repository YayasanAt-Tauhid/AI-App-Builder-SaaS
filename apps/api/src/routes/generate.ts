/**
 * generate.ts — POST /api/generate (SSE) + POST /api/generate/abort (PRD §6.1, §6.5, §12.1).
 *
 * Streams a generation as Server-Sent Events. We pipe each event from the
 * orchestration generator straight to the client, plus a keep-alive ping every
 * ~20s (PRD §6.5) so proxies don't drop the long-lived connection. If the
 * client disconnects, we abort the in-flight generation and refund.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { GenerateRequest } from "@aiab/shared";
import type { AuthContext } from "../auth/middleware.js";
import { getAuth } from "../auth/middleware.js";
import { abortGeneration, runGeneration } from "../services/generation.js";

export const generateRoute = new Hono<{ Variables: { auth: AuthContext } }>();

generateRoute.post("/", async (c) => {
  const auth = getAuth(c);
  const body = (await c.req.json().catch(() => ({}))) as GenerateRequest;

  if (!body.prompt || !body.model) {
    return c.json({ error: "prompt and model are required" }, 400);
  }

  const skipDedup = c.req.header("x-skip-dedup") === "true";

  return streamSSE(c, async (stream) => {
    let generationId: string | null = null;
    let finished = false;

    // Keep-alive ping every 20s so intermediaries keep the SSE open (PRD §6.5).
    const ping = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "1" }).catch(() => {});
    }, 20_000);

    // If the client disconnects, abort the generation and refund.
    stream.onAbort(() => {
      if (generationId && !finished) void abortGeneration(generationId);
    });

    try {
      for await (const ev of runGeneration({
        auth,
        projectId: body.projectId,
        prompt: body.prompt,
        model: body.model,
        contextFiles: body.context?.files,
        skipDedup,
      })) {
        if (ev.event === "start") generationId = ev.data.generationId;
        if (ev.event === "done" || ev.event === "error") finished = true;
        await stream.writeSSE({ event: ev.event, data: JSON.stringify(ev.data) });
      }
    } finally {
      clearInterval(ping);
    }
  });
});

generateRoute.post("/abort", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { generationId?: string };
  if (!body.generationId) return c.json({ error: "generationId required" }, 400);
  const refundedCredits = await abortGeneration(body.generationId);
  return c.json({ aborted: true, refundedCredits });
});
