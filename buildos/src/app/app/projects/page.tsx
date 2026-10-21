import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { getUser, listProjects, openDefects, projectCommercial } from "@/lib/server/store";
import { PageHeader, SampleTag } from "@/components/ui";
import { dayMonth, money } from "@/lib/format";

export const metadata = { title: "Projects" };

export default async function Projects() {
  const user = await requireUser();
  const projects = listProjects(user);
  return (
    <>
      <PageHeader title={<span className="row" style={{ gap: 12 }}>Projects <SampleTag /></span>} meta={<span>{projects.length} active</span>} />
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {projects.map((p) => {
          const c = projectCommercial(user, p.id);
          return (
            <Link key={p.id} href={`/app/projects/${p.id}`} className="card card-pad stack" style={{ gap: 10 }}>
              <div>
                <h2>{p.name}</h2>
                <div className="muted small"><span className="mono" style={{ fontSize: 12 }}>{p.code}</span> · {p.type} · {p.address}</div>
              </div>
              <div className="bar"><span className="planned" style={{ width: `${p.plannedProgress}%` }} /><span className="actual" style={{ width: `${p.verifiedProgress}%` }} /></div>
              <div className="row wrap small muted" style={{ gap: 14 }}>
                <span>{p.verifiedProgress}% verified</span>
                <span>{openDefects(user, p.id).length} open defects</span>
                {c && <span>{money(c.revisedContract, { compact: true })}</span>}
                <span>PM {getUser(p.pmId)?.name}</span>
              </div>
              <div className="small">Next: <b>{p.nextMilestone.name}</b> · {dayMonth(p.nextMilestone.date)}</div>
            </Link>
          );
        })}
      </div>
      <p className="small muted">Guided project setup (details → commercial → team → programme → quality & safety → documents) arrives with the database build.</p>
    </>
  );
}
