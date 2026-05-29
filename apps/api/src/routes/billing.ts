/**
 * billing.ts — Credits + billing endpoints (PRD §6.10, §12.5, §13).
 *
 *  GET  /api/credits         → live balance (from the CreditMeter) + ledger
 *  GET  /api/billing/plan    → current plan + its limits
 *  POST /api/billing/checkout→ Stripe Checkout session (mock URL if no key)
 *  POST /api/billing/portal  → Stripe customer portal (mock URL if no key)
 *
 * "Mock + real-key ready": with a STRIPE_SECRET_KEY we create real sessions;
 * without one we return a local mock-upgrade URL so the upgrade flow is fully
 * demoable. The mock-upgrade handler simulates the Stripe webhook outcome.
 */

import { Hono } from "hono";
import { PLAN_LIMITS } from "@aiab/shared";
import type { AuthContext } from "../auth/middleware.js";
import { getAuth } from "../auth/middleware.js";
import { transactions } from "../db/repo.js";
import { getCreditMeter } from "../adapters/credit-meter.js";
import { applyPlanChange } from "../services/provisioning.js";
import { env } from "../env.js";
import { analytics } from "../util/logger.js";
import { createCheckoutSession, createPortalSession } from "../services/stripe.js";

export const billingRoute = new Hono<{ Variables: { auth: AuthContext } }>();

// GET /api/credits — balance + recent transactions.
billingRoute.get("/credits", (c) => {
  const auth = getAuth(c);
  const meter = getCreditMeter(auth.clerkUserId);
  return c.json({
    balance: meter.getBalance(),
    plan: meter.getPlan(),
    recent: transactions.recent(auth.clerkUserId, auth.userId, 20),
  });
});

// GET /api/billing/plan — current plan + limits.
billingRoute.get("/billing/plan", (c) => {
  const auth = getAuth(c);
  return c.json({ plan: auth.plan, limits: PLAN_LIMITS[auth.plan] });
});

// POST /api/billing/checkout — start an upgrade.
billingRoute.post("/billing/checkout", async (c) => {
  const auth = getAuth(c);
  analytics.track("upgrade_clicked", { userId: auth.userId });
  const url = await createCheckoutSession(auth);
  return c.json({ url, mode: env.billingMode });
});

// POST /api/billing/portal — manage subscription.
billingRoute.post("/billing/portal", async (c) => {
  const auth = getAuth(c);
  const url = await createPortalSession(auth);
  return c.json({ url, mode: env.billingMode });
});

// POST /api/billing/mock-upgrade — only active in mock mode; simulates the
// Stripe webhook result so the Pro upgrade can be demoed without a Stripe key.
billingRoute.post("/billing/mock-upgrade", async (c) => {
  if (env.billingMode !== "mock") return c.json({ error: "not_available" }, 404);
  const auth = getAuth(c);
  await applyPlanChange(auth.clerkUserId, "pro", PLAN_LIMITS.pro.monthlyCredits);
  return c.json({ ok: true, plan: "pro" });
});
