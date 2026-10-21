import Link from "next/link";
import { notFound } from "next/navigation";
import { loadProject } from "@/lib/server/load";
import { auditFor, contractor, db, getDefect, getUser } from "@/lib/server/store";
import { locationLabel } from "@/lib/server/registers";
import { can } from "@/lib/domain/permissions";
import { DEFECT_STEPS, isOverdue } from "@/lib/domain/workflows";
import { PageHeader, StatusBadge, Stepper } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { defectAction } from "@/app/actions";
import { dateTime, dueLabel, isoDate } from "@/lib/format";

export default async function DefectDetail({ params }: { params: Promise<{ id: string; defectId: string }> }) {
  const { user, project: p } = await loadProject(params);
  const { defectId } = await params;
  const d = getDefect(user, defectId);
  if (!d || d.projectId !== p.id) notFound();
  const base = `/app/projects/${p.id}`;
  const history = auditFor(d.id);
  const task = db().tasks.find((t) => t.id === d.taskId);
  const itp = db().itps.find((i) => i.id === d.itpId);
  const late = isOverdue(d, new Date());
  const isSub = user.role === "subcontractor_admin" && user.contractorId === d.contractorId;
  const siteTeam = user.role === "site_supervisor" || user.role === "project_manager";
  const contractors = db().contractors;

  return (
    <>
      <PageHeader
        crumbs={[{ href: base, label: p.name }, { href: `${base}/quality`, label: "Quality" }]}
        title={<><span className="mono" style={{ fontSize: 20, color: "var(--muted)", marginRight: 10 }}>{d.ref}</span>{d.title}</>}
        meta={<span className="row" style={{ gap: 8 }}>{late && <StatusBadge status="overdue" />}<StatusBadge status={d.status} /></span>}
      />

      <section className="card card-pad"><Stepper steps={DEFECT_STEPS} current={d.status === "draft" ? "open" : d.status} /></section>

      <div className="cc-grid">
        <div className="stack-lg" style={{ minWidth: 0 }}>
          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <dl className="kv" style={{ gridTemplateColumns: "180px 1fr" }}>
                <dt className="muted">Location</dt><dd style={{ textAlign: "left", fontFamily: "inherit" }}>{locationLabel(d)}</dd>
                <dt className="muted">Trade</dt><dd style={{ textAlign: "left", fontFamily: "inherit" }}>{d.trade}</dd>
                <dt className="muted">Responsible contractor</dt><dd style={{ textAlign: "left", fontFamily: "inherit" }}>{contractor(d.contractorId)?.tradingName ?? "Unassigned"}</dd>
                <dt className="muted">Priority</dt><dd style={{ textAlign: "left", fontFamily: "inherit", textTransform: "capitalize" }}>{d.priority}</dd>
                <dt className="muted">Due</dt><dd style={{ textAlign: "left", fontFamily: "inherit" }} className={late ? "amber-text" : ""}>{dueLabel(d.dueDate)}</dd>
                <dt className="muted">Raised</dt><dd style={{ textAlign: "left", fontFamily: "inherit" }}>{getUser(d.raisedBy)?.name} · {dateTime(d.raisedAt)}</dd>
                {task && <><dt className="muted">Programme task</dt><dd style={{ textAlign: "left", fontFamily: "inherit" }}><Link className="link" href={`${base}/programme`}>{task.name}</Link></dd></>}
                {itp && <><dt className="muted">ITP</dt><dd style={{ textAlign: "left", fontFamily: "inherit" }}><Link className="link" href={`${base}/quality/itp/${itp.id}`}>{itp.ref}</Link></dd></>}
              </dl>
              <h3 style={{ margin: "18px 0 8px" }}>Photos</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
                {d.photos.map((ph, i) => <div key={i} className="photo-ph" style={{ minHeight: 84 }} title={ph}>{ph}</div>)}
              </div>
              {d.rectificationNote && (
                <>
                  <h3 style={{ margin: "18px 0 8px" }}>Rectification</h3>
                  <p>{d.rectificationNote}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, marginTop: 8 }}>
                    {d.evidencePhotos.map((ph, i) => <div key={i} className="photo-ph" style={{ minHeight: 84, background: "#a9c3b6" }} title={ph}>{ph}</div>)}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>History</h2></div>
            <div className="card-body">
              <ul className="timeline">
                {history.map((a) => (
                  <li key={a.id}>
                    <span className={`dot ${/closed|verified/i.test(a.action) ? "green" : /reject/i.test(a.action) ? "red" : "blue"}`} />
                    <div>
                      <b style={{ fontWeight: 600 }}>{a.action}</b> by {getUser(a.actorId)?.name}{a.detail ? ` · ${a.detail}` : ""} · <span className="muted">{dateTime(a.at)}</span>
                      {a.from && a.to && a.from !== a.to && <div className="muted small">{a.from.replace(/_/g, " ")} → {a.to.replace(/_/g, " ")}</div>}
                    </div>
                  </li>
                ))}
                <li><span className="dot" /><div><b style={{ fontWeight: 600 }}>Defect raised</b> by {getUser(d.raisedBy)?.name} · <span className="muted">{dateTime(d.raisedAt)}</span></div></li>
              </ul>
            </div>
          </section>
        </div>

        <aside className="stack-lg">
          {d.status === "draft" && can(user, "defect.create") && (
            <section className="card card-pad">
              <h2 style={{ marginBottom: 6 }}>Draft</h2>
              <p className="muted small" style={{ marginBottom: 12 }}>Drafts aren&apos;t in the open register yet. Submit it when the details are right.</p>
              <ActionForm action={defectAction}>
                <input type="hidden" name="defectId" value={d.id} />
                <input type="hidden" name="type" value="submit" />
                <SubmitButton pendingLabel="Submitting…">Submit defect</SubmitButton>
              </ActionForm>
            </section>
          )}
          {(d.status === "open" || d.status === "assigned") && can(user, "defect.assign") && (
            <section className="card card-pad">
              <h2 style={{ marginBottom: 12 }}>{d.status === "open" ? "Assign" : "Reassign"}</h2>
              <ActionForm action={defectAction} className="stack">
                <input type="hidden" name="defectId" value={d.id} />
                <input type="hidden" name="type" value="assign" />
                <label className="field"><span>Responsible contractor <span className="req">*</span></span>
                  <select name="contractorId" className="input" defaultValue={d.contractorId ?? ""}>
                    <option value="">Select…</option>
                    {contractors.map((c) => <option key={c.id} value={c.id}>{c.tradingName}</option>)}
                  </select>
                </label>
                <label className="field"><span>Due date <span className="req">*</span></span>
                  <input type="date" name="dueDate" className="input" defaultValue={d.dueDate ?? ""} min={isoDate(0)} />
                </label>
                <SubmitButton pendingLabel="Assigning…">Assign</SubmitButton>
              </ActionForm>
            </section>
          )}

          {d.status === "assigned" && (isSub || siteTeam) && (
            <section className="card card-pad">
              <h2 style={{ marginBottom: 6 }}>Start rectification</h2>
              <p className="muted small" style={{ marginBottom: 12 }}>Let the site team know the crew is on it.</p>
              <ActionForm action={defectAction}>
                <input type="hidden" name="defectId" value={d.id} />
                <input type="hidden" name="type" value="start_rectification" />
                <SubmitButton className="btn" pendingLabel="Saving…">Mark as rectifying</SubmitButton>
              </ActionForm>
            </section>
          )}

          {(d.status === "rectifying" || d.status === "assigned") && (isSub || siteTeam) && (
            <section className="card card-pad">
              <h2 style={{ marginBottom: 12 }}>Submit for verification</h2>
              <ActionForm action={defectAction} className="stack">
                <input type="hidden" name="defectId" value={d.id} />
                <input type="hidden" name="type" value="submit_for_verification" />
                <label className="field"><span>What was done <span className="req">*</span></span>
                  <textarea name="note" className="input" placeholder="e.g. Membrane relapped 150mm up hob, cured 24h" />
                </label>
                <label className="field"><span>Completion photos <span className="req">*</span></span>
                  <input type="file" name="evidence" accept="image/*" multiple className="input" style={{ paddingTop: 7 }} />
                </label>
                <SubmitButton pendingLabel="Submitting…" className="btn btn-dark">Submit for review</SubmitButton>
              </ActionForm>
            </section>
          )}

          {d.status === "ready_for_verification" && can(user, "defect.verify") && (
            <section className="card card-pad">
              <h2 style={{ marginBottom: 6 }}>Verify repair</h2>
              <p className="muted small" style={{ marginBottom: 12 }}>Closing needs your sign-off on the evidence. Rejecting sends it back to rectification.</p>
              <ActionForm action={defectAction} className="stack" confirm={`Verify and close ${d.ref}? This is recorded against your name.`}>
                <input type="hidden" name="defectId" value={d.id} />
                <input type="hidden" name="type" value="verify" />
                <SubmitButton pendingLabel="Approving…">Verify & close</SubmitButton>
              </ActionForm>
              <ActionForm action={defectAction} className="stack" style={{ marginTop: 14 }}>
                <input type="hidden" name="defectId" value={d.id} />
                <input type="hidden" name="type" value="reject" />
                <label className="field"><span>Reason for rejecting</span>
                  <textarea name="reason" className="input" placeholder="What still needs fixing?" />
                </label>
                <SubmitButton className="btn btn-danger" pendingLabel="Sending back…">Request changes</SubmitButton>
              </ActionForm>
            </section>
          )}

          {d.status === "closed" && (
            <section className="card card-pad">
              <h2 style={{ marginBottom: 6 }}>Closed</h2>
              <p className="muted small">Verified by {getUser(d.verifiedBy ?? "")?.name ?? "reviewer"}. The record stays in the register for audit and the defect liability period.</p>
            </section>
          )}

          {user.role === "worker" && <p className="muted small">You can raise defects from the site app. Assignment and verification are handled by the site team.</p>}
        </aside>
      </div>
    </>
  );
}
