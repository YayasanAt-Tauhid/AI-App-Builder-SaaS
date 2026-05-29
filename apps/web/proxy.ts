/**
 * proxy.ts — Clerk request context (Next 16 proxy convention), only when Clerk is configured.
 *
 * In Clerk mode this attaches the auth context Clerk needs. With no publishable
 * key (dev-auth mode) it's a pass-through, so the app runs with zero Clerk setup
 * and the middleware never initializes Clerk with missing credentials.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default async function proxy(req: NextRequest, ev: NextFetchEvent) {
  if (!clerkEnabled) return NextResponse.next();
  const { clerkMiddleware } = await import("@clerk/nextjs/server");
  return clerkMiddleware()(req, ev);
}

export const config = {
  // Run on app routes but skip Next internals and static assets.
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
