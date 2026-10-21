import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { loadProject } from "@/lib/server/load";
import { db, getUser, listVariations, projectCommercial } from "@/lib/server/store";
import { can, VARIATION_APPROVAL_LIMIT } from "@/lib/domain/permissions";
import { sum } from "@/lib/domain/workflows";
import { Metric, PageHeader, SampleTag, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { variationAction } from "@/app/actions";
import { dayMonth, money, pct } from "@/lib/format";

export const metadata = { title: "Commercial & finance" };

export default async function Commercial({ params }: { params: Promise<{ id: string }> }) {
  const { user, project: p } = await loadProject(params);
  const c = projectCommercial(user, p.id);
  // Enforced on the server: roles without commercial access get a 404, not a hidden button.
  if (!c) notFound();
  const base = `/app/projects/${p.id}`;
  const lines = db().budgetLines.filter((l) => l.projectId === p.id);
  const variations = listVariations(user, p.id);
  const claims = db().claims.filter((x) => x.projectId === p.id);
  const limit = VARIATION_APPROVAL_LIMIT[user.role];

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/app/projects", label: "Projects" }, { href: base, label: p.name }]}
        title={<span className="row" style={{ gap: 12 }}>Commercial &amp; finance <SampleTag /></span>}
        meta={<span>All figures excl. GST. Your variation approval limit: <b>{limit === undefined ? "none" : Number.isFinite(limit) ? money(limit) : "unlimited"}</b></span>}
      />
      <div className="metrics">
        <Metric label="Original contract" value={money(c.originalContract, { compact: true })} />
        <Metric label="Approved variations" value={money(c.approvedVariations, { compact: true, sign: true })} />
        <Metric label="Approved contract value" value={money(c.revisedContract, { compact: true })} />
        <Metric label="Committed costs" value={money(c.committed, { compact: true })} note={`${pct((c.committed / c.forecastFinalCost) * 100, 0)} of forecast`} />
        <Metric label="Actual costs" value={money(c.actual, { compact: true })} />
        <Metric label="Forecast final cost" value={money(c.forecastFinalCost, { compact: true })} />
        <Metric label="Forecast gross margin" value={pct(c.forecastMarginPct)} note={money(c.forecastMargin, { compact: true })} tone={c.forecastMargin < 0 ? "red" : undefined} />
        <Metric label="Variation exposure" value={money(c.variationExposure, { compact: true })} note="Unapproved — not in contract value" tone="amber" />
      </div>
      <p className="small muted" style={{ marginTop: -8 }}>Margin = approved contract value − forecast final cost, before company overheads. Unapproved variations never increase the contract sum; they appear only as exposure.</p>

      <section className="card" id="variations">
        <div className="card-head"><h2>Variations</h2><div className="spacer" /><span className="small muted">Draft → Submitted → Under review → Approved / Rejected → In claim</span></div>
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Ref</th><th>Description</th><th>Raised</th><th className="right">Proposed</th><th className="right">Approved</th><th>Status</th><th style={{ minWidth: 230 }}>Action</th></tr></thead>
            <tbody>
              {variations.map((v) => (
                <tr key={v.id} id={v.id}>
                  <td className="mono">{v.ref}</td>
                  <td>{v.title}<div className="muted small">{v.reason}</div></td>
                  <td className="small">{dayMonth(v.raisedAt)}</td>
                  <td className="num">{money(v.amount)}</td>
                  <td className="num">{v.approvedAmount !== undefined ? money(v.approvedAmount) : "—"}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td>
                    {(v.status === "submitted" || v.status === "under_review") && can(user, "variation.approve") ? (
                      <ActionForm action={variationAction} className="stack" style={{ gap: 6 }} confirmFor="approve" confirm={`Approve ${v.ref} for ${money(v.amount)}? This updates the approved contract value.`}>
                        <input type="hidden" name="variationId" value={v.id} />
                        <input name="reason" className="input" placeholder="Reason (to reject)" style={{ height: 32 }} />
                        <div className="row">
                          <SubmitButton name="type" value="approve" pendingLabel="Approving…">Approve</SubmitButton>
                          <SubmitButton name="type" value="reject" className="btn btn-danger" pendingLabel="Rejecting…">Reject</SubmitButton>
                        </div>
                      </ActionForm>
                    ) : v.status === "approved" && can(user, "variation.approve") ? (
                      <ActionForm action={variationAction}>
                        <input type="hidden" name="variationId" value={v.id} />
                        <SubmitButton name="type" value="include_in_claim" className="btn" pendingLabel="Saving…">Include in next claim</SubmitButton>
                      </ActionForm>
                    ) : (
                      <span className="small muted">{v.approvedBy ? `Approved by ${getUser(v.approvedBy)?.name}` : "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Budget by cost code</h2></div>
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Code</th><th>Description</th><th className="right">Budget</th><th className="right">Committed</th><th className="right">Actual</th><th className="right">Forecast final</th><th className="right">Variance</th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const v = l.originalBudget - l.forecastFinal;
                return (
                  <tr key={l.id}>
                    <td className="mono">{l.costCode}</td><td>{l.description}</td>
                    <td className="num">{money(l.originalBudget)}</td><td className="num">{money(l.committed)}</td><td className="num">{money(l.actual)}</td>
                    <td className="num">{money(l.forecastFinal)}</td><td className={`num ${v < 0 ? "red-text" : ""}`}>{money(v, { sign: true })}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td /><td>Total</td><td className="num">{money(c.budget)}</td><td className="num">{money(c.committed)}</td><td className="num">{money(c.actual)}</td><td className="num">{money(c.forecastFinalCost)}</td><td className="num">{money(c.budget - c.forecastFinalCost, { sign: true })}</td></tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Progress claims</h2><div className="spacer" /><span className="small muted">Submitted, certified and paid are tracked separately</span></div>
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Ref</th><th>Period end</th><th>Due</th><th className="right">Claimed</th><th className="right">Certified</th><th className="right">Paid</th><th>Status</th></tr></thead>
            <tbody>
              {claims.map((x) => (
                <tr key={x.id}>
                  <td className="mono">{x.ref}</td><td className="small">{dayMonth(x.periodEnd)}</td>
                  <td className={`small ${new Date(x.dueDate) < new Date() && x.status !== "paid" ? "amber-text" : ""}`}>{dayMonth(x.dueDate)}</td>
                  <td className="num">{money(x.claimed)}</td><td className="num">{x.certified !== undefined ? money(x.certified) : "—"}</td><td className="num">{x.paid !== undefined ? money(x.paid) : "—"}</td>
                  <td><StatusBadge status={x.status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3}>Total</td><td className="num">{money(sum(claims, (x) => x.claimed))}</td><td className="num">{money(sum(claims, (x) => x.certified ?? 0))}</td><td className="num">{money(sum(claims, (x) => x.paid ?? 0))}</td><td /></tr></tfoot>
          </table>
        </div>
      </section>
      <div className="notice notice-warn"><AlertTriangle size={16} aria-hidden /><span>A completed task or signed ITP doesn&apos;t automatically entitle a contractor to payment. Security-of-payment deadlines need specialist legal review before they&apos;re automated.</span></div>
    </>
  );
}
