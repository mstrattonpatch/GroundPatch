import {
  BarChart3, CalendarRange, ClipboardCheck, FileText, HardHat, Home, LayoutGrid, ListChecks, NotebookPen,
  PackageCheck, Settings, ShieldCheck, Users, DollarSign, FolderKanban, type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; countKey?: string };

export const companyNav: NavItem[] = [
  { href: "/app", label: "Overview", icon: LayoutGrid },
  { href: "/app/projects", label: "Projects", icon: FolderKanban },
  { href: "/app/tasks", label: "My tasks", icon: ListChecks, countKey: "tasks" },
  { href: "/app/people", label: "People & contractors", icon: Users },
  { href: "/app/reports", label: "Reports", icon: BarChart3 },
];

export function projectNav(id: string, showCommercial: boolean): NavItem[] {
  const base = `/app/projects/${id}`;
  return [
    { href: base, label: "Overview", icon: Home },
    { href: `${base}/programme`, label: "Programme", icon: CalendarRange },
    { href: `${base}/quality`, label: "Quality", icon: ClipboardCheck, countKey: "defects" },
    { href: `${base}/safety`, label: "Safety", icon: ShieldCheck },
    { href: `${base}/workforce`, label: "Workforce & time", icon: HardHat },
    { href: `${base}/documents`, label: "Documents", icon: FileText },
    ...(showCommercial ? [{ href: `${base}/commercial`, label: "Commercial", icon: DollarSign }] : []),
    { href: `${base}/diary`, label: "Site diary", icon: NotebookPen },
    { href: `${base}/reports`, label: "Reports", icon: BarChart3 },
    { href: `${base}/handover`, label: "Handover", icon: PackageCheck },
  ];
}

export { Settings };
