/**
 * providers.tsx — Client providers: theme + SWR (PRD §8.1 client cache).
 *
 * SWR gives us the stale-while-revalidate browser cache the PRD calls for:
 * cached data renders instantly while a background revalidation keeps it fresh.
 * The default fetcher routes string keys (API paths) through our typed client.
 */
"use client";

import { SWRConfig } from "swr";
import { swrFetcher } from "@/lib/api";
import { ThemeProvider } from "@/lib/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}
