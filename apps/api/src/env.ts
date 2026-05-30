/**
 * env.ts — Central configuration dan feature flags.
 *
 * "Mock + real-key ready": semua AI model dirutekan lewat OpenRouter dengan
 * satu OPENROUTER_API_KEY. Tanpa key, app jalan dengan mock generator.
 * Billing menggunakan Midtrans (MIDTRANS_SERVER_KEY) atau mock jika tidak ada.
 */

import "dotenv/config";

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

export const env = {
  port: Number(process.env.API_PORT ?? 8787),
  get dataDir(): string {
    return process.env.DATA_DIR ?? new URL("../.data/", import.meta.url).pathname;
  },
  shardCount: Number(process.env.D1_SHARD_COUNT ?? 4),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",

  // ---- AI provider — semua lewat OpenRouter ----
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
  forceMock: bool(process.env.FORCE_MOCK, false),

  // ---- Clerk auth ----
  clerkJwtIssuer:    process.env.CLERK_JWT_ISSUER,
  clerkJwksUrl:      process.env.CLERK_JWKS_URL,
  clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET,
  get authMode(): "clerk" | "dev" {
    return this.clerkJwtIssuer || this.clerkJwksUrl ? "clerk" : "dev";
  },

  // ---- Midtrans billing ----
  midtransServerKey:   process.env.MIDTRANS_SERVER_KEY,
  midtransClientKey:   process.env.MIDTRANS_CLIENT_KEY,
  midtransWebhookSecret: process.env.MIDTRANS_WEBHOOK_SECRET,
  midtransMode:        (process.env.MIDTRANS_MODE ?? "sandbox") as "sandbox" | "production",
  get billingMode(): "midtrans" | "mock" {
    return this.midtransServerKey ? "midtrans" : "mock";
  },
};

/** Kembalikan OpenRouter API key jika tersedia, untuk semua provider. */
export function providerKeyFor(_provider: string): string | undefined {
  return env.openrouterApiKey;
}
