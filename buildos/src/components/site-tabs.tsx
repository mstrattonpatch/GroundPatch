"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, FileText, ListChecks, Plus, User } from "lucide-react";

export function SiteTabs() {
  const path = usePathname();
  const tab = (href: string, label: string, Icon: typeof User) => (
    <Link href={href} aria-current={path === href ? "page" : undefined}><Icon size={21} aria-hidden />{label}</Link>
  );
  return (
    <nav className="site-tabs" aria-label="Site app">
      {tab("/site", "Today", CalendarCheck)}
      {tab("/app/tasks", "Tasks", ListChecks)}
      <Link href="/site/defect" aria-label="Raise defect"><span className="fab"><Plus size={26} aria-hidden /></span></Link>
      {tab("/app/projects/p_riv/documents", "Drawings", FileText)}
      {tab("/site/sign-in", "Me", User)}
    </nav>
  );
}
