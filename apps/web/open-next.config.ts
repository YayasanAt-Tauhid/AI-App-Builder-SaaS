// open-next.config.ts — Adapts the Next.js build to run on Cloudflare Workers.
// Defaults are fine for this app (no R2 incremental cache configured yet); the
// API/data lives in the separate aiab-api Worker, so the web app only needs to
// serve SSR/RSC + static assets.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
