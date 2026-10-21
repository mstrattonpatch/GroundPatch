"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, CalendarPlus, ClipboardCheck, DollarSign, FilePlus2, Home, LayoutGrid, ListChecks, Menu, NotebookPen, Plus, Settings } from "lucide-react";
import { companyNav, projectNav, type NavItem } from "./nav-items";
import { Logo } from "./ui";

type ProjectLite = { id: string; name: string; code: string };

function projectIdFrom(path: string): string | null {
  const m = path.match(/^\/app\/projects\/([^/]+)/);
  return m ? m[1] : null;
}

function isActive(path: string, href: string, exact: boolean) {
  return exact ? path === href : path === href || path.startsWith(href + "/");
}

function NavLink({ item, path, exact, count }: { item: NavItem; path: string; exact: boolean; count?: number }) {
  const Icon = item.icon;
  return (
    <Link className="nav" href={item.href} aria-current={isActive(path, item.href, exact) ? "page" : undefined} title={item.label}>
      <Icon size={17} aria-hidden />
      <span className="nav-text">{item.label}</span>
      {count ? <span className={`count ${item.countKey === "defects" ? "quiet" : ""}`}>{count}</span> : null}
    </Link>
  );
}

/**
 * Two-tier sidebar: company links on top; when a project is open its modules
 * replace them, so the project context never gets lost.
 */
export function Sidebar({
  projects, counts, showCommercial,
}: { projects: ProjectLite[]; counts: Record<string, Record<string, number>>; showCommercial: boolean }) {
  const path = usePathname();
  const pid = projectIdFrom(path);
  const project = projects.find((p) => p.id === pid);

  return (
    <div className="sidebar-col">
    <aside className="sidebar" aria-label="Main navigation">
      <Link href="/app" className="brand"><span className="brand-text"><Logo light /></span></Link>
      {project ? (
        <>
          <Link className="nav" href="/app" title="Company overview">
            <ArrowLeft size={16} aria-hidden /><span className="nav-text small">Company overview</span>
          </Link>
          <div className="proj-card">
            <div className="label">Project</div>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 13.5 }}>{project.name}</div>
            <div className="mono" style={{ fontSize: 11.5, color: "#8fa59b" }}>{project.code}</div>
          </div>
          {projectNav(project.id, showCommercial).map((item, i) => (
            <NavLink key={item.href} item={item} path={path} exact={i === 0} count={item.countKey ? counts[project.id]?.[item.countKey] : undefined} />
          ))}
          <div className="bottom">
            <Link className="nav" href={`/app/settings`} title="Project settings"><Settings size={17} aria-hidden /><span className="nav-text">Project settings</span></Link>
          </div>
        </>
      ) : (
        <>
          <div className="nav-label">Company</div>
          {companyNav.map((item, i) => (
            <NavLink key={item.href} item={item} path={path} exact={i === 0} count={item.countKey ? counts.company?.[item.countKey] : undefined} />
          ))}
          <div className="nav-label">Recent projects</div>
          {projects.map((p) => (
            <Link key={p.id} className="nav" href={`/app/projects/${p.id}`} title={p.name}>
              <span className="recent-dot" aria-hidden /><span className="nav-text">{p.name}</span>
            </Link>
          ))}
          <div className="bottom">
            <Link className="nav" href="/app/settings" title="Company settings"><Settings size={17} aria-hidden /><span className="nav-text">Company settings</span></Link>
          </div>
        </>
      )}
    </aside>
    </div>
  );
}

export function ProjectSwitcher({ projects }: { projects: ProjectLite[] }) {
  const path = usePathname();
  const router = useRouter();
  const pid = projectIdFrom(path) ?? "";
  return (
    <label>
      <span className="sr-only">Switch project</span>
      <select
        className="select-plain"
        value={pid}
        onChange={(e) => {
          const next = e.target.value;
          if (!next) return router.push("/app");
          // Stay on the same module when switching projects.
          const rest = pid ? path.replace(`/app/projects/${pid}`, "").replace(/\/(defects|itp)\/.*$/, "") : "";
          router.push(`/app/projects/${next}${rest}`);
        }}
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </label>
  );
}

export function BottomTabs() {
  const path = usePathname();
  const pid = projectIdFrom(path);
  const tabs = [
    { href: "/app", label: "Overview", icon: LayoutGrid, exact: true },
    { href: pid ? `/app/projects/${pid}` : "/app/projects", label: "Project", icon: Home, exact: Boolean(pid) },
    { href: pid ? `/app/projects/${pid}/quality` : "/app/projects/p_riv/quality", label: "Quality", icon: ClipboardCheck, exact: false },
    { href: "/app/tasks", label: "My tasks", icon: ListChecks, exact: false },
    { href: "/app/projects", label: "More", icon: Menu, exact: true },
  ];
  return (
    <nav className="bottom-tabs" aria-label="Primary">
      {tabs.map((t) => (
        <Link key={t.label} href={t.href} aria-current={isActive(path, t.href, t.exact) ? "page" : undefined}>
          <t.icon size={20} aria-hidden />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Close any open <details> menu when clicking elsewhere or navigating. */
export function MenuCloser() {
  const path = usePathname();
  useEffect(() => {
    document.querySelectorAll("details.menu[open]").forEach((d) => d.removeAttribute("open"));
  }, [path]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      document.querySelectorAll("details.menu[open]").forEach((d) => {
        if (!d.contains(e.target as Node)) d.removeAttribute("open");
      });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

/** "+ New" — creates in the open project, or the first project from the company view. */
export function QuickCreate({ defaultProjectId, canVariation }: { defaultProjectId: string; canVariation: boolean }) {
  const path = usePathname();
  const base = `/app/projects/${projectIdFrom(path) ?? defaultProjectId}`;
  return (
    <details className="menu">
      <summary className="btn btn-primary"><Plus size={16} aria-hidden /> <span className="hide-sm">New</span></summary>
      <div className="menu-panel">
        <div className="menu-label label">Quick create</div>
        <Link href={`${base}/quality/defects/new`}><ClipboardCheck size={16} /> Defect</Link>
        <Link href={`${base}/quality#inspections`}><FilePlus2 size={16} /> Inspection</Link>
        <Link href={`${base}/diary`}><NotebookPen size={16} /> Site diary entry</Link>
        <Link href={`${base}/programme`}><CalendarPlus size={16} /> Task</Link>
        {canVariation && <Link href={`${base}/commercial#variations`}><DollarSign size={16} /> Variation</Link>}
      </div>
    </details>
  );
}
