import Link from "next/link";
import { AlertTriangle, Check, Clock, FileText, Lock } from "lucide-react";
import { loadProject } from "@/lib/server/load";
import { awaitingSignOff, db, getUser, listVariations, onSiteNow, openDefects, overdueDefects, projectCommercial, readiness } from "@/lib/server/store";
import { can } from "@/lib/domain/permissions";
import { Metric, SampleTag, StatusBadge } from "@/components/ui";
import { Gantt, GanttKey } from "@/components/gantt";
import { dayMonth, money, shortDate } from "@/lib/format";

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { user, project: p } = await loadProject(params);
  const d = db();
  const base = `/app/projects/${p.id}`;
  const showMoney = can(user, "commercial.view");
  const c = projectCommercial(user, p.id);
  const open = openDefects(user, p.id);
  const overdue = overdueDefects(user, p.id);
  const signoff = awaitingSignOff(p.id);
  const here = onSiteNow(p.id);
  const companies = new Set(here.map((e) => d.workers.find((w) => w.id === e.workerId)?.contractorId)).size;
  const tasks = d.tasks.filter((t) => t.projectId === p.id);
  const milestone = tasks.filter((t) => t.isMilestone && t.status !== "complete").sort((a, b) => a.forecastStart.localeCompare(b.forecastStart))[0];
  const ready = milestone ? readiness(p.id, milestone.id) : null;
  const nextClaim = d.claims.filter((x) => x.projectId === p.id && x.status === "draft").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const diary = d.diary.find((x) => x.projectId === p.id);
  const budgetVariance = c ? c.budget - c.forecastFinalCost : 0;

  // "What needs my attention today" — assembled from every module.
  type Attn = { tone: "red" | "amber" | "blue"; icon: "lock" | "warn" | "clock" | "doc"; body: React.ReactNode; cta: string; href: string };
  const attn: Attn[] = [];
  for (const { itp, point } of signoff.points.filter((x) => x.point.type === "hold")) {
    const t = tasks.find((t) => t.id === itp.taskId);
    attn.push({ tone: "red", icon: "lock", body: <><b>{itp.ref} {point.name.toLowerCase()} hold point</b> not released{t ? ` — ${t.name.toLowerCase()} is ${shortDate(t.forecastStart)}` : ""}</>, cta: "Review", href: `${base}/quality/itp/${itp.id}` });
  }
  for (const v of listVariations(user, p.id).filter((v) => v.status === "under_review" || v.status === "submitted")) {
    attn.push({ tone: "amber", icon: "warn", body: <><b>{v.ref} {v.title}</b> · {money(v.amount)} awaiting your approval</>, cta: "Approve", href: `${base}/commercial#${v.id}` });
  }
  const overdueByTrade = Object.entries(Object.groupBy(overdue, (x) => x.trade));
  for (const [trade, list] of overdueByTrade) {
    attn.push({ tone: "amber", icon: "warn", body: <><b>{list!.length} {trade.toLowerCase()} defect{list!.length > 1 ? "s" : ""}</b> overdue</>, cta: "Open", href: `${base}/quality?status=overdue&trade=${encodeURIComponent(trade)}` });
  }
  for (const s of d.swms.filter((s) => s.projectId === p.id && s.status === "approved")) {
    const crew = d.workers.filter((w) => w.contractorId === s.contractorId && w.inductedProjectIds.includes(p.id));
    const missing = crew.filter((w) => !s.acknowledgedBy.includes(w.id)).length;
    if (missing) attn.push({ tone: "blue", icon: "clock", body: <><b>SWMS · {s.title} v{s.version}</b> needs worker acknowledgement ({missing})</>, cta: "Chase", href: `${base}/safety#${s.id}` });
  }
  for (const doc of d.documents.filter((x) => x.projectId === p.id && x.status === "in_review")) {
    attn.push({ tone: "blue", icon: "doc", body: <><b>{doc.number} rev {doc.revision}</b> uploaded — review before it becomes current</>, cta: "Review", href: `${base}/documents` });
  }
  const icons = { lock: Lock, warn: AlertTriangle, clock: Clock, doc: FileText };

  const readyCount = ready?.items.filter((i) => i.state === "ready").length ?? 0;
  const blocking = ready?.items.filter((i) => i.state === "blocking").length ?? 0;
  const action = ready?.items.filter((i) => i.state === "action").length ?? 0;
  const pm = getUser(p.pmId);

  return (
    <>
      <section className="card card-pad">
        <div className="page-header">
          <div>
            <div className="row wrap" style={{ gap: 10 }}>
              <h1>{p.name}</h1>
              <span className="badge badge-green"><span style={{ width: 7, height: 7, borderRadius: 4, background: "var(--green)" }} />{p.status === "construction" ? "Construction" : p.status}</span>
              <SampleTag />
            </div>
            <div className="page-meta">
              <span>{p.address}</span>
              <span>Client: <b>{p.client}</b></span>
              <span>PM: <b>{pm?.name}</b></span>
              {showMoney && c && <span>Contract: <b>{money(c.revisedContract, { compact: true })}</b></span>}
              <span>PC: <b>{new Date(p.pcDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</b></span>
            </div>
          </div>
          <div className="row wrap">
            <Link className="btn" href={`${base}/reports`}>Weekly report</Link>
            <Link className="btn btn-dark" href={`${base}/diary`}>Today&apos;s site diary</Link>
          </div>
        </div>
      </section>

      <div className="metrics">
        <Metric label="Programme" value={`${p.verifiedProgress}%`} note={`${p.plannedProgress}% planned`} tone={p.plannedProgress > p.verifiedProgress ? "amber" : undefined} href={`${base}/programme`} />
        <Metric label="Open defects" value={open.length} note={`${overdue.length} overdue`} tone={overdue.length ? "amber" : undefined} href={`${base}/quality`} />
        <Metric label="Awaiting sign-off" value={signoff.total} note={`${signoff.holdsBlocking.length} hold point${signoff.holdsBlocking.length === 1 ? "" : "s"}`} tone={signoff.holdsBlocking.length ? "red" : undefined} href={`${base}/quality`} />
        <Metric label="On site now" value={here.length} note={`${companies} companies`} href={`${base}/workforce`} />
        {showMoney && c && <Metric label="Budget variance" value={money(budgetVariance, { compact: true, sign: true })} note="Budget − forecast final cost" href={`${base}/commercial`} />}
        {showMoney && <Metric label="Next claim" value={nextClaim?.ref ?? "—"} note={nextClaim ? `Due ${dayMonth(nextClaim.dueDate)}` : "None drafted"} href={`${base}/commercial`} />}
      </div>

      <div className="po-grid">
        <section className="card">
          <div className="card-head"><h2>Needs your attention today</h2><div className="spacer" /><span className="small muted">{attn.length} items</span></div>
          <div className="card-body stack" style={{ gap: 8 }}>
            {attn.length === 0 && <p className="muted">Nothing needs you right now.</p>}
            {attn.map((a, i) => {
              const Icon = icons[a.icon];
              return (
                <Link key={i} href={a.href} className="attn" data-tone={a.tone === "red" ? "red" : undefined}>
                  <Icon size={16} className="attn-icon" aria-hidden color={a.tone === "red" ? "var(--red)" : a.tone === "amber" ? "var(--amber)" : "var(--blue)"} />
                  <span>{a.body}</span>
                  <span className="attn-cta">{a.cta}</span>
                </Link>
              );
            })}
          </div>
        </section>

        {ready && (
          <section className="card">
            <div className="card-head">
              <h2>Readiness · {ready.task.name}</h2>
              <div className="spacer" />
              <span className="small muted">{shortDate(ready.task.forecastStart)}</span>
            </div>
            <div className="card-body">
              <div className="seg" aria-hidden>
                <span style={{ flex: readyCount, background: "var(--green)" }} />
                <span style={{ flex: action, background: "var(--amber)" }} />
                <span style={{ flex: blocking, background: "var(--red)" }} />
              </div>
              <p className="small muted" style={{ margin: "8px 0 4px" }}>
                {readyCount} of {ready.items.length} ready · {action} need{action === 1 ? "s" : ""} action · {blocking} blocking
              </p>
              {ready.items.map((it, i) => (
                <Link key={i} href={it.href ?? "#"} className="ready-row">
                  <span>{it.label}</span>
                  <span className={`state ${it.state === "ready" ? "green-text" : it.state === "blocking" ? "red-text" : "amber-text"}`}>
                    {it.state === "ready" ? <Check size={14} aria-hidden /> : it.state === "blocking" ? <Lock size={13} aria-hidden /> : <AlertTriangle size={13} aria-hidden />}
                    {it.state === "blocking" ? "Blocking" : it.detail}
                  </span>
                </Link>
              ))}
              <p className="small muted" style={{ marginTop: 10 }}>Readiness shows the facts. Authorising the pour stays with the responsible person.</p>
            </div>
          </section>
        )}
      </div>

      <div className="po-grid">
        <section className="card">
          <div className="card-head"><h2>Two-week lookahead</h2><div className="spacer" /><Link className="link small" href={`${base}/programme`}>Open programme →</Link></div>
          <div className="card-body">
            <Gantt tasks={tasks.filter((t) => t.status !== "complete")} />
            <GanttKey />
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2>Latest site diary</h2><div className="spacer" />{diary && <span className="small muted">{shortDate(diary.date)}</span>}</div>
          <div className="card-body">
            {diary ? (
              <>
                <div className="row wrap small muted" style={{ gap: 16, marginBottom: 8 }}>
                  <span>{diary.weather}</span><span>{diary.workersOnSite} workers</span><span>{diary.companiesOnSite} companies</span>
                  {diary.submitted && <StatusBadge status="submitted" />}
                </div>
                <p>{diary.notes} {diary.delays && <>Minor delay: {diary.delays.toLowerCase()}</>}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
                  <div className="photo-ph" /><div className="photo-ph" /><div className="photo-ph" style={{ background: "#dfe5e1", color: "var(--muted)" }}>+9 photos</div>
                </div>
              </>
            ) : (
              <p className="muted">No diary yet. <Link className="link" href={`${base}/diary`}>Start today&apos;s entry</Link></p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
