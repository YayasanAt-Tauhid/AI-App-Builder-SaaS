/**
 * queue.ts — Local stand-in for Cloudflare Queues (PRD §7.2, §6.8).
 *
 * Non-critical work (thumbnail render, zip pre-build) is done off the request
 * path so generation returns the versionId immediately. Cloudflare Queues do
 * this in production; locally we model it with a simple in-process async queue
 * processed on the next tick. The contract (enqueue a typed job) is identical,
 * so swapping in a real Queue binding is a one-function change.
 */

import { buildZip } from "./export.js";
import { r2, r2keys } from "../adapters/r2.js";
import { log } from "../util/logger.js";

export type QueueJob =
  | { type: "thumbnail"; projectId: string; versionId: string }
  | { type: "zip-prebuild"; projectId: string; versionId: string; shardKey: string };

const queue: QueueJob[] = [];
let draining = false;

/** Enqueue a background job (fire-and-forget). */
export function enqueue(job: QueueJob): void {
  queue.push(job);
  if (!draining) {
    draining = true;
    // Defer to the next tick so the request path is never blocked.
    setTimeout(drain, 0);
  }
}

async function drain(): Promise<void> {
  try {
    while (queue.length) {
      const job = queue.shift()!;
      try {
        await handle(job);
      } catch (err) {
        log.error("queue.job_failed", { type: job.type, error: String(err) });
      }
    }
  } finally {
    draining = false;
  }
}

async function handle(job: QueueJob): Promise<void> {
  switch (job.type) {
    case "thumbnail": {
      // A real worker would render the preview to a PNG. We write a tiny SVG
      // placeholder so the thumbnail key exists and the dashboard has an image.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
<rect width="100%" height="100%" fill="#0b0f17"/>
<text x="50%" y="50%" fill="#6d5efc" font-family="sans-serif" font-size="20"
 text-anchor="middle" dominant-baseline="middle">AI App</text></svg>`;
      r2.putText(r2keys.thumbnail(job.projectId, job.versionId).replace(/\.png$/, ".svg"), svg);
      log.info("queue.thumbnail.done", { projectId: job.projectId, versionId: job.versionId });
      break;
    }
    case "zip-prebuild": {
      // Pre-build the export zip so POST /export can return instantly (cached).
      const zip = await buildZip(job.shardKey, job.projectId, job.versionId);
      if (zip) {
        r2.putBytes(r2keys.exportZip(job.projectId, job.versionId), zip);
        log.info("queue.zip.done", { projectId: job.projectId, versionId: job.versionId });
      }
      break;
    }
  }
}
