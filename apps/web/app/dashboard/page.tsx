/**
 * dashboard/page.tsx (/dashboard) — Project hub + new-project prompt (PRD §5.1, §6.7).
 *
 * The prominent prompt box starts a brand-new build: we route to /projects/new
 * carrying the prompt + model, where the Builder auto-starts the generation.
 * Below, the user's projects render as a searchable grid (data via SWR, served
 * by the edge-cached list endpoint).
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { ProjectListResponse } from "@aiab/shared";
import { getDefaultModel } from "@aiab/shared";
import { Nav } from "@/components/nav";
import { Button, Card, Input, Spinner, Textarea } from "@/components/ui";
import { ModelPicker } from "@/components/model-picker";
import { ProjectCard } from "@/components/project-card";
import type { PlanResponse } from "@aiab/shared";

const STARTERS = [
  "A todo app with dark mode and local storage",
  "A counter app with increment and reset buttons",
  "A landing page for a coffee shop with a hero and menu",
];

export default function Dashboard() {
  const router = useRouter();
  const { data: planData } = useSWR<PlanResponse>("/api/billing/plan");
  const plan = planData?.plan ?? "free";

  const [prompt, setPrompt] = React.useState("");
  const [model, setModel] = React.useState(getDefaultModel().id);
  const [search, setSearch] = React.useState("");

  const key = `/api/projects${search ? `?search=${encodeURIComponent(search)}` : ""}`;
  const { data, isLoading, mutate } = useSWR<ProjectListResponse>(key);

  function start() {
    const p = prompt.trim();
    if (!p) return;
    router.push(`/projects/new?prompt=${encodeURIComponent(p)}&model=${encodeURIComponent(model)}`);
  }

  const projects = data?.projects ?? [];

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* New project prompt */}
        <Card className="p-5">
          <h1 className="text-lg font-semibold">What do you want to build?</h1>
          <p className="mt-1 text-sm text-muted">Describe your app and pick a model. We&apos;ll generate it live.</p>
          <div className="mt-4 flex flex-col gap-3">
            <Textarea
              rows={3}
              placeholder="e.g. A todo app with dark mode, filters, and localStorage"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") start();
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <ModelPicker value={model} onChange={setModel} plan={plan} />
              <Button onClick={start} disabled={!prompt.trim()}>
                Generate →
              </Button>
              <div className="ml-auto flex flex-wrap gap-1">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:bg-surface2"
                  >
                    {s.length > 32 ? s.slice(0, 30) + "…" : s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Projects */}
        <div className="mt-10 flex items-center gap-3">
          <h2 className="text-base font-semibold">Your projects</h2>
          <span className="text-sm text-muted">{data?.total ?? 0}</span>
          <div className="ml-auto w-56">
            <Input placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        ) : projects.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            No projects yet. Describe something above to create your first one.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onChanged={() => mutate()} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
