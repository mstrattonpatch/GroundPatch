import "server-only";
import { db, contractor, listDefects, listVariations, projName, overdueDefects } from "./store.ts";
import { can } from "../domain/permissions.ts";
import { daysBetween } from "../domain/workflows.ts";
import type { User } from "../domain/types.ts";
import { money } from "../format.ts";

// Derived views built from shared events and records — one notification
// source rather than each module running its own alert system.

export type TaskItem = {
  id: string;
  title: string;
  sub: string;
  href: string;
  tone: "red" | "amber" | "blue";
  verb: string;
};

export function myTasks(user: User): TaskItem[] {
  const d = db();
  const out: TaskItem[] = [];
  if (can(user, "variation.approve")) {
    for (const v of listVariations(user).filter((v) => v.status === "submitted" || v.status === "under_review")) {
      out.push({ id: v.id, title: `Approve ${v.ref} · ${v.title}`, sub: `${projName(v.projectId)} · ${money(v.amount)}`, href: `/app/projects/${v.projectId}/commercial#${v.id}`, tone: "red", verb: "Approve" });
    }
  }
  if (can(user, "itp.release_hold")) {
    for (const i of d.itps) {
      for (const p of i.points.filter((p) => p.status === "submitted")) {
        out.push({ id: `${i.id}:${p.id}`, title: `${p.type === "hold" ? "Release hold point" : "Review"} · ${i.ref} ${p.name}`, sub: `${projName(i.projectId)} · ${p.evidence.length} photos attached`, href: `/app/projects/${i.projectId}/quality/itp/${i.id}`, tone: p.type === "hold" ? "red" : "blue", verb: "Review" });
      }
    }
  }
  if (can(user, "defect.verify")) {
    for (const x of listDefects(user).filter((x) => x.status === "ready_for_verification")) {
      out.push({ id: x.id, title: `Verify ${x.ref} · ${x.title}`, sub: `${projName(x.projectId)} · ${contractor(x.contractorId)?.tradingName ?? ""}`, href: `/app/projects/${x.projectId}/quality/defects/${x.id}`, tone: "blue", verb: "Verify" });
    }
  }
  if (can(user, "swms.review")) {
    for (const s of d.swms.filter((s) => s.status === "submitted" || s.status === "in_review")) {
      out.push({ id: s.id, title: `Review SWMS · ${s.title} v${s.version}`, sub: `${projName(s.projectId)} · ${contractor(s.contractorId)?.tradingName}`, href: `/app/projects/${s.projectId}/safety#${s.id}`, tone: "blue", verb: "Review" });
    }
  }
  if (can(user, "commercial.view")) {
    for (const c of d.claims.filter((c) => c.status === "submitted")) {
      out.push({ id: c.id, title: `Assess progress claim ${c.ref}`, sub: `${projName(c.projectId)} · response due ${new Date(c.dueDate).toLocaleDateString("en-AU", { weekday: "short" })}`, href: `/app/projects/${c.projectId}/commercial`, tone: "amber", verb: "Assess" });
    }
  }
  if (user.role === "subcontractor_admin") {
    for (const x of listDefects(user).filter((x) => x.status === "assigned" || x.status === "rectifying")) {
      out.push({ id: x.id, title: `Rectify ${x.ref} · ${x.title}`, sub: projName(x.projectId), href: `/app/projects/${x.projectId}/quality/defects/${x.id}`, tone: "amber", verb: "Open" });
    }
  }
  const rank = { red: 0, amber: 1, blue: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

export type ComplianceItem = { who: string; what: string; sub: string; days: number; href: string };

export function complianceExpiring(withinDays = 30): ComplianceItem[] {
  const d = db();
  const today = new Date();
  const out: ComplianceItem[] = [];
  for (const c of d.contractors) {
    for (const ins of c.insurances) {
      const days = daysBetween(today, new Date(ins.expires));
      if (days <= withinDays) out.push({ who: c.tradingName, what: ins.type, sub: "Certificate of currency", days, href: `/app/people#${c.id}` });
    }
  }
  for (const cr of d.credentials) {
    if (!cr.expires) continue;
    const days = daysBetween(today, new Date(cr.expires));
    if (days <= withinDays) {
      const w = d.workers.find((w) => w.id === cr.workerId);
      out.push({ who: w?.name ?? "Worker", what: cr.type, sub: "High-risk work licence", days, href: `/app/people#${cr.workerId}` });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

export type Notice = { title: string; sub: string; href: string; tone: "red" | "amber" | "blue" | "green" };

export function notifications(user: User): Notice[] {
  const out: Notice[] = [];
  const overdue = overdueDefects(user);
  if (overdue.length) out.push({ title: `${overdue.length} defects overdue`, sub: "Across active projects", href: "/app/reports?view=overdue", tone: "amber" });
  for (const c of complianceExpiring(14)) {
    out.push({ title: `${c.who} — ${c.what}`, sub: c.days < 0 ? "Expired" : `Expires in ${c.days} days`, href: c.href, tone: c.days < 0 ? "red" : "amber" });
  }
  for (const i of db().itps) {
    for (const p of i.points.filter((p) => p.status === "rejected")) {
      out.push({ title: `Inspection rejected · ${i.ref} ${p.name}`, sub: projName(i.projectId), href: `/app/projects/${i.projectId}/quality/itp/${i.id}`, tone: "red" });
    }
  }
  const today = new Date();
  for (const p of db().projects) {
    const days = daysBetween(today, new Date(p.nextMilestone.date));
    if (days >= 0 && days <= 7) out.push({ title: `${p.nextMilestone.name} in ${days} days`, sub: p.name, href: `/app/projects/${p.id}/programme`, tone: "blue" });
  }
  return out;
}

export function recentActivity(limit = 6) {
  const d = db();
  return d.audit.slice(0, limit).map((a) => ({ ...a, project: a.projectId ? projName(a.projectId) : "" }));
}
