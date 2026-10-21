import Link from "next/link";
import { Bell, Search, Smartphone, RotateCcw, LogOut } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { db, listProjects, openDefects } from "@/lib/server/store";
import { myTasks, notifications } from "@/lib/server/insights";
import { can, ROLE_LABEL } from "@/lib/domain/permissions";
import { BottomTabs, MenuCloser, ProjectSwitcher, QuickCreate, Sidebar } from "@/components/shell";
import { resetDemo, signInAs, signOut } from "@/app/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const projects = listProjects(user).map((p) => ({ id: p.id, name: p.name, code: p.code }));
  const counts: Record<string, Record<string, number>> = { company: { tasks: myTasks(user).length } };
  for (const p of projects) counts[p.id] = { defects: openDefects(user, p.id).length };
  const notes = notifications(user);

  return (
    <div className="shell">
      <Sidebar projects={projects} counts={counts} showCommercial={can(user, "commercial.view")} />
      <div className="main">
        <header className="topbar">
          <ProjectSwitcher projects={projects} />
          <form className="search" action="/app/search" role="search">
            <Search size={16} aria-hidden />
            <label className="sr-only" htmlFor="q">Search</label>
            <input id="q" name="q" className="input" placeholder="Search projects, defects, drawings, workers…" />
            <kbd>⌘K</kbd>
          </form>
          <div className="spacer" />
          <QuickCreate defaultProjectId={projects[0]?.id ?? ""} canVariation={can(user, "variation.create")} />
          <details className="menu">
            <summary className="icon-btn" aria-label={`Notifications (${notes.length})`}>
              <Bell size={17} aria-hidden />
              {notes.length > 0 && <span className="pip" />}
            </summary>
            <div className="menu-panel" style={{ width: 340 }}>
              <div className="menu-label label">Notifications</div>
              {notes.map((n, i) => (
                <Link key={i} href={n.href} style={{ alignItems: "flex-start" }}>
                  <span className={`timeline-dot dot-${n.tone}`} aria-hidden style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, flex: "none", background: `var(--${n.tone === "green" ? "green" : n.tone})` }} />
                  <span><b style={{ fontWeight: 600 }}>{n.title}</b><br /><span className="muted small">{n.sub}</span></span>
                </Link>
              ))}
            </div>
          </details>
          <details className="menu">
            <summary className="avatar" aria-label="Account">{user.initials}</summary>
            <div className="menu-panel" style={{ width: 280 }}>
              <div style={{ padding: "8px 10px" }}>
                <b>{user.name}</b>
                <div className="muted small">{user.title} · {db().org.name}</div>
              </div>
              <div className="menu-label label">View as (demo)</div>
              {db().users.map((u) => (
                <form key={u.id} action={signInAs}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button className="menu-item" type="submit" aria-current={u.id === user.id}>
                    <span className="avatar" style={{ width: 26, height: 26, fontSize: 10.5 }}>{u.initials}</span>
                    <span>{ROLE_LABEL[u.role]} <span className="muted small">· {u.name}</span></span>
                  </button>
                </form>
              ))}
              <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "6px 0" }} />
              <Link href="/site"><Smartphone size={16} /> Open site app</Link>
              <form action={resetDemo}><button className="menu-item" type="submit"><RotateCcw size={16} /> Reset sample data</button></form>
              <form action={signOut}><button className="menu-item" type="submit"><LogOut size={16} /> Sign out</button></form>
            </div>
          </details>
        </header>
        <main className="content">{children}</main>
      </div>
      <BottomTabs />
      <MenuCloser />
    </div>
  );
}
