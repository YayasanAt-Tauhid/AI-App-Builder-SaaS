/** id.ts — UUID + short-id helpers. Node 22 ships crypto.randomUUID globally. */
export function uuid(): string {
  return crypto.randomUUID();
}

/** A short, URL-safe id for things like generation handles. */
export function shortId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}
