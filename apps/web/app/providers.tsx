/**
 * providers.tsx — Client providers: Clerk (optional) + theme + tooltips + SWR.
 *
 * SWR gives us the stale-while-revalidate browser cache the PRD calls for:
 * cached data renders instantly while a background revalidation keeps it fresh.
 * When a Clerk publishable key is configured we wrap everything in
 * <ClerkProvider> and bridge its session token into the API client; otherwise
 * the app runs in dev-auth mode with no Clerk dependency mounted.
 */
"use client";

import { SWRConfig } from "swr";
import { ClerkProvider } from "@clerk/nextjs";
import { swrFetcher } from "@/lib/api";
import { isClerkEnabled } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { TooltipProvider } from "@/components/ui";
import { ClerkTokenBridge } from "@/components/clerk-token-bridge";

export function Providers({ children }: { children: React.ReactNode }) {
  const tree = (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <SWRConfig
          value={{
            fetcher: swrFetcher,
            revalidateOnFocus: false,
            dedupingInterval: 5000,
            keepPreviousData: true,
          }}
        >
          {children}
        </SWRConfig>
      </TooltipProvider>
    </ThemeProvider>
  );

  if (isClerkEnabled()) {
    return (
      <ClerkProvider>
        <ClerkTokenBridge />
        {tree}
      </ClerkProvider>
    );
  }
  return tree;
}
