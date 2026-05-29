/**
 * billing/mock-checkout/page.tsx — Local stand-in for Stripe Checkout.
 *
 * Only reached when no Stripe key is configured. It calls /api/billing/mock-
 * upgrade (which simulates the Stripe webhook: flips the plan to Pro and refills
 * credits) and then returns to the dashboard. Lets the full upgrade journey be
 * demoed end-to-end without any billing credentials.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";

export default function MockCheckout() {
  const router = useRouter();
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    api
      .mockUpgrade()
      .then(() => setDone(true))
      .finally(() => setTimeout(() => router.push("/dashboard?upgraded=1"), 900));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <Spinner className="h-6 w-6" />
        <h1 className="text-lg font-semibold">{done ? "Upgraded to Pro 🎉" : "Processing upgrade…"}</h1>
        <p className="text-sm text-muted">
          {done ? "Redirecting you to your dashboard…" : "Simulating Stripe Checkout (mock mode)."}
        </p>
      </Card>
    </main>
  );
}
