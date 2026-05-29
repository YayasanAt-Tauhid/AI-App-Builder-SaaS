/**
 * projects/[id]/page.tsx — The builder workspace for one project.
 *
 * Special-cases the id "new": no project loads, and any ?prompt=&model= from
 * the dashboard is handed to the Builder, which auto-starts the generation and
 * swaps the URL to the real project id once it exists.
 */
import { Nav } from "@/components/nav";
import { Builder } from "@/components/builder";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
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
