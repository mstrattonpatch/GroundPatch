import Link from "next/link";
import { AlertTriangle, Check, MapPin, XCircle } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { contractor, db, listProjects, onSiteNow, workerRequirements } from "@/lib/server/store";
import { ActionForm, SubmitButton } from "@/components/forms";
import { siteSignIn, siteSignOut, swmsAcknowledge, signInAs } from "@/app/actions";
import { SiteTabs } from "@/components/site-tabs";

export default async function WorkerSignIn() {
  const user = await requireUser();
  const p = listProjects(user)[0];
  if (!user.workerId) {
    return (
      <div className="site-body" style={{ paddingTop: 40 }}>
        <h1 style={{ fontSize: 24 }}>Worker sign-in</h1>
        <p className="muted">This screen is what a worker sees after scanning the gate QR code — no paid account needed.</p>
        <form action={signInAs}>
          <input type="hidden" name="userId" value="u_wkr" />
          <input type="hidden" name="next" value="/site/sign-in" />
          <button className="btn btn-primary btn-lg btn-block">View as worker (Sam)</button>
        </form>
        <Link className="link" href="/site">← Back to site app</Link>
        <SiteTabs />
      </div>
    );
  }
  const r = workerRequirements(user.workerId, p.id)!;
  const w = r.worker;
  const onSite = onSiteNow(p.id).some((e) => e.workerId === w.id);
  const unackedSwms = db().swms.filter((s) => s.projectId === p.id && s.contractorId === w.contractorId && s.status === "approved" && !s.acknowledgedBy.includes(w.id));

  return (
    <>
      <div className="site-body" style={{ paddingTop: 22 }}>
        <div>
          <div className="muted small row" style={{ gap: 4 }}><MapPin size={14} aria-hidden />{p.name} · Gate 1</div>
          <h1 style={{ fontSize: 26 }}>Hi {w.name.split(" ")[0]}</h1>
        </div>

        {unackedSwms.map((s) => (
          <div key={s.id} className="callout stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 10 }}><AlertTriangle size={22} color="var(--amber)" aria-hidden /><b style={{ fontSize: 17 }}>One step before sign-in</b></div>
            <p>Read and acknowledge the <b>{s.title} SWMS (v{s.version})</b>. It changed since you last signed it.</p>
            <details>
              <summary className="link" style={{ cursor: "pointer" }}>Read the SWMS</summary>
              <div className="small" style={{ marginTop: 8 }}>
                <p><b>Activity:</b> {s.activity}</p>
                <p><b>High-risk work:</b> {s.highRiskCategories.join(", ")}</p>
                <p><b>Key controls:</b> exclusion zone around the pump boom; spotter for truck movements; edge protection checked before pour; harness when within 2m of an open edge.</p>
              </div>
            </details>
            <ActionForm action={swmsAcknowledge}>
              <input type="hidden" name="swmsId" value={s.id} />
              <SubmitButton className="btn btn-dark btn-lg btn-block" pendingLabel="Saving…">I&apos;ve read it — acknowledge</SubmitButton>
            </ActionForm>
          </div>
        ))}

        <div className="label">Your site requirements</div>
        <div className="req-list">
          {r.reqs.map((x, i) => (
            <div key={i} className="li">
              <span>{x.label}</span>
              <b className={x.severity === "ok" ? "green-text" : x.severity === "warning" ? "amber-text" : "red-text"}>
                {x.severity === "ok" ? <Check size={14} aria-hidden /> : x.severity === "warning" ? <AlertTriangle size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}
                {x.detail}
              </b>
            </div>
          ))}
        </div>
        {r.reqs.some((x) => x.severity === "warning" && /licence/i.test(x.label)) && (
          <button className="btn btn-lg btn-block" type="button">Upload renewed licence</button>
        )}

        {onSite ? (
          <ActionForm action={siteSignOut}>
            <input type="hidden" name="projectId" value={p.id} />
            <div className="notice notice-ok" style={{ marginBottom: 10 }}><Check size={16} aria-hidden />You&apos;re signed in to site.</div>
            <SubmitButton className="btn btn-lg btn-block" pendingLabel="Signing out…">Sign out of site</SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm action={siteSignIn}>
            <input type="hidden" name="projectId" value={p.id} />
            {r.eligible ? (
              <SubmitButton className="btn btn-primary btn-lg btn-block" pendingLabel="Signing in…">Sign in to site</SubmitButton>
            ) : (
              <button className="btn btn-lg btn-block" disabled type="button">Sign in to site</button>
            )}
          </ActionForm>
        )}
        <p className="small muted" style={{ textAlign: "center" }}>No account needed · linked to {contractor(w.contractorId)?.tradingName}</p>
      </div>
      <SiteTabs />
    </>
  );
}
