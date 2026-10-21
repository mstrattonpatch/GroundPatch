import { loadProject } from "@/lib/server/load";
import { contractor, db, onSiteNow, workerRequirements } from "@/lib/server/store";
import { daysBetween } from "@/lib/domain/workflows";
import { Metric, PageHeader, StatusBadge } from "@/components/ui";
import { dayMonth } from "@/lib/format";

export const metadata = { title: "Workforce & site access" };

export default async function Workforce({ params }: { params: Promise<{ id: string }> }) {
  const { project: p } = await loadProject(params);
  const base = `/app/projects/${p.id}`;
  const d = db();
  const here = onSiteNow(p.id);
  const hereIds = new Set(here.map((e) => e.workerId));
  const workers = d.workers.filter((w) => w.inductedProjectIds.includes(p.id) || hereIds.has(w.id) || d.tasks.some((t) => t.projectId === p.id && t.contractorId === w.contractorId));
  const rows = workers.map((w) => ({ w, r: workerRequirements(w.id, p.id)!, inAt: here.find((e) => e.workerId === w.id)?.at }));
  const blocked = rows.filter((x) => !x.r.eligible);
  const companies = [...new Set(workers.map((w) => w.contractorId))].map((id) => contractor(id)!);
  const today = new Date();

  return (
    <>
      <PageHeader crumbs={[{ href: "/app/projects", label: "Projects" }, { href: base, label: p.name }]} title="Workforce & site access" />
      <div className="metrics">
        <Metric label="On site now" value={here.length} note={`${new Set(here.map((e) => d.workers.find((w) => w.id === e.workerId)?.contractorId)).size} companies`} />
        <Metric label="Can't sign in" value={blocked.length} note="Exact requirement shown below" tone={blocked.length ? "amber" : undefined} />
        <Metric label="Companies engaged" value={companies.length} />
      </div>
      <section className="card">
        <div className="card-head"><h2>Site register &amp; eligibility</h2><div className="spacer" /><span className="small muted">A check-in is attendance, not an approved timesheet</span></div>
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Worker</th><th>Company</th><th>On site</th><th>Requirements</th></tr></thead>
            <tbody>
              {rows.sort((a, b) => Number(a.r.eligible) - Number(b.r.eligible)).map(({ w, r, inAt }) => {
                const issues = r.reqs.filter((x) => x.severity !== "ok");
                return (
                  <tr key={w.id} id={w.id}>
                    <td style={{ fontWeight: 600 }}>{w.name}</td>
                    <td className="small">{contractor(w.contractorId)?.tradingName}</td>
                    <td className="small">{inAt ? <StatusBadge status="current" label={`In ${new Date(inAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`} /> : <span className="muted">Not on site</span>}</td>
                    <td className="small">
                      {issues.length === 0 ? <StatusBadge status="verified" label="All requirements met" /> : (
                        <div className="row wrap" style={{ gap: 6 }}>
                          {issues.map((x, i) => <StatusBadge key={i} status={x.severity === "blocking" ? "rejected" : "expiring"} label={`${x.label} — ${x.detail}`} />)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Contractor compliance</h2></div>
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Company</th><th>Trade</th><th>Public liability</th><th>Workers comp</th></tr></thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.tradingName}<div className="muted small">ABN {c.abn}</div></td>
                  <td className="small">{c.trade}</td>
                  {c.insurances.map((ins) => {
                    const days = daysBetween(today, new Date(ins.expires));
                    return <td key={ins.type}><StatusBadge status={days < 0 ? "expired" : days <= 30 ? "expiring" : "verified"} label={days < 0 ? `Expired ${dayMonth(ins.expires)}` : days <= 30 ? `Expires ${dayMonth(ins.expires)}` : `Current to ${dayMonth(ins.expires)}`} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
