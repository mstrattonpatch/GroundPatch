import { AlertOctagon, ClipboardList, FileWarning } from "lucide-react";
import { loadProject } from "@/lib/server/load";
import { contractor, db } from "@/lib/server/store";
import { can } from "@/lib/domain/permissions";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { swmsReview } from "@/app/actions";

export const metadata = { title: "Safety & compliance" };

export default async function Safety({ params }: { params: Promise<{ id: string }> }) {
  const { user, project: p } = await loadProject(params);
  const base = `/app/projects/${p.id}`;
  const d = db();
  const swms = d.swms.filter((s) => s.projectId === p.id);
  return (
    <>
      <PageHeader crumbs={[{ href: "/app/projects", label: "Projects" }, { href: base, label: p.name }]} title="Safety & compliance" />
      <section className="card">
        <div className="card-head"><h2>SWMS register</h2><div className="spacer" /><span className="small muted">Submit → review → approve → workers acknowledge the current version</span></div>
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Ref</th><th>Activity</th><th>Contractor</th><th>High-risk work</th><th>Acknowledged</th><th>Status</th><th style={{ minWidth: 240 }}>Review</th></tr></thead>
            <tbody>
              {swms.map((s) => {
                const crew = d.workers.filter((w) => w.contractorId === s.contractorId && w.inductedProjectIds.includes(p.id));
                return (
                  <tr key={s.id} id={s.id}>
                    <td className="mono">{s.ref} v{s.version}</td>
                    <td><b style={{ fontWeight: 600 }}>{s.title}</b><div className="muted small">{s.activity}</div></td>
                    <td className="small">{contractor(s.contractorId)?.tradingName}</td>
                    <td className="small">{s.highRiskCategories.join(", ")}</td>
                    <td className="small">{s.status === "approved" ? `${s.acknowledgedBy.length} of ${crew.length} workers` : "—"}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>
                      {(s.status === "submitted" || s.status === "in_review") && can(user, "swms.review") ? (
                        <ActionForm action={swmsReview} className="stack" style={{ gap: 6 }}>
                          <input type="hidden" name="swmsId" value={s.id} />
                          <input name="comment" className="input" placeholder="Comment (required for changes)" style={{ height: 32 }} />
                          <div className="row">
                            <SubmitButton name="decision" value="approve" pendingLabel="Approving…">Approve</SubmitButton>
                            <SubmitButton name="decision" value="changes" className="btn btn-danger" pendingLabel="Sending…">Request changes</SubmitButton>
                          </div>
                        </ActionForm>
                      ) : <span className="muted small">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <section className="card"><EmptyState icon={FileWarning} title="Permits to work" body="Configurable permit types and approvers per project. A permit is never issued just because a form is complete. Planned for phase 3." /></section>
        <section className="card"><EmptyState icon={AlertOctagon} title="Incidents & observations" body="Hazard, near-miss and incident reports with investigation and corrective actions. Planned for phase 3." /></section>
        <section className="card"><EmptyState icon={ClipboardList} title="Toolbox talks" body="Record talks and attendance, linked to the day's site diary. Planned for phase 3." /></section>
      </div>
    </>
  );
}
