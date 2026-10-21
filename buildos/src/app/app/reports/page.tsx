import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { contractor, listDefects, projName } from "@/lib/server/store";
import { locationLabel } from "@/lib/server/registers";
import { isOverdue } from "@/lib/domain/workflows";
import { PageHeader, StatusBadge } from "@/components/ui";
import { dueLabel } from "@/lib/format";

export const metadata = { title: "Reports" };

// Company-wide registers are filtered views here rather than separate modules.
export default async function Reports({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const { view = "defects" } = await searchParams;
  const now = new Date();
  const rows = listDefects(user).filter((d) => d.status !== "closed" && d.status !== "draft" && (view !== "overdue" || isOverdue(d, now)));
  return (
    <>
      <PageHeader
        title="Reports"
        meta={<span>Company-wide registers. Open defects = every defect not closed or draft, across all active projects.</span>}
        actions={
          <div className="row">
            <Link className="chip" data-active={view === "defects"} href="/app/reports?view=defects">All open defects</Link>
            <Link className="chip" data-active={view === "overdue"} href="/app/reports?view=overdue">Overdue only</Link>
          </div>
        }
      />
      <section className="card">
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>ID</th><th>Title</th><th>Project</th><th>Location</th><th>Contractor</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td><Link className="mono link" href={`/app/projects/${d.projectId}/quality/defects/${d.id}`}>{d.ref}</Link></td>
                  <td>{d.title}</td>
                  <td className="small">{projName(d.projectId)}</td>
                  <td className="small">{locationLabel(d)}</td>
                  <td className="small">{contractor(d.contractorId)?.tradingName ?? "—"}</td>
                  <td className="small">{dueLabel(d.dueDate)}</td>
                  <td>{isOverdue(d, now) ? <StatusBadge status="overdue" /> : <StatusBadge status={d.status} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
