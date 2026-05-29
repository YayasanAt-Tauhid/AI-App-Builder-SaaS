/**
 * env.ts — Central configuration and feature flags.
 *
 * Everything the API needs to know about its environment lives here. The key
 * design goal (per the build decision) is "mock + real-key ready": if a
 * provider/auth/billing key is present we use the real integration; if not we
 * transparently fall back to a deterministic mock so the app still runs.
 */

import "dotenv/config";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export const env = {
  port: Number(process.env.API_PORT ?? 8787),
  // Where local adapter data (D1 shards, R2 blobs) is stored. Lazy: only the
  // Node backend reads this. On Cloudflare the module is evaluated at startup
  // but `import.meta.url` is not a usable base there, so computing it eagerly
  // would throw ("Invalid URL string") during the Worker's validation. A getter
  // defers the `new URL(...)` until something on Node actually needs it.
  get dataDir(): string {
    return process.env.DATA_DIR ?? new URL("../.data/", import.meta.url).pathname;
  },
  // Number of D1 shards (PRD 8.4: initial shard count 4).
  shardCount: Number(process.env.D1_SHARD_COUNT ?? 4),

  // Allowed web origin for CORS (the Next.js client).
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",

  // ---- AI providers (any subset may be set) ----
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  googleApiKey: process.env.GOOGLE_API_KEY,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  // Force the mock generator even if keys exist (useful for demos/tests).
  forceMock: bool(process.env.FORCE_MOCK, false),

  // ---- Clerk auth ----
  clerkJwtIssuer: process.env.CLERK_JWT_ISSUER, // e.g. https://xxx.clerk.accounts.dev
  clerkJwksUrl: process.env.CLERK_JWKS_URL,
  clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET,
  // When no Clerk issuer is configured we run in dev-auth mode (single dev user).
  get authMode(): "clerk" | "dev" {
    return this.clerkJwtIssuer || this.clerkJwksUrl ? "clerk" : "dev";
  },

  // ---- Stripe billing ----
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripePriceProMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  get billingMode(): "stripe" | "mock" {
    return this.stripeSecretKey ? "stripe" : "mock";
  },
};

/** Which real provider is available for a given catalog provider, if any. */
export function providerKeyFor(provider: string): string | undefined {
  switch (provider) {
    case "anthropic":
      return env.anthropicApiKey;
    case "openai":
      return env.openaiApiKey;
    case "google":
      return env.googleApiKey;
    case "deepseek":
      return env.deepseekApiKey;
    default:
      return undefined;
  }
}
