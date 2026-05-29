/**
 * landing-cta.tsx — Call-to-action buttons for the marketing landing.
 *
 * In Clerk mode the primary CTA opens Clerk's sign-up modal and the secondary
 * opens sign-in, both redirecting to the dashboard on success (PRD §5.1/§5.3).
 * In dev mode they link straight to the dashboard so the app is usable with no
 * auth setup.
 */
"use client";

import Link from "next/link";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { isClerkEnabled } from "@/lib/auth";
import { Button } from "@/components/ui";

export function LandingCta() {
  if (isClerkEnabled()) {
    return (
      <>
        <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
          <Button size="lg">Start Building →</Button>
        </SignUpButton>
        <SignInButton mode="modal" forceRedirectUrl="/dashboard">
          <Button size="lg" variant="secondary">
            Sign in
          </Button>
        </SignInButton>
      </>
    );
  }
  return (
    <>
      <Button size="lg" asChild>
        <Link href="/dashboard">Start Building →</Link>
      </Button>
      <Button size="lg" variant="secondary" asChild>
        <Link href="/dashboard">View Dashboard</Link>
      </Button>
    </>
  );
}
