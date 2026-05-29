/**
 * nav.tsx — Top navigation bar with credits, theme toggle, and account.
 *
 * Appears on app pages (not the marketing landing). Shows the live credit
 * balance (revalidated via SWR) and a low-balance warning, links to the
 * dashboard and billing, a dark/light toggle, and an account control. In Clerk
 * mode the account control is Clerk's <UserButton>; in dev mode it's a small
 * Radix dropdown showing the dev user id with a "switch dev user" action.
 */
"use client";

import Link from "next/link";
import useSWR from "swr";
import { Moon, Sun, User, Zap } from "lucide-react";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import type { CreditsResponse } from "@aiab/shared";
import { useTheme } from "@/lib/theme";
import { getDevUser, isClerkEnabled } from "@/lib/auth";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";

/** Clerk account control: avatar menu when signed in, sign-in button otherwise. */
function ClerkAccount() {
  const { isSignedIn } = useUser();
  if (isSignedIn) return <UserButton />;
  return (
    <SignInButton mode="modal" forceRedirectUrl="/dashboard">
      <Button size="sm" variant="secondary">
        Sign in
      </Button>
    </SignInButton>
  );
}

function DevAccountMenu() {
  function switchUser() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("aiab_dev_user");
    window.location.reload();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account">
          <User className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Dev user</DropdownMenuLabel>
        <DropdownMenuItem disabled className="font-mono text-xs opacity-100">
          {getDevUser()}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={switchUser}>Switch dev user</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Nav() {
  const { theme, toggle } = useTheme();
  const { data: credits } = useSWR<CreditsResponse>("/api/credits", { refreshInterval: 15000 });
  const clerk = isClerkEnabled();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">✦</span>
          <span className="hidden sm:inline">AI App Builder</span>
        </Link>

        <nav className="ml-2 flex items-center gap-1 text-sm">
          <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/billing" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/billing">
                  <Badge tone={credits.balance <= 20 ? "danger" : "default"}>
                    <Zap className="h-3 w-3" /> {credits.balance}
                  </Badge>
                </Link>
              </TooltipTrigger>
              <TooltipContent>Credit balance — click to manage billing</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle {theme === "dark" ? "light" : "dark"} mode</TooltipContent>
          </Tooltip>

          {clerk ? <ClerkAccount /> : <DevAccountMenu />}
        </div>
      </div>
    </header>
  );
}
