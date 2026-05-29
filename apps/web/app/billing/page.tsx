/**
 * billing/page.tsx (/billing) — Plan, credits, ledger, upgrade (PRD §6.10, §13).
 *
 * Shows the current plan + limits, live credit balance, and the recent credit
 * ledger. The upgrade button calls /api/billing/checkout: with a Stripe key it
 * redirects to real Checkout; without one it routes to the local mock-checkout
 * page so the Pro upgrade is fully demoable.
 */
"use client";

import * as React from "react";
import useSWR from "swr";
import type { CreditsResponse, PlanResponse } from "@aiab/shared";
import { PLAN_LIMITS } from "@aiab/shared";
import { api } from "@/lib/api";
import { Nav } from "@/components/nav";
import { Badge, Button, Card } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export default function Billing() {
  const { data: credits } = useSWR<CreditsResponse>("/api/credits");
  const { data: planData } = useSWR<PlanResponse>("/api/billing/plan");
  const [busy, setBusy] = React.useState(false);

  const plan = planData?.plan ?? "free";
  const limits = planData?.limits ?? PLAN_LIMITS.free;

  async function upgrade() {
    setBusy(true);
    try {
      const { url } = await api.checkout();
      window.location.href = url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold">Billing & Credits</h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {/* Current plan */}
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Current plan</h2>
              <Badge tone={plan === "pro" ? "primary" : "muted"}>{plan === "pro" ? "Pro" : "Free"}</Badge>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              <li>{limits.monthlyCredits.toLocaleString()} credits / month</li>
              <li>{limits.concurrency} concurrent generation{limits.concurrency > 1 ? "s" : ""}</li>
              <li>Up to {limits.maxFiles} files · {(limits.maxBytes / (1024 * 1024)).toFixed(0)} MB</li>
              <li>{limits.models === "all" ? "All 8 models" : "Free-tier models"}</li>
              <li>{limits.watermark ? "Watermarked share links" : "No watermark"}</li>
            </ul>
            {plan === "free" && (
              <Button className="mt-4 w-full" onClick={upgrade} disabled={busy}>
                Upgrade to Pro
              </Button>
            )}
          </Card>

          {/* Balance */}
          <Card className="p-5">
            <h2 className="font-semibold">Credit balance</h2>
            <div className="mt-3 text-4xl font-bold text-primary">{credits?.balance ?? "—"}</div>
            <p className="mt-1 text-sm text-muted">credits available</p>
            {credits && credits.balance <= limits.monthlyCredits * 0.1 && (
              <p className="mt-3 text-sm text-danger">⚠ Running low — consider upgrading.</p>
            )}
          </Card>
        </div>

        {/* Ledger */}
        <Card className="mt-6 p-5">
          <h2 className="font-semibold">Recent transactions</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {(credits?.recent ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <span className="capitalize">{t.reason.replace(/_/g, " ")}</span>
                <span className="ml-auto text-muted">{timeAgo(t.createdAt)}</span>
                <span className={t.delta < 0 ? "text-danger" : "text-success"}>
                  {t.delta > 0 ? "+" : ""}
                  {t.delta}
                </span>
              </li>
            ))}
            {(!credits || credits.recent.length === 0) && <li className="py-2 text-muted">No transactions yet.</li>}
          </ul>
        </Card>
      </main>
    </div>
  );
}
