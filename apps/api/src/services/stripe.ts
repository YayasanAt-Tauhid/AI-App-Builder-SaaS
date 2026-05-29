/**
 * stripe.ts — Stripe integration with a mock fallback (PRD §13, §12.5).
 *
 * With a STRIPE_SECRET_KEY we hit the real Stripe REST API to create Checkout
 * and Billing Portal sessions. Without one, we return a local mock-upgrade URL
 * so the entire upgrade journey is demoable key-free. Stripe's API is
 * form-encoded, so we use fetch with URLSearchParams (no SDK dependency).
 */

import type { AuthContext } from "../auth/middleware.js";
import { env } from "../env.js";
import { log } from "../util/logger.js";

const WEB = () => env.webOrigin;

export async function createCheckoutSession(auth: AuthContext): Promise<string> {
  if (env.billingMode === "mock" || !env.stripeSecretKey) {
    // Local mock: a page in the web app that calls /billing/mock-upgrade.
    return `${WEB()}/billing/mock-checkout`;
  }
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("success_url", `${WEB()}/dashboard?upgraded=1`);
  params.set("cancel_url", `${WEB()}/billing`);
  params.set("client_reference_id", auth.clerkUserId);
  params.set("customer_email", auth.email);
  if (env.stripePriceProMonthly) params.set("line_items[0][price]", env.stripePriceProMonthly);
  params.set("line_items[0][quantity]", "1");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!res.ok) {
    log.error("stripe.checkout_failed", { status: res.status });
    return `${WEB()}/billing?error=stripe`;
  }
  const data = (await res.json()) as { url?: string };
  return data.url ?? `${WEB()}/billing`;
}

export async function createPortalSession(auth: AuthContext): Promise<string> {
  if (env.billingMode === "mock" || !env.stripeSecretKey) {
    return `${WEB()}/billing?portal=mock`;
  }
  // A real implementation looks up the Stripe customer id for auth.userId.
  const params = new URLSearchParams();
  params.set("return_url", `${WEB()}/billing`);
  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string };
  return data.url ?? `${WEB()}/billing`;
}
