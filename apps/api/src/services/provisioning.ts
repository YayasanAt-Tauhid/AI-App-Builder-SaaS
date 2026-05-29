/**
 * provisioning.ts — User lifecycle (PRD §5.1, §13.3, §14).
 *
 * Creating a user is more than an INSERT: new users must receive their free
 * credit grant, recorded both in the live CreditMeter and the durable D1
 * ledger. This is normally driven by the Clerk `user.created` webhook, but we
 * also provision on first authenticated request so the app works in dev-auth
 * mode and is resilient to a missed webhook.
 */

import { SIGNUP_GRANT_CREDITS } from "@aiab/shared";
import type { Plan, User } from "@aiab/shared";
import { users } from "../db/repo.js";
import { getCreditMeter } from "../adapters/credit-meter.js";
import { analytics } from "../util/logger.js";

/** Get the user for a Clerk id, creating + granting credits if they're new. */
export async function ensureUser(clerkUserId: string, email: string): Promise<User> {
  const existing = await users.getByClerkId(clerkUserId);
  if (existing) return existing;

  const user = await users.create({ clerkUserId, email, plan: "free", credits: 0 });
  // Grant free credits through the meter so the ledger + live balance agree.
  const meter = await getCreditMeter(clerkUserId);
  await meter.grant(SIGNUP_GRANT_CREDITS, "signup_grant");
  analytics.track("signup_completed", { userId: user.id });
  // Re-read so the returned balance reflects the grant.
  return (await users.getByClerkId(clerkUserId)) ?? user;
}

/** Apply a plan change (Stripe/Clerk webhook). Refills credits on upgrade. */
export async function applyPlanChange(clerkUserId: string, plan: Plan, refillCredits?: number): Promise<void> {
  const user = await users.getByClerkId(clerkUserId);
  if (!user) return;
  await users.setPlan(clerkUserId, plan);
  const meter = await getCreditMeter(clerkUserId);
  await meter.setPlan(plan); // keep the live meter's plan in sync (concurrency slots)
  if (refillCredits && refillCredits > 0) {
    await meter.grant(refillCredits, "plan_refill");
  }
  analytics.track("plan_upgraded", { userId: user.id, plan });
}
