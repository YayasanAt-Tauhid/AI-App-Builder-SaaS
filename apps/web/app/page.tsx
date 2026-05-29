/**
 * page.tsx (/) — Marketing landing (PRD §5.1).
 *
 * The entry point a new user lands on. Highlights the product's differentiators
 * and funnels into the dashboard via "Start Building". Server component — no
 * client JS needed for the static pitch.
 */
import Link from "next/link";

const FEATURES = [
  { title: "Live preview", body: "See your app run instantly in an in-browser Sandpack sandbox — no setup." },
  { title: "VS Code editing", body: "Tweak any file in a full Monaco editor; changes hot-reload into the preview." },
  { title: "8 AI models", body: "Switch between Claude, GPT-4o, Gemini, and DeepSeek to balance cost and quality." },
  { title: "Real-time streaming", body: "Watch your project generate token-by-token over Server-Sent Events." },
  { title: "Version history", body: "Every change is a version. Diff any two and restore non-destructively." },
  { title: "One-click export", body: "Download a runnable .zip with a README whenever you like." },
];

export default function Landing() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">✦</span>
        AI App Builder
      </div>

      <h1 className="mt-10 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
        Describe it. <span className="text-primary">Watch it build.</span> Ship it.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">
        Generate, preview, edit, and export production-ready web apps from a single prompt — with
        live preview, multi-model AI, version history, and transparent credit-based pricing.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="inline-flex h-12 items-center rounded-[var(--radius)] bg-primary px-7 font-medium text-primary-foreground transition hover:bg-primary-hover"
        >
          Start Building →
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex h-12 items-center rounded-[var(--radius)] border border-border px-7 font-medium hover:bg-surface2"
        >
          View Dashboard
        </Link>
      </div>

      <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-[var(--radius)] border border-border bg-surface p-5">
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </div>

      <footer className="mt-20 border-t border-border pt-6 text-sm text-muted">
        Built on an edge-native architecture (Hono · sharded D1 · R2 · KV · Durable Objects).
        Free tier included.
      </footer>
    </main>
  );
}
