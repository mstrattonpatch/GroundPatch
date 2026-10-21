import { requireUser } from "@/lib/server/session";
import { contractor, db } from "@/lib/server/store";
import { daysBetween } from "@/lib/domain/workflows";
import { PageHeader, StatusBadge } from "@/components/ui";
import { dayMonth } from "@/lib/format";

export const metadata = { title: "People & contractors" };

export default async function People() {
  await requireUser();
  const d = db();
  const today = new Date();
  return (
    <>
      <PageHeader title="People & contractors" meta={<span>{d.contractors.length} companies · {d.workers.length} workers — one central profile, reused across projects</span>} />
      <section className="card">
        <div className="card-head"><h2>Contractors</h2></div>
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Company</th><th>Trade</th><th>Workers</th><th>Insurances</th></tr></thead>
            <tbody>
              {d.contractors.map((c) => (
                <tr key={c.id} id={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.tradingName}<div className="muted small">{c.legalName} · ABN {c.abn}</div></td>
                  <td className="small">{c.trade}</td>
                  <td className="small">{d.workers.filter((w) => w.contractorId === c.id).length}</td>
                  <td><div className="row wrap" style={{ gap: 6 }}>{c.insurances.map((ins) => {
                    const days = daysBetween(today, new Date(ins.expires));
                    return <StatusBadge key={ins.type} status={days < 0 ? "expired" : days <= 30 ? "expiring" : "verified"} label={`${ins.type} · ${days < 0 ? "expired" : dayMonth(ins.expires)}`} />;
                  })}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Worker credential wallets</h2><div className="spacer" /><span className="small muted">Uploaded ≠ verified: each credential shows its verification state</span></div>
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Worker</th><th>Company</th><th>Credentials</th></tr></thead>
            <tbody>
              {d.workers.map((w) => (
                <tr key={w.id} id={w.id}>
                  <td style={{ fontWeight: 600 }}>{w.name}</td>
                  <td className="small">{contractor(w.contractorId)?.tradingName}</td>
                  <td><div className="row wrap" style={{ gap: 6 }}>{d.credentials.filter((c) => c.workerId === w.id).map((c) => {
                    const days = c.expires ? daysBetween(today, new Date(c.expires)) : Infinity;
                    const status = days < 0 ? "expired" : c.status !== "verified" ? c.status : days <= 30 ? "expiring" : "verified";
                    return <StatusBadge key={c.id} status={status} label={`${c.type}${c.expires ? ` · ${dayMonth(c.expires)}` : ""}`} />;
                  })}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
