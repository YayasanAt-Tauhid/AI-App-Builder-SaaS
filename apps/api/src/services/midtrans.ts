/**
 * midtrans.ts — Midtrans payment integration dengan mock fallback (PRD §13).
 *
 * Dengan MIDTRANS_SERVER_KEY kita hit Midtrans Snap API untuk membuat
 * transaksi Pro upgrade. Tanpa key, return mock-upgrade URL supaya flow
 * upgrade tetap bisa demo tanpa credentials.
 *
 * Midtrans Snap: https://docs.midtrans.com/docs/snap-overview
 */

import type { AuthContext } from "../auth/middleware.js";
import { env } from "../env.js";
import { log } from "../util/logger.js";

const SNAP_URL = {
  sandbox: "https://app.sandbox.midtrans.com/snap/v1/transactions",
  production: "https://app.midtrans.com/snap/v1/transactions",
};

const WEB = () => env.webOrigin;

/** Buat Midtrans Snap token untuk upgrade ke Pro. */
export async function createCheckoutSession(auth: AuthContext): Promise<string> {
  if (env.billingMode === "mock" || !env.midtransServerKey) {
    return `${WEB()}/billing/mock-checkout`;
  }

  const orderId = `pro-${auth.userId}-${Date.now()}`;
  const basicAuth = Buffer.from(`${env.midtransServerKey}:`).toString("base64");

  const body = {
    transaction_details: {
      order_id: orderId,
      gross_amount: 300000, // IDR 300.000/bulan — sesuaikan
    },
    item_details: [
      {
        id: "pro-monthly",
        price: 300000,
        quantity: 1,
        name: "AI App Builder Pro — 1 Bulan",
      },
    ],
    customer_details: {
      email: auth.email,
    },
    callbacks: {
      finish: `${WEB()}/dashboard?upgraded=1`,
      error: `${WEB()}/billing?error=midtrans`,
      pending: `${WEB()}/billing?pending=1`,
    },
    custom_field1: auth.clerkUserId, // simpan untuk webhook
    custom_field2: auth.userId,
  };

  try {
    const res = await fetch(SNAP_URL[env.midtransMode], {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log.error("midtrans.snap_failed", { status: res.status, err });
      return `${WEB()}/billing?error=midtrans`;
    }

    const data = (await res.json()) as { redirect_url?: string; token?: string };
    // redirect_url langsung ke halaman Snap Midtrans
    return data.redirect_url ?? `${WEB()}/billing?error=no_url`;
  } catch (e) {
    log.error("midtrans.snap_error", { e });
    return `${WEB()}/billing?error=midtrans`;
  }
}

export async function createPortalSession(_auth: AuthContext): Promise<string> {
  // Midtrans tidak punya portal subscription seperti Stripe.
  // Arahkan ke halaman billing internal untuk manage subscription.
  return `${WEB()}/billing`;
}

/**
 * Verifikasi notification dari Midtrans payment gateway.
 * Midtrans mengirim POST ke /api/webhooks/midtrans dengan signature_key.
 */
export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string,
): boolean {
  if (!env.midtransServerKey) return true; // dev mode
  // Midtrans signature = SHA512(order_id + status_code + gross_amount + server_key)
  const crypto = require("node:crypto");
  const expected = crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${env.midtransServerKey}`)
    .digest("hex");
  return expected === signatureKey;
}
