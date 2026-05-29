/**
 * model-picker.tsx — Choose among the 8 AI models (PRD §6.2).
 *
 * Shows per-model metadata (provider, strength, relative cost) and gates
 * Pro-only models when the user is on the Free plan, with a clear hint to
 * upgrade. The catalog is loaded via SWR (browser-cached) from the edge-cached
 * /api/models endpoint.
 */
"use client";

import * as React from "react";
import useSWR from "swr";
import { MODEL_CATALOG, planCanUseModel } from "@aiab/shared";
import type { ModelInfo, Plan } from "@aiab/shared";
import { cn } from "@/lib/utils";

const COST_LABEL: Record<ModelInfo["relativeCost"], string> = {
  low: "$",
  medium: "$$",
  "medium-high": "$$$",
  high: "$$$$",
};

export function ModelPicker({
  value,
  onChange,
  plan,
}: {
  value: string;
  onChange: (id: string) => void;
  plan: Plan;
}) {
  // Use SWR for freshness but fall back to the bundled catalog instantly.
  const { data } = useSWR<{ models: ModelInfo[] }>("/api/models");
  const models = data?.models ?? MODEL_CATALOG;
  const [open, setOpen] = React.useState(false);
  const selected = models.find((m) => m.id === value) ?? models[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-[var(--radius)] border border-border bg-surface2 px-3 text-sm hover:brightness-110"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="font-medium">{selected?.name}</span>
        <span className="text-xs text-muted">{COST_LABEL[selected?.relativeCost ?? "low"]}</span>
        <span className="text-muted">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            className="absolute z-20 mt-2 max-h-96 w-80 overflow-auto rounded-[var(--radius)] border border-border bg-surface p-1 shadow-xl"
          >
            {models.map((m) => {
              const allowed = planCanUseModel(plan, m);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={!allowed}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm",
                      m.id === value ? "bg-primary/15" : "hover:bg-surface2",
                      !allowed && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <div className="flex w-full items-center gap-2">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs uppercase text-muted">{m.provider}</span>
                      <span className="ml-auto text-xs text-muted">{COST_LABEL[m.relativeCost]}</span>
                    </div>
                    <span className="text-xs text-muted">{m.strength}</span>
                    {!allowed && <span className="text-xs text-danger">Pro only — upgrade to use</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
