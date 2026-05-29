/**
 * auth.ts — Client auth handle (PRD §14).
 *
 * The API supports two modes: real Clerk JWTs and a dev fallback keyed by an
 * `x-dev-user` header. This client runs in dev mode by default so the app works
 * with zero auth setup: it keeps a stable per-browser dev user id in
 * localStorage and attaches it as `x-dev-user` on every request.
 *
 * To enable Clerk on the client: install @clerk/nextjs, wrap the app in
 * <ClerkProvider>, and change `authHeaders()` to attach
 * `Authorization: Bearer ${await getToken()}` instead of the dev header. The
 * API already verifies real Clerk tokens, so no backend change is needed.
 */

const DEV_USER_KEY = "aiab_dev_user";

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

/** Headers to attach to every API request to identify the user. */
export function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return { "x-dev-user": getDevUser() };
}
