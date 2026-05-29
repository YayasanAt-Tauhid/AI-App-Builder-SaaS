/**
 * auth.ts — Client auth handle (PRD §14).
 *
 * Two modes, chosen by whether a Clerk publishable key is configured:
 *
 * - **Clerk mode** (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY set): every request carries
 *   `Authorization: Bearer <jwt>`. The token comes from Clerk's `getToken()`,
 *   which is async, so a small client bridge (ClerkTokenBridge) registers a
 *   getter here once the Clerk session is available.
 * - **Dev mode** (no key): the app works with zero auth setup by keeping a stable
 *   per-browser dev user id in localStorage and sending it as `x-dev-user`.
 *
 * The API already verifies real Clerk tokens *and* honours the dev header, so
 * no backend change is needed to switch between the two.
 */

const DEV_USER_KEY = "aiab_dev_user";

/** True when a Clerk publishable key is configured (build-time, public env). */
export function isClerkEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

/** Registered by ClerkTokenBridge so non-React modules can fetch a fresh JWT. */
let clerkTokenGetter: (() => Promise<string | null>) | null = null;
export function setClerkTokenGetter(getter: (() => Promise<string | null>) | null): void {
  clerkTokenGetter = getter;
}

/** Get (or lazily create) this browser's dev user id. */
export function getDevUser(): string {
  if (typeof window === "undefined") return "dev_user";
  let id = window.localStorage.getItem(DEV_USER_KEY);
  if (!id) {
    id = "dev_" + Math.random().toString(36).slice(2, 8);
    window.localStorage.setItem(DEV_USER_KEY, id);
  }
  return id;
}

/**
 * Headers to attach to every API request to identify the user. Async because
 * Clerk's token retrieval is async; in dev mode it resolves synchronously.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  if (isClerkEnabled() && clerkTokenGetter) {
    const token = await clerkTokenGetter();
    if (token) return { Authorization: `Bearer ${token}` };
  }
  return { "x-dev-user": getDevUser() };
}
