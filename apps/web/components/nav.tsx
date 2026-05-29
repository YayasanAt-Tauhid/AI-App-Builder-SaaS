/**
 * nav.tsx — Top navigation bar with credits + theme toggle.
 *
 * Appears on app pages (not the marketing landing). Shows the live credit
 * balance (revalidated via SWR) and a low-balance warning, plus links to the
 * dashboard and billing, and the dark/light toggle.
 */
"use client";

import Link from "next/link";
import useSWR from "swr";
import type { CreditsResponse } from "@aiab/shared";
import { useTheme } from "@/lib/theme";
import { Badge, Button } from "@/components/ui";

export function Nav() {
  const { theme, toggle } = useTheme();
  const { data: credits } = useSWR<CreditsResponse>("/api/credits", { refreshInterval: 15000 });

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">✦</span>
          <span className="hidden sm:inline">AI App Builder</span>
        </Link>

        <nav className="ml-2 flex items-center gap-1 text-sm">
          <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-muted hover:bg-surface2 hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/billing" className="rounded-md px-3 py-1.5 text-muted hover:bg-surface2 hover:text-foreground">
            Billing
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {credits && (
            <Link href="/billing" className="hidden sm:block">
              <Badge tone={credits.plan === "pro" ? "primary" : "muted"}>
                {credits.plan === "pro" ? "Pro" : "Free"}
              </Badge>
            </Link>
          )}
          {credits && (
            <Badge tone={credits.balance <= 20 ? "danger" : "default"} title="Credit balance">
              ⚡ {credits.balance} credits
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" title="Toggle theme">
            {theme === "dark" ? "☾" : "☀"}
          </Button>
        </div>
      </div>
    </header>
  );
}
