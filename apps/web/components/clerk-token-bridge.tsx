/**
 * clerk-token-bridge.tsx — bridges Clerk's async session token to lib/api.
 *
 * lib/api.ts is a plain module (not a React hook), so it can't call Clerk's
 * `useAuth().getToken()` directly. This tiny component lives inside
 * <ClerkProvider>, grabs the token getter, and registers it so every API
 * request can attach `Authorization: Bearer <jwt>`. Rendered only in Clerk mode.
 */
"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { setClerkTokenGetter } from "@/lib/auth";

export function ClerkTokenBridge() {
  const { getToken } = useAuth();
  React.useEffect(() => {
    setClerkTokenGetter(() => getToken());
    return () => setClerkTokenGetter(null);
  }, [getToken]);
  return null;
}
