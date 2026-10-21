import { loadProject } from "@/lib/server/load";
import { db } from "@/lib/server/store";
import { projectLocations } from "@/lib/server/registers";
import { assertCan, can } from "@/lib/domain/permissions";
import { PageHeader } from "@/components/ui";
import { DefectForm } from "@/components/defect-form";

export const metadata = { title: "New defect" };

export default async function NewDefect({ params }: { params: Promise<{ id: string }> }) {
  const { user, project: p } = await loadProject(params);
  assertCan(user, "defect.create");
  const base = `/app/projects/${p.id}`;
  const contractors = db().contractors.map((c) => ({ id: c.id, label: c.tradingName, trade: c.trade }));
  return (
    <>
      <PageHeader crumbs={[{ href: base, label: p.name }, { href: `${base}/quality`, label: "Quality" }]} title="New defect" />
      <section className="card card-pad" style={{ maxWidth: 680 }}>
        <DefectForm
          projectId={p.id}
          locations={projectLocations(p.id).map((l) => ({ id: l.id, label: `${l.building} › ${l.level} › ${l.zone}` }))}
          contractors={contractors}
          trades={[...new Set(contractors.map((c) => c.trade))]}
          canAssign={can(user, "defect.assign")}
          doneHref={`${base}/quality`}
        />
      </section>
    </>
  );
}
