/**
 * queue.ts — Background jobs (PRD §7.2, §6.8): thumbnail render + zip pre-build.
 *
 * Non-critical work runs off the request path so generation returns the
 * versionId immediately. `enqueue` hands the job to the active backend: locally
 * that's an in-process queue drained on the next tick; on Cloudflare it's a
 * Queue binding, whose consumer (worker.ts) calls `processQueueJob` for each
 * message. The job contract is identical on both runtimes.
 */

import { buildZip } from "./export.js";
import { r2, r2keys } from "../adapters/r2.js";
import { getBackend } from "../adapters/runtime.js";
import { log } from "../util/logger.js";

export type QueueJob =
  | { type: "thumbnail"; projectId: string; versionId: string }
  | { type: "zip-prebuild"; projectId: string; versionId: string; shardKey: string };

/** Enqueue a background job (fire-and-forget) via the active backend. */
export function enqueue(job: QueueJob): void {
  void getBackend().dispatchJob(job);
}

/** Run a single job. Called by the local drainer and the CF queue consumer. */
export async function processQueueJob(job: QueueJob): Promise<void> {
  switch (job.type) {
    case "thumbnail": {
      // A real worker would render the preview to a PNG. We write a tiny SVG
      // placeholder so the thumbnail key exists and the dashboard has an image.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
<rect width="100%" height="100%" fill="#0b0f17"/>
<text x="50%" y="50%" fill="#6d5efc" font-family="sans-serif" font-size="20"
 text-anchor="middle" dominant-baseline="middle">AI App</text></svg>`;
      await r2.putText(r2keys.thumbnail(job.projectId, job.versionId).replace(/\.png$/, ".svg"), svg);
      log.info("queue.thumbnail.done", { projectId: job.projectId, versionId: job.versionId });
      break;
    }
    case "zip-prebuild": {
      // Pre-build the export zip so POST /export can return instantly (cached).
      const zip = await buildZip(job.shardKey, job.projectId, job.versionId);
      if (zip) {
        await r2.putBytes(r2keys.exportZip(job.projectId, job.versionId), zip);
        log.info("queue.zip.done", { projectId: job.projectId, versionId: job.versionId });
      }
      break;
    }
  }
}
