import Link from "next/link";
import { ClipboardCheck, Download, X } from "lucide-react";
import { loadProject } from "@/lib/server/load";
import { awaitingSignOff, contractor, db, openDefects, overdueDefects } from "@/lib/server/store";
import { defectFacets, filterDefects, locationLabel, type DefectFilters } from "@/lib/server/registers";
import { can } from "@/lib/domain/permissions";
import { isOverdue } from "@/lib/domain/workflows";
import { EmptyState, Metric, PageHeader, StatusBadge } from "@/components/ui";
import { dueLabel } from "@/lib/format";

export const metadata = { title: "Quality & inspections" };

export default async function Quality({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<DefectFilters> }) {
  const { user, project: p } = await loadProject(params);
  const f = await searchParams;
  const base = `/app/projects/${p.id}`;
  const rows = filterDefects(user, p.id, f);
  const facets = defectFacets(user, p.id);
  const signoff = awaitingSignOff(p.id);
  const itps = db().itps.filter((i) => i.projectId === p.id);
  const points = itps.flatMap((i) => i.points);
  const itpRate = points.length ? Math.round((points.filter((x) => x.status === "released").length / points.length) * 100) : 0;
  const now = new Date();
  const qs = (patch: Partial<DefectFilters>) => {
    const next = new URLSearchParams(Object.entries({ ...f, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = next.toString();
    return s ? `?${s}` : "?";
  };
  const active = (Object.entries(f) as [keyof DefectFilters, string][]).filter(([, v]) => v);
  const chipLabel = (k: keyof DefectFilters, v: string) =>
    k === "contractor" ? contractor(v)?.tradingName : k === "level" ? `Level ${v.replace("L", "")}` : k === "trade" ? `Trade: ${v}` : k === "status" ? `Status: ${v.replace(/_/g, " ")}` : `“${v}”`;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/app/projects", label: "Projects" }, { href: base, label: p.name }]}
        title="Quality & inspections"
        actions={
          <>
            <a className="btn" href={`${base}/quality/export${qs({}).replace(/^\?$/, "")}`}><Download size={15} aria-hidden /> Export register</a>
            {can(user, "defect.create") && <Link className="btn btn-dark" href={`${base}/quality/defects/new`}>New defect</Link>}
          </>
        }
      />

      <div className="metrics">
        <Metric label="Open defects" value={openDefects(user, p.id).length} href={`${base}/quality?status=open`} />
        <Metric label="Overdue defects" value={overdueDefects(user, p.id).length} tone="amber" note="Past due date" href={`${base}/quality?status=overdue`} />
        <Metric label="Awaiting approval" value={signoff.total} note="Inspections & verifications" href={`${base}/quality?status=ready_for_verification`} />
        <Metric label="ITP completion" value={`${itpRate}%`} note={`${points.filter((x) => x.status === "released").length} of ${points.length} points released`} />
        <Metric label="Hold points blocking" value={signoff.holdsBlocking.length} tone={signoff.holdsBlocking.length ? "red" : undefined} note="Work must not proceed" href="#inspections" />
      </div>

      <section className="card">
        <div className="card-head" style={{ flexWrap: "wrap" }}>
          <h2>Defect register</h2>
          <span className="muted small">{rows.length} shown</span>
          <div className="spacer" />
          <div className="row wrap" style={{ gap: 6 }}>
            {active.map(([k, v]) => (
              <Link key={k} className="chip" href={`${base}/quality${qs({ [k]: undefined })}`} aria-label={`Remove filter ${chipLabel(k, v)}`}>
                {chipLabel(k, v)} <X size={13} aria-hidden />
              </Link>
            ))}
          </div>
        </div>
        <form className="row wrap" style={{ padding: "0 20px 14px", gap: 8 }}>
          <label className="sr-only" htmlFor="fq">Search</label>
          <input id="fq" name="q" defaultValue={f.q} className="input" placeholder="Search ID or title" style={{ width: 200, height: 34 }} />
          <FilterSelect name="level" label="Level" value={f.level} options={facets.levels.map((l) => [l, l])} />
          <FilterSelect name="trade" label="Trade" value={f.trade} options={facets.trades.map((t) => [t, t])} />
          <FilterSelect name="contractor" label="Contractor" value={f.contractor} options={facets.contractors.map((c) => [c.id, c.tradingName])} />
          <FilterSelect name="status" label="Status" value={f.status} options={[["open", "All open"], ["overdue", "Overdue"], ["assigned", "Assigned"], ["rectifying", "Rectifying"], ["ready_for_verification", "In review"], ["closed", "Closed"]]} />
          <button className="btn" type="submit" style={{ height: 34 }}>+ Filter</button>
        </form>
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No defects match" body="Try removing a filter, or raise a new defect from site in a few seconds." action={<Link className="btn" href={`${base}/quality`}>Clear filters</Link>} />
        ) : (
          <div className="table-wrap">
            <table className="register">
              <thead>
                <tr><th>ID</th><th>Title</th><th>Location</th><th>Contractor</th><th>Due</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const late = isOverdue(d, now);
                  return (
                    <tr key={d.id}>
                      <td><Link className="mono link" href={`${base}/quality/defects/${d.id}`}>{d.ref}</Link></td>
                      <td><Link className="rowlink" href={`${base}/quality/defects/${d.id}`}>{d.title}</Link><div className="muted small">{d.trade} · {d.priority} priority</div></td>
                      <td className="small">{locationLabel(d)}</td>
                      <td className="small">{contractor(d.contractorId)?.tradingName ?? <span className="muted">Unassigned</span>}</td>
                      <td className={`small ${late ? "amber-text" : ""}`} style={{ fontWeight: late ? 700 : 400, whiteSpace: "nowrap" }}>{dueLabel(d.dueDate)}</td>
                      <td>{late ? <StatusBadge status="overdue" /> : <StatusBadge status={d.status} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" id="inspections">
        <div className="card-head"><h2>Inspection & test plans</h2><div className="spacer" /><span className="small muted">From company templates</span></div>
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Ref</th><th>Title</th><th>Points</th><th>Hold points</th><th>Status</th></tr></thead>
            <tbody>
              {itps.map((i) => {
                const holds = i.points.filter((x) => x.type === "hold");
                const open = holds.filter((x) => x.status !== "released");
                const rejected = i.points.some((x) => x.status === "rejected");
                const submitted = i.points.some((x) => x.status === "submitted");
                return (
                  <tr key={i.id}>
                    <td><Link className="mono link" href={`${base}/quality/itp/${i.id}`}>{i.ref}</Link></td>
                    <td><Link className="rowlink" href={`${base}/quality/itp/${i.id}`}>{i.title}</Link><div className="muted small">Template v{i.templateVersion}</div></td>
                    <td className="small">{i.points.filter((x) => x.status === "released").length} / {i.points.length} released</td>
                    <td>{holds.length === 0 ? <span className="muted small">—</span> : open.length ? <StatusBadge status="hold" label={`${open.length} hold`} /> : <StatusBadge status="released" />}</td>
                    <td>{rejected ? <StatusBadge status="rejected" /> : submitted ? <StatusBadge status="in_review" /> : open.length || i.points.some((x) => x.status === "pending") ? <StatusBadge status="open" /> : <StatusBadge status="complete" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="input" style={{ height: 34, width: "auto", paddingRight: 28 }}>
        <option value="">{label}: any</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
