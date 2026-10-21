import { PackageCheck } from "lucide-react";
import { loadProject } from "@/lib/server/load";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { project: p } = await loadProject(params);
  return (
    <>
      <PageHeader crumbs={[{ href: "/app/projects", label: "Projects" }, { href: `/app/projects/${p.id}`, label: p.name }]} title="Handover" />
      <section className="card"><EmptyState icon={PackageCheck} title="Coming in a later phase" body="Compile outstanding defects, inspections, certificates and warranties into an audit-ready handover pack, then manage the defect liability period. Planned for phase 5." /></section>
    </>
  );
}
