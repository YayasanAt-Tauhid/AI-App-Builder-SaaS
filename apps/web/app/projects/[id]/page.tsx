/**
 * projects/[id]/page.tsx — Builder workspace.
 * Fully client-side rendering. Runs on Cloudflare Workers via OpenNext
 * (no `runtime = "edge"` — OpenNext serves the app from a nodejs_compat Worker).
 */
"use client";

import { use } from "react";
import { Nav } from "@/components/nav";
import { Builder } from "@/components/builder";

export default function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = use(params);
  const sp = use(searchParams);
  const isNew = id === "new";
  const prompt = typeof sp.prompt === "string" ? sp.prompt : undefined;
  const model = typeof sp.model === "string" ? sp.model : undefined;

  return (
    <div>
      <Nav />
      <Builder
        initialProjectId={isNew ? null : id}
        initialPrompt={isNew ? prompt : undefined}
        initialModel={model}
      />
    </div>
  );
}
