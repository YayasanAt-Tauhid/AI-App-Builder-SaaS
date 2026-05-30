/**
 * projects/[id]/page.tsx — Builder workspace.
 * Edge runtime + fully client-side rendering untuk kompatibilitas Cloudflare Pages.
 */
"use client";

export const runtime = "edge";

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
