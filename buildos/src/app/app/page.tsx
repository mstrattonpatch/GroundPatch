import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { awaitingSignOff, db, listProjects, onSiteNow, openDefects, overdueDefects, projectCommercial } from "@/lib/server/store";
import { complianceExpiring, myTasks, recentActivity } from "@/lib/server/insights";
import { can } from "@/lib/domain/permissions";
import { sum } from "@/lib/domain/workflows";
import { Metric, PageHeader, SampleTag } from "@/components/ui";
import { dayMonth, longToday, money, pct, timeAgo } from "@/lib/format";
import { TaskList } from "@/components/task-list";

export const metadata = { title: "Company overview" };

export default async function ControlCentre() {
  const user = await requireUser();
  const d = db();
  const projects = listProjects(user);
  const showMoney = can(user, "commercial.view");
  const signoff = awaitingSignOff();
  const compliance = complianceExpiring(30);
  const swmsToReview = d.swms.filter((s) => s.status === "submitted" || s.status === "in_review").length;
  const outstandingClaims = d.claims.filter((c) => ["submitted", "assessed", "certified"].includes(c.status));
  const owed = (c: (typeof outstandingClaims)[number]) => (c.certified ?? c.claimed) - (c.paid ?? 0);
  const pastDue = outstandingClaims.filter((c) => new Date(c.dueDate) < new Date());
  const positions = projects.map((p) => ({ p, c: projectCommercial(user, p.id) }));
  const totals = positions.reduce(
    (a, { c }) => (c ? { orig: a.orig + c.originalContract, appr: a.appr + c.approvedVariations, comm: a.comm + c.committed, act: a.act + c.actual, exp: a.exp + c.variationExposure } : a),
    { orig: 0, appr: 0, comm: 0, act: 0, exp: 0 },
  );

  return (
    <>
      <PageHeader
        title={<span className="row" style={{ gap: 12 }}>Company overview <SampleTag /></span>}
        meta={<span>{longToday()} · {projects.length} active projects</span>}
        actions={
          <>
            <Link className="btn" href="/app/reports">Export</Link>
            <Link className="btn btn-dark" href="/app/projects">New project</Link>
          </>
        }
      />

      <div className="metrics">
        <Metric label="Workers on site now" value={onSiteNow().length} note={`${compliance.filter((c) => c.days <= 14).length} compliance warnings`} tone="amber" href="/app/people" />
        <Metric label="Open defects" value={openDefects(user).length} note={`${overdueDefects(user).length} overdue`} tone="amber" href="/app/reports?view=defects" />
        <Metric label="Awaiting sign-off" value={signoff.total} note={`${signoff.holdsBlocking.length} hold points blocking`} tone="red" href="/app/tasks" />
        <Metric label="Safety actions" value={swmsToReview} note={`${swmsToReview} SWMS to review`} href="/app/tasks" />
        {showMoney && (
          <Metric label="Claims outstanding" value={money(sum(outstandingClaims, owed), { compact: true })} note={`${money(sum(pastDue, owed), { compact: true })} past due date`} />
        )}
      </div>

      <div className="cc-grid">
        <div className="stack-lg" style={{ minWidth: 0 }}>
          <section className="card">
            <div className="card-head">
              <h2>Portfolio</h2>
              <div className="spacer" />
              <span className="row small muted" style={{ gap: 14 }}>
                <span className="row" style={{ gap: 5 }}><i className="key" style={{ background: "#c9cfc8" }} /> Planned</span>
                <span className="row" style={{ gap: 5 }}><i className="key" style={{ background: "var(--green)" }} /> Verified on site</span>
              </span>
            </div>
            <div className="table-wrap">
              <table className="register">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th style={{ minWidth: 170 }}>Progress</th>
                    {showMoney && <th className="right">Contract</th>}
                    {showMoney && <th className="right">Forecast cost</th>}
                    {showMoney && <th className="right">Margin</th>}
                    <th>Next milestone</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map(({ p, c }) => {
                    const behind = p.plannedProgress - p.verifiedProgress;
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link className="rowlink" href={`/app/projects/${p.id}`}>{p.name}</Link>
                          <div className="muted small"><span className="mono" style={{ fontSize: 12 }}>{p.code}</span> · {p.type}</div>
                        </td>
                        <td>
                          <div className="bar" style={{ marginTop: 6 }}>
                            <span className="planned" style={{ width: `${p.plannedProgress}%` }} />
                            <span className="actual" style={{ width: `${p.verifiedProgress}%` }} />
                          </div>
                          <div className={`small ${behind > 0 ? "amber-text" : "green-text"}`} style={{ marginTop: 5 }}>
                            {p.verifiedProgress}% verified · {behind > 0 ? `${behind}% behind` : "on track"}
                          </div>
                        </td>
                        {showMoney && c && <td className="num">{money(c.revisedContract, { compact: true })}</td>}
                        {showMoney && c && <td className={`num ${c.forecastFinalCost > c.revisedContract ? "red-text" : ""}`}>{money(c.forecastFinalCost, { compact: true })}</td>}
                        {showMoney && c && <td className={`num ${c.forecastMarginPct < 0 ? "red-text" : ""}`}>{pct(c.forecastMarginPct)}</td>}
                        <td className="small">{p.nextMilestone.name} · {dayMonth(p.nextMilestone.date)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {showMoney && (
              <p className="small muted" style={{ padding: "10px 20px 14px", borderTop: "1px solid var(--border)" }}>
                Margin = contract incl. approved variations − forecast final cost, before overheads. Unapproved variations are shown separately as exposure.
              </p>
            )}
          </section>

          <div className="two-col">
            {showMoney && (
              <section className="card">
                <div className="card-head"><h2>Commercial position</h2></div>
                <div className="card-body">
                  <dl className="kv">
                    <dt>Original contracts</dt><dd>{money(totals.orig, { compact: true })}</dd>
                    <dt>Approved variations</dt><dd>{money(totals.appr, { compact: true, sign: true })}</dd>
                    <dt>Committed costs</dt><dd>{money(totals.comm, { compact: true })}</dd>
                    <dt>Actual costs to date</dt><dd>{money(totals.act, { compact: true })}</dd>
                  </dl>
                  <div className="row amber-text small" style={{ marginTop: 12, fontWeight: 600 }}>
                    <AlertTriangle size={14} aria-hidden /> Variation exposure (unapproved)
                    <span className="spacer" /><span className="mono">{money(totals.exp, { compact: true })}</span>
                  </div>
                </div>
              </section>
            )}
            <section className="card">
              <div className="card-head"><h2>Compliance expiring</h2><div className="spacer" /><Link className="link small" href="/app/people">View all</Link></div>
              <div className="card-body stack" style={{ gap: 10 }}>
                {compliance.slice(0, 4).map((c, i) => (
                  <Link key={i} href={c.href} className="row" style={{ alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.who} — {c.what}</div>
                      <div className="muted small">{c.sub}</div>
                    </div>
                    <span className="spacer" />
                    <span className={`badge ${c.days < 0 ? "badge-red" : "badge-amber"}`}>{c.days < 0 ? "Expired" : `${c.days} days`}</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="stack-lg">
          <section className="card">
            <div className="card-head"><h2>My tasks</h2><div className="spacer" /><span className="small muted">{myTasks(user).length} open</span></div>
            <div className="card-body">
              <TaskList items={myTasks(user).slice(0, 4)} />
              <Link className="link small" href="/app/tasks" style={{ display: "inline-block", marginTop: 12 }}>See all tasks →</Link>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Recent activity</h2></div>
            <div className="card-body">
              <ul className="timeline">
                {recentActivity(6).map((a) => (
                  <li key={a.id}>
                    <span className={`dot ${/fail|reject/i.test(a.action) ? "red" : /released|approved|closed|verified/i.test(a.action) ? "green" : "blue"}`} />
                    <div>
                      <b style={{ fontWeight: 600 }}>{a.action}</b>{a.detail ? ` · ${a.detail}` : ""}
                      <div className="muted small">{a.project} · {timeAgo(a.at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
