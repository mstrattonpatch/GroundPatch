import { BarChart3 } from "lucide-react";
import { loadProject } from "@/lib/server/load";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { project: p } = await loadProject(params);
  return (
    <>
      <PageHeader crumbs={[{ href: "/app/projects", label: "Projects" }, { href: `/app/projects/${p.id}`, label: p.name }]} title="Project reports" />
      <section className="card"><EmptyState icon={BarChart3} title="Coming in a later phase" body="Weekly project summary, quality trends, labour hours by trade and cost reports — every metric with a written definition. Planned for phase 5." /></section>
    </>
  );
}
