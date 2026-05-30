/**
 * middleware.ts — Clerk session handshake (edge runtime).
 *
 * Clerk needs middleware to serve its /__clerk/* handshake routes; without it,
 * OAuth (e.g. Google) completes on Clerk's side but the session never syncs
 * back, so useUser() stays signed-out. We use the classic `middleware.ts`
 * (which runs on the **edge** runtime) rather than Next 16's `proxy.ts` (which
 * is node-only and unsupported by OpenNext on Cloudflare Workers).
 *
 * Key-free invariant preserved: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is inlined at
 * build time, so with no key the ternary compiles to a pass-through and Clerk
 * is never initialized (dev-auth mode).
 */
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default clerkEnabled ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next internals and static files; always run for Clerk + API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
