import Link from "next/link";
import { loadProject } from "@/lib/server/load";
import { contractor, db } from "@/lib/server/store";
import { daysBetween } from "@/lib/domain/workflows";
import { PageHeader, StatusBadge } from "@/components/ui";
import { Gantt, GanttKey } from "@/components/gantt";
import { dayMonth } from "@/lib/format";

export const metadata = { title: "Programme" };

export default async function Programme({ params }: { params: Promise<{ id: string }> }) {
  const { project: p } = await loadProject(params);
  const base = `/app/projects/${p.id}`;
  const tasks = db().tasks.filter((t) => t.projectId === p.id).sort((a, b) => a.forecastStart.localeCompare(b.forecastStart));
  const itps = db().itps;
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/app/projects", label: "Projects" }, { href: base, label: p.name }]}
        title="Programme & tasks"
        meta={<><span>Planned <b>{p.plannedProgress}%</b></span><span>Verified on site <b>{p.verifiedProgress}%</b></span><span>PC <b>{dayMonth(p.pcDate)}</b></span></>}
      />
      <section className="card">
        <div className="card-head"><h2>Six-week view</h2><div className="spacer" /><span className="small muted">Forecast vs baseline</span></div>
        <div className="card-body">
          <Gantt tasks={tasks} fromOffset={-7} days={42} />
          <GanttKey />
        </div>
      </section>
      <section className="card">
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Task</th><th>Contractor</th><th>Baseline finish</th><th>Forecast finish</th><th className="right">Slip</th><th className="right">Progress</th><th>Quality</th><th>Status</th></tr></thead>
            <tbody>
              {tasks.map((t) => {
                const slip = daysBetween(new Date(t.baselineFinish), new Date(t.forecastFinish));
                const itp = itps.find((i) => i.id === t.itpId);
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: t.isMilestone ? 700 : 500 }}>{t.isMilestone ? "◆ " : ""}{t.name}<div className="muted small">{t.trade}</div></td>
                    <td className="small">{contractor(t.contractorId)?.tradingName ?? "—"}</td>
                    <td className="small">{dayMonth(t.baselineFinish)}</td>
                    <td className="small">{dayMonth(t.forecastFinish)}</td>
                    <td className={`num ${slip > 0 ? "amber-text" : ""}`}>{slip > 0 ? `+${slip}d` : "—"}</td>
                    <td className="num">{t.progress}%</td>
                    <td className="small">{itp ? <Link className="link" href={`${base}/quality/itp/${itp.id}`}>{itp.ref}</Link> : "—"}</td>
                    <td><StatusBadge status={t.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="small muted">Physical progress, ITP sign-off and claim entitlement are tracked separately: a task can be complete while its ITP is unsigned.</p>
    </>
  );
}
