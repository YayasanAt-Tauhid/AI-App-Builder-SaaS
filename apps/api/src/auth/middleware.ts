/**
 * middleware.ts — Authentication (PRD §14).
 *
 * Two modes, chosen automatically:
 *  • "clerk"  — when a Clerk issuer/JWKS is configured, every protected request
 *               must carry a valid Clerk-issued JWT (Authorization: Bearer ...).
 *               We verify the signature against Clerk's JWKS and the issuer.
 *  • "dev"    — when no Clerk config is present, we accept an `x-dev-user`
 *               header (default "dev_user") so the whole app is usable with zero
 *               auth setup. This is the "real-key ready" fallback.
 *
 * In both cases we resolve to a provisioned user (creating + granting credits
 * on first sight), then stash an AuthContext on the Hono context for handlers.
 */

import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Plan } from "@aiab/shared";
import { env } from "../env.js";
import { ensureUser } from "../services/provisioning.js";
import { users } from "../db/repo.js";

export interface AuthContext {
  userId: string;
  clerkUserId: string;
  email: string;
  plan: Plan;
}

// Lazily-created JWKS verifier (only in Clerk mode).
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    const url = env.clerkJwksUrl ?? `${env.clerkJwtIssuer}/.well-known/jwks.json`;
    jwks = createRemoteJWKSet(new URL(url));
  }
  return jwks;
}

/** Hono middleware that authenticates the request and provisions the user. */
export async function authMiddleware(c: Context, next: Next) {
  let clerkUserId: string;
  let email: string;

  if (env.authMode === "clerk") {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return c.json({ error: "missing_token" }, 401);
    try {
      const { payload } = await jwtVerify(token, getJwks(), {
        issuer: env.clerkJwtIssuer,
      });
      clerkUserId = String(payload.sub);
      email = String((payload as any).email ?? `${clerkUserId}@users.noreply`);
    } catch {
      return c.json({ error: "invalid_token" }, 401);
    }
  } else {
    // Dev mode: identify the user by a simple header so multiple dev users work.
    clerkUserId = c.req.header("x-dev-user") ?? "dev_user";
    email = `${clerkUserId}@dev.local`;
  }

  const user = await ensureUser(clerkUserId, email);
  const auth: AuthContext = {
    userId: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    plan: user.plan,
  };
  c.set("auth", auth);
  await next();
}

/** Read the AuthContext set by the middleware (and refresh plan from D1). */
export function getAuth(c: Context): AuthContext {
  const auth = c.get("auth") as AuthContext;
  // Plan may have changed via webhook mid-session; keep it fresh for gating.
  const fresh = users.getByClerkId(auth.clerkUserId);
  if (fresh) auth.plan = fresh.plan;
  return auth;
}
