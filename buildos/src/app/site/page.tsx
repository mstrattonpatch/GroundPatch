import Link from "next/link";
import { Camera, ChevronRight, ClipboardCheck, Clock, Lock, NotebookPen, QrCode } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { db, listProjects, onSiteNow, overdueDefects } from "@/lib/server/store";
import { SiteTabs } from "@/components/site-tabs";
import { longToday } from "@/lib/format";

export default async function SiteToday() {
  const user = await requireUser();
  const p = listProjects(user)[0];
  const d = db();
  const itps = d.itps.filter((i) => i.projectId === p.id);
  const todays = itps.flatMap((i) => i.points.filter((pt) => pt.status === "submitted" || (pt.status === "pending" && pt.type !== "test")).slice(0, 1).map((pt) => ({ i, pt })));
  return (
    <>
      <header className="site-hero">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Link href={`/app/projects/${p.id}`} className="pill">{p.name} ▾</Link>
          <span className="small row" style={{ gap: 6, color: "#b9cac2" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "#5fd39f" }} />Synced</span>
        </div>
        <p className="small" style={{ marginTop: 14, color: "#b9cac2" }}>{longToday()} · {p.weather}</p>
        <h1 style={{ fontSize: 26, color: "#fff" }}>Today on site</h1>
        <div className="site-stats">
          <div><b>{onSiteNow(p.id).length}</b><span>On site</span></div>
          <div><b>{todays.length}</b><span>Inspections</span></div>
          <div><b style={{ color: "#f1b56b" }}>{overdueDefects(user, p.id).length}</b><span>Overdue</span></div>
        </div>
      </header>
      <div className="site-body">
        <div className="big-actions">
          <Link href="/site/defect" className="big-action primary"><Camera size={22} aria-hidden />Raise defect</Link>
          <Link href={`/app/projects/${p.id}/quality#inspections`} className="big-action"><ClipboardCheck size={22} aria-hidden />Inspect</Link>
          <Link href="/site/sign-in" className="big-action"><QrCode size={22} aria-hidden />Site sign-in</Link>
          <Link href={`/app/projects/${p.id}/diary`} className="big-action"><NotebookPen size={22} aria-hidden />Site diary</Link>
        </div>
        <div className="label">Inspections today</div>
        <div className="list-card">
          {todays.map(({ i, pt }) => (
            <Link key={i.id + pt.id} href={`/app/projects/${p.id}/quality/itp/${i.id}`}>
              <span className="li-icon" style={{ background: pt.type === "hold" ? "var(--red-tint)" : "var(--blue-tint)", color: pt.type === "hold" ? "var(--red)" : "var(--blue)" }}>
                {pt.type === "hold" ? <Lock size={18} aria-hidden /> : <Clock size={18} aria-hidden />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontSize: 15 }}>{pt.type === "hold" ? `${i.title.split("—")[0].trim()} ${pt.name.toLowerCase()}` : i.title.split("·")[0].trim()}</b>
                <span className="muted small">{i.ref} · {pt.type === "hold" ? "Hold point" : pt.type} · {pt.status === "submitted" ? "awaiting release" : "to do"}</span>
              </span>
              <ChevronRight size={18} className="muted" aria-hidden />
            </Link>
          ))}
        </div>
      </div>
      <SiteTabs />
    </>
  );
}
