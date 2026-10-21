import { loadProject } from "@/lib/server/load";
import { db, getUser, onSiteNow } from "@/lib/server/store";
import { can } from "@/lib/domain/permissions";
import { PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { submitDiary } from "@/app/actions";
import { longToday, shortDate } from "@/lib/format";

export const metadata = { title: "Site diary" };

export default async function Diary({ params }: { params: Promise<{ id: string }> }) {
  const { user, project: p } = await loadProject(params);
  const base = `/app/projects/${p.id}`;
  const d = db();
  const entries = d.diary.filter((x) => x.projectId === p.id);
  const today = new Date().toISOString().slice(0, 10);
  const submittedToday = entries.some((e) => e.date === today);
  const here = onSiteNow(p.id);
  const inspections = d.audit.filter((a) => a.projectId === p.id && a.recordType === "itp_point" && a.at.startsWith(today));
  return (
    <>
      <PageHeader crumbs={[{ href: "/app/projects", label: "Projects" }, { href: base, label: p.name }]} title="Site diary" meta={<span>{longToday()}</span>} />
      <div className="po-grid">
        <section className="card card-pad">
          <h2 style={{ marginBottom: 4 }}>Today</h2>
          <p className="muted small" style={{ marginBottom: 14 }}>
            Pulled in automatically: <b>{here.length} workers</b> checked in, <b>{inspections.length}</b> inspection sign-offs today.
          </p>
          {submittedToday ? (
            <p className="muted">Today&apos;s diary is submitted. Changes go in as amendments, so the original record is never overwritten.</p>
          ) : can(user, "diary.submit") ? (
            <ActionForm action={submitDiary} className="stack" resetOnSuccess>
              <input type="hidden" name="projectId" value={p.id} />
              <label className="field"><span>Weather &amp; conditions</span><input name="weather" className="input" defaultValue={p.weather} /></label>
              <label className="field"><span>Work completed &amp; areas <span className="req">*</span></span><textarea name="notes" className="input" placeholder="What happened on site today?" /></label>
              <label className="field"><span>Delays &amp; disruptions</span><input name="delays" className="input" placeholder="Cause and duration" /></label>
              <SubmitButton pendingLabel="Submitting…" className="btn btn-dark">Submit diary</SubmitButton>
            </ActionForm>
          ) : (
            <p className="muted">Only the site team can submit the diary.</p>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2>Previous entries</h2></div>
          <div className="card-body stack">
            {entries.map((e) => (
              <div key={e.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
                <div className="row wrap small muted" style={{ gap: 12 }}>
                  <b style={{ color: "var(--ink)" }}>{shortDate(e.date)}</b><span>{e.weather}</span><span>{e.workersOnSite} workers · {e.companiesOnSite} companies</span><StatusBadge status="submitted" />
                </div>
                <p style={{ marginTop: 6 }}>{e.notes}</p>
                {e.delays && <p className="small amber-text" style={{ marginTop: 4 }}>Delay: {e.delays}</p>}
                <p className="small muted" style={{ marginTop: 4 }}>By {getUser(e.authorId)?.name}</p>
              </div>
            ))}
            {entries.length === 0 && <p className="muted">No entries yet.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
