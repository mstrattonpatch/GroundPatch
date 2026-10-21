import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { loadProject } from "@/lib/server/load";
import { db, getUser } from "@/lib/server/store";
import { can } from "@/lib/domain/permissions";
import { PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { holdPointAction } from "@/app/actions";
import { dateTime } from "@/lib/format";

const TYPE_LABEL = { hold: "Hold point", witness: "Witness point", inspection: "Inspection", test: "Test" } as const;

export default async function ItpDetail({ params }: { params: Promise<{ id: string; itpId: string }> }) {
  const { user, project: p } = await loadProject(params);
  const { itpId } = await params;
  const itp = db().itps.find((i) => i.id === itpId && i.projectId === p.id);
  if (!itp) notFound();
  const base = `/app/projects/${p.id}`;
  const task = db().tasks.find((t) => t.id === itp.taskId);
  const mayRelease = can(user, "itp.release_hold");

  return (
    <>
      <PageHeader
        crumbs={[{ href: base, label: p.name }, { href: `${base}/quality`, label: "Quality" }]}
        title={<><span className="mono" style={{ fontSize: 20, color: "var(--muted)", marginRight: 10 }}>{itp.ref}</span>{itp.title}</>}
        meta={<><span>Template v{itp.templateVersion} — template changes don&apos;t silently alter this active ITP</span>{task && <span>Task: <Link className="link" href={`${base}/programme`}>{task.name}</Link></span>}</>}
      />

      {itp.points.some((x) => x.type === "hold" && x.status !== "released") && (
        <div className="notice notice-error" role="note">
          <Lock size={16} aria-hidden />
          <span><b>Hold point open.</b> Work covered by this hold must not proceed until a designated person releases it. BuildOS flags the hold and records who released it — it doesn&apos;t replace contractual requirements.</span>
        </div>
      )}

      <section className="card">
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Point</th><th>Type</th><th>Acceptance check</th><th>Evidence</th><th>Status</th><th style={{ minWidth: 240 }}>Sign-off</th></tr></thead>
            <tbody>
              {itp.points.map((pt) => (
                <tr key={pt.id}>
                  <td style={{ fontWeight: 600 }}>{pt.name}</td>
                  <td>{pt.type === "hold" ? <StatusBadge status="hold" label="Hold" /> : <span className="tag">{TYPE_LABEL[pt.type]}</span>}</td>
                  <td className="small">{pt.check}</td>
                  <td className="small">{pt.evidence.length ? `${pt.evidence.length} photo${pt.evidence.length > 1 ? "s" : ""}` : <span className="muted">None</span>}</td>
                  <td><StatusBadge status={pt.status} /></td>
                  <td>
                    {pt.status === "released" && <span className="small muted">Released by {getUser(pt.releasedBy ?? "")?.name} · {pt.releasedAt ? dateTime(pt.releasedAt) : ""}</span>}
                    {pt.status === "submitted" && mayRelease && (
                      <ActionForm action={holdPointAction} className="stack" style={{ gap: 8 }} confirmFor="release" confirm={`${pt.type === "hold" ? "Release this hold point" : "Accept this point"}? Your name and the time are recorded.`}>
                        <input type="hidden" name="itpId" value={itp.id} />
                        <input type="hidden" name="pointId" value={pt.id} />
                        <input name="comment" className="input" placeholder="Comment (required to reject)" style={{ height: 34 }} />
                        <div className="row">
                          <SubmitButton name="decision" value="release" pendingLabel="Releasing…">{pt.type === "hold" ? "Release hold point" : "Accept"}</SubmitButton>
                          <SubmitButton name="decision" value="reject" className="btn btn-danger" pendingLabel="Rejecting…">Reject</SubmitButton>
                        </div>
                      </ActionForm>
                    )}
                    {pt.status === "submitted" && !mayRelease && <span className="small muted">Awaiting an authorised reviewer</span>}
                    {pt.status === "pending" && <span className="small muted">Not yet submitted from site</span>}
                    {pt.status === "rejected" && <span className="small red-text">Rejected — rework and resubmit</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="small muted">Releasing a hold point records quality acceptance. It doesn&apos;t mark the programme task complete — quality acceptance and physical progress are separate facts.</p>
    </>
  );
}
