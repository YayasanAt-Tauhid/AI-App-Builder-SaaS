/**
 * seed.ts — Create the dev user and a couple of starter projects.
 *
 * Lets you `pnpm seed` so the dashboard isn't empty on first run. Uses the same
 * provisioning + generation paths the app uses, so seeded data is identical to
 * real data. Safe to run repeatedly (it no-ops if the dev user already exists).
 */

import { env } from "./env.js";
import { setBackend } from "./adapters/runtime.js";
import { createNodeBackend } from "./adapters/node/backend.js";
import { ensureUser } from "./services/provisioning.js";
import { runGeneration } from "./services/generation.js";
import { users } from "./db/repo.js";

setBackend(createNodeBackend({ dataDir: env.dataDir, shardCount: env.shardCount }));

async function consume(gen: AsyncGenerator<unknown>) {
  // Drain the generation stream to completion (we don't need the SSE events).
  for await (const _ of gen) void _;
}

async function main() {
  const clerkUserId = "dev_user";
  await ensureUser(clerkUserId, "dev@dev.local");
  const user = (await users.getByClerkId(clerkUserId))!;
  const auth = { userId: user.id, clerkUserId, email: user.email, plan: user.plan };

  const seeds = [
    "A todo app with dark mode and local storage",
    "A counter app with increment and reset buttons",
  ];

  for (const prompt of seeds) {
    // eslint-disable-next-line no-console
    console.log(`Seeding: ${prompt}`);
    await consume(runGeneration({ auth, prompt, model: "claude-sonnet", skipDedup: true }));
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete. Dev user:", clerkUserId);
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
