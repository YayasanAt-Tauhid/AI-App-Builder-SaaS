/**
 * webhooks.ts — Clerk + Stripe webhooks (PRD §6.9, §12.6, §14).
 *
 * These run WITHOUT a JWT but ARE signature-verified (PRD §16): Clerk uses
 * Svix-style HMAC headers, Stripe uses its own HMAC scheme. When the relevant
 * signing secret isn't configured (dev/mock), we skip verification so the app
 * still works, but we log it. Handlers keep the local D1 user/subscription
 * records and the CreditMeter in sync with the identity/billing providers.
 */

import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PLAN_LIMITS } from "@aiab/shared";
import { env } from "../env.js";
import { users } from "../db/repo.js";
import { ensureUser, applyPlanChange } from "../services/provisioning.js";
import { subscriptions } from "../db/repo.js";
import { log } from "../util/logger.js";

export const webhooksRoute = new Hono();

// ---- Clerk: user lifecycle ----------------------------------------------
webhooksRoute.post("/clerk", async (c) => {
  const raw = await c.req.text();
  if (!verifyClerk(c, raw)) return c.json({ error: "invalid_signature" }, 401);

  const evt = safeJson(raw);
  if (!evt) return c.json({ error: "bad_payload" }, 400);
  const type: string = evt.type;
  const data = evt.data ?? {};
  const clerkUserId: string = data.id;
  const email: string =
    data.email_addresses?.[0]?.email_address ?? `${clerkUserId}@users.noreply`;

  switch (type) {
    case "user.created":
      await ensureUser(clerkUserId, email);
      break;
    case "user.updated":
      // Profile sync — nothing security-relevant to change locally for now.
      break;
    case "user.deleted":
      users.softDelete(clerkUserId);
      break;
    default:
      log.info("webhook.clerk.ignored", { type });
  }
  return c.json({ received: true });
});

// ---- Stripe: subscription + payment events ------------------------------
webhooksRoute.post("/stripe", async (c) => {
  const raw = await c.req.text();
  if (!verifyStripe(c, raw)) return c.json({ error: "invalid_signature" }, 401);

  const evt = safeJson(raw);
  if (!evt) return c.json({ error: "bad_payload" }, 400);
  const obj = evt.data?.object ?? {};
  const clerkUserId: string | undefined = obj.client_reference_id ?? obj.metadata?.clerkUserId;

  switch (evt.type) {
    case "checkout.session.completed":
    case "customer.subscription.updated":
    case "invoice.paid": {
      if (clerkUserId && users.getByClerkId(clerkUserId)) {
        await applyPlanChange(clerkUserId, "pro", PLAN_LIMITS.pro.monthlyCredits);
        const u = users.getByClerkId(clerkUserId)!;
        subscriptions.upsert(clerkUserId, {
          userId: u.id,
          stripeSubscriptionId: obj.subscription ?? obj.id,
          plan: "pro",
          status: "active",
          currentPeriodEnd: obj.current_period_end
            ? new Date(obj.current_period_end * 1000).toISOString()
            : undefined,
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      if (clerkUserId && users.getByClerkId(clerkUserId)) {
        await applyPlanChange(clerkUserId, "free");
      }
      break;
    }
    default:
      log.info("webhook.stripe.ignored", { type: evt.type });
  }
  return c.json({ received: true });
});

// ---- Signature verification helpers -------------------------------------

function verifyClerk(c: any, raw: string): boolean {
  if (!env.clerkWebhookSecret) {
    log.warn("webhook.clerk.unverified", { reason: "no secret configured" });
    return true; // dev/mock: accept
  }
  const id = c.req.header("svix-id");
  const ts = c.req.header("svix-timestamp");
  const sigHeader = c.req.header("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  const secret = Buffer.from(env.clerkWebhookSecret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", secret).update(`${id}.${ts}.${raw}`).digest("base64");
  // The header may contain multiple space-separated "v1,<sig>" pairs.
  return sigHeader
    .split(" ")
    .map((p: string) => p.split(",")[1])
    .some((sig: string) => safeEqual(sig, expected));
}

function verifyStripe(c: any, raw: string): boolean {
  if (!env.stripeWebhookSecret) {
    log.warn("webhook.stripe.unverified", { reason: "no secret configured" });
    return true; // dev/mock: accept
  }
  const header = c.req.header("stripe-signature") ?? "";
  const parts = Object.fromEntries(header.split(",").map((kv: string) => kv.split("=")));
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac("sha256", env.stripeWebhookSecret)
    .update(`${parts.t}.${raw}`)
    .digest("hex");
  return safeEqual(parts.v1, expected);
}

function safeEqual(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function safeJson(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
