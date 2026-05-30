/**
 * webhooks.ts — Clerk + Midtrans webhooks (PRD §6.9, §12.6, §14).
 *
 * Berjalan TANPA JWT tapi diverifikasi signature. Clerk pakai Svix-style HMAC,
 * Midtrans pakai SHA512 signature_key. Tanpa secret dikonfigurasi (dev/mock),
 * verifikasi di-skip supaya app tetap bisa jalan. Handler menjaga D1 dan
 * CreditMeter tetap sinkron dengan Clerk dan Midtrans.
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

// ---- Clerk: user lifecycle -----------------------------------------------
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
      break;
    case "user.deleted":
      await users.softDelete(clerkUserId);
      break;
    default:
      log.info("webhook.clerk.ignored", { type });
  }
  return c.json({ received: true });
});

// ---- Midtrans: payment notification --------------------------------------
webhooksRoute.post("/midtrans", async (c) => {
  const body = await c.req.json<any>().catch(() => null);
  if (!body) return c.json({ error: "bad_payload" }, 400);

  const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = body;

  // Verifikasi signature Midtrans: SHA512(order_id + status_code + gross_amount + server_key)
  if (!verifyMidtransSignature(order_id, status_code, gross_amount, signature_key)) {
    return c.json({ error: "invalid_signature" }, 401);
  }

  // clerkUserId disimpan di custom_field1 saat buat transaksi
  const clerkUserId: string | undefined = body.custom_field1;
  if (!clerkUserId) return c.json({ received: true });

  const isSuccess =
    (transaction_status === "capture" && fraud_status === "accept") ||
    transaction_status === "settlement";

  if (isSuccess) {
    await applyPlanChange(clerkUserId, "pro", PLAN_LIMITS.pro.monthlyCredits);
    const u = await users.getByClerkId(clerkUserId);
    if (u) {
      await subscriptions.upsert(clerkUserId, {
        userId: u.id,
        stripeSubscriptionId: order_id, // pakai order_id sebagai ref
        plan: "pro",
        status: "active",
        currentPeriodEnd: undefined,
      });
    }
    log.info("midtrans.webhook.pro_activated", { clerkUserId, order_id });
  }

  return c.json({ received: true });
});

// ---- Helpers ----------------------------------------------------------------

function verifyClerk(c: any, raw: string): boolean {
  if (!env.clerkWebhookSecret) {
    log.warn("webhook.clerk.unverified", { reason: "no secret configured" });
    return true; // dev mode
  }
  // Svix signature verification
  const svixId        = c.req.header("svix-id") ?? "";
  const svixTimestamp = c.req.header("svix-timestamp") ?? "";
  const svixSig       = c.req.header("svix-signature") ?? "";
  const toSign = `${svixId}.${svixTimestamp}.${raw}`;
  const secret = env.clerkWebhookSecret.replace(/^whsec_/, "");
  const key = Buffer.from(secret, "base64");
  const expected = createHmac("sha256", key).update(toSign).digest("base64");
  const signatures: string[] = svixSig.split(" ").map((s: string) => s.replace(/^v1,/, ""));
  return signatures.some((sig: string) => {
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return false;
    }
  });
}

function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string,
): boolean {
  if (!env.midtransServerKey) {
    log.warn("midtrans.webhook.unverified", { reason: "no server key" });
    return true; // dev mode
  }
  // Midtrans signature = SHA512(order_id + status_code + gross_amount + server_key)
  // Midtrans menggunakan SHA512 plain hash (bukan HMAC)
  const { createHash } = require("node:crypto");
  const hash: string = createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${env.midtransServerKey}`)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(signatureKey));
  } catch {
    return false;
  }
}

function safeJson(s: string): any | null {
  try { return JSON.parse(s); } catch { return null; }
}
