import "server-only";
import { createSeed, type Db } from "./seed.ts";
import type { AuditEvent, Defect, ID, User, Variation } from "../domain/types.ts";
import {
  canSignIn,
  commercialPosition,
  isOverdue,
  siteRequirements,
  transitionDefect,
  transitionVariation,
  WorkflowError,
  type DefectAction,
  type VariationAction,
} from "../domain/workflows.ts";
import { assertCan, can, PermissionError } from "../domain/permissions.ts";

// In-memory store for the prototype. The shape mirrors the relational schema
// in db/schema.sql so it can be swapped for PostgreSQL without touching pages.
// Data resets when the server restarts.

const g = globalThis as unknown as { __buildosDb?: Db };
export function db(): Db {
  if (!g.__buildosDb) g.__buildosDb = createSeed();
  return g.__buildosDb;
}

export function resetDemo() {
  g.__buildosDb = createSeed();
}

function nextSeq(key: string) {
  const d = db();
  d.seq[key] = (d.seq[key] ?? 0) + 1;
  return d.seq[key];
}

function audit(e: Omit<AuditEvent, "id" | "at" | "orgId">, actor: User) {
  db().audit.unshift({ ...e, id: `ae_${nextSeq("audit")}`, orgId: actor.orgId, at: new Date().toISOString() });
}

// ------------------------------------------------------------- queries
// Every query is scoped by organisation, and subcontractor users only see
// records that belong to their own company.

export function getUser(id: ID) {
  return db().users.find((u) => u.id === id);
}

export function listProjects(user: User) {
  return db().projects.filter((p) => p.orgId === user.orgId);
}

export function getProject(user: User, id: ID) {
  const p = db().projects.find((p) => p.id === id && p.orgId === user.orgId);
  return p ?? null;
}

export function contractor(id?: ID) {
  return id ? db().contractors.find((c) => c.id === id) : undefined;
}

export function location(id: ID) {
  return db().locations.find((l) => l.id === id);
}

export function listDefects(user: User, projectId?: ID) {
  return db().defects.filter(
    (d) =>
      d.orgId === user.orgId &&
      (!projectId || d.projectId === projectId) &&
      (user.role !== "subcontractor_admin" || d.contractorId === user.contractorId),
  );
}

export function getDefect(user: User, id: ID) {
  return listDefects(user).find((d) => d.id === id) ?? null;
}

export function listVariations(user: User, projectId?: ID) {
  if (!can(user, "commercial.view")) return [];
  return db().variations.filter((v) => v.orgId === user.orgId && (!projectId || v.projectId === projectId));
}

export function projectCommercial(user: User, projectId: ID) {
  const p = getProject(user, projectId);
  if (!p || !can(user, "commercial.view")) return null;
  const d = db();
  return commercialPosition(
    p,
    d.variations.filter((v) => v.projectId === projectId),
    d.budgetLines.filter((l) => l.projectId === projectId),
  );
}

export function onSiteNow(projectId?: ID) {
  const d = db();
  const latest = new Map<string, (typeof d.attendance)[number]>();
  const today = new Date().toISOString().slice(0, 10);
  for (const e of d.attendance) {
    if (projectId && e.projectId !== projectId) continue;
    if (!e.at.startsWith(today)) continue;
    const key = `${e.projectId}:${e.workerId}`;
    const prev = latest.get(key);
    if (!prev || prev.at <= e.at) latest.set(key, e);
  }
  return [...latest.values()].filter((e) => e.kind === "check_in");
}

export function awaitingSignOff(projectId?: ID) {
  const d = db();
  const points = d.itps
    .filter((i) => !projectId || i.projectId === projectId)
    .flatMap((i) => i.points.filter((p) => p.status === "submitted").map((p) => ({ itp: i, point: p })));
  const defects = d.defects.filter((x) => (!projectId || x.projectId === projectId) && x.status === "ready_for_verification");
  const holdsBlocking = d.itps
    .filter((i) => !projectId || i.projectId === projectId)
    .flatMap((i) => i.points.filter((p) => p.type === "hold" && (p.status === "submitted" || p.status === "rejected")));
  return { points, defects, holdsBlocking, total: points.length + defects.length };
}

export function overdueDefects(user: User, projectId?: ID) {
  const now = new Date();
  return listDefects(user, projectId).filter((d) => isOverdue(d, now));
}

export function openDefects(user: User, projectId?: ID) {
  return listDefects(user, projectId).filter((d) => d.status !== "closed" && d.status !== "draft");
}

export function workerRequirements(workerId: ID, projectId: ID) {
  const d = db();
  const w = d.workers.find((x) => x.id === workerId);
  if (!w) return null;
  const reqs = siteRequirements(w, projectId, d.credentials, d.swms.filter((s) => s.projectId === projectId), new Date());
  return { worker: w, reqs, eligible: canSignIn(reqs) };
}

/** Readiness view for a milestone (blueprint §11). Shows facts; never authorises. */
export function readiness(projectId: ID, taskId: ID) {
  const d = db();
  const task = d.tasks.find((t) => t.id === taskId && t.projectId === projectId);
  if (!task) return null;
  type Item = { label: string; state: "ready" | "blocking" | "action"; detail: string; href?: string };
  const items: Item[] = [];
  const pred = d.tasks.filter((t) => task.predecessorIds.includes(t.id));
  items.push({
    label: "Programme task & pump booking",
    state: pred.every((t) => t.progress >= 80) ? "ready" : "action",
    detail: pred.every((t) => t.progress >= 80) ? "Ready" : "Predecessor behind",
    href: `/app/projects/${projectId}/programme`,
  });
  const itp = d.itps.find((i) => i.id === task.itpId);
  for (const p of itp?.points.filter((p) => p.type === "hold" || p.type === "witness") ?? []) {
    const released = p.status === "released";
    items.push({
      label: `${itp!.ref} ${p.name.toLowerCase()} ${p.type === "hold" ? "hold point" : "witness point"}`,
      state: released ? "ready" : p.type === "hold" ? "blocking" : "action",
      detail: released ? "Released" : p.type === "hold" ? (p.status === "submitted" ? "Awaiting release" : "Not submitted") : "Not booked",
      href: `/app/projects/${projectId}/quality/itp/${itp!.id}`,
    });
  }
  const loc = d.locations.filter((l) => l.projectId === projectId && task.name.startsWith(l.level));
  const open = d.defects.filter((x) => loc.some((l) => l.id === x.locationId) && x.status !== "closed");
  items.push({
    label: `Open defects on ${loc[0]?.level ?? "area"}`,
    state: open.length ? "action" : "ready",
    detail: open.length ? `${open.length} open` : "None",
    href: `/app/projects/${projectId}/quality`,
  });
  if (task.contractorId) {
    const crew = d.workers.filter((w) => w.contractorId === task.contractorId);
    const missing = crew.filter((w) => !w.inductedProjectIds.includes(projectId));
    const c = contractor(task.contractorId);
    items.push({
      label: `${c?.trade ?? "Crew"} crew credentials`,
      state: missing.length ? "action" : "ready",
      detail: missing.length ? `${missing.length} of ${crew.length} missing induction` : "All inducted",
      href: `/app/projects/${projectId}/workforce`,
    });
  }
  const s = d.swms.find((x) => x.id === task.swmsId);
  if (s) {
    items.push({
      label: `SWMS · ${s.title} v${s.version}`,
      state: s.status === "approved" ? "ready" : "blocking",
      detail: s.status === "approved" ? "Approved" : "Not approved",
      href: `/app/projects/${projectId}/safety`,
    });
  }
  return { task, items };
}

export function search(user: User, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const d = db();
  const hit = (...xs: (string | undefined)[]) => xs.some((x) => x?.toLowerCase().includes(needle));
  type Result = { kind: string; title: string; sub: string; href: string };
  const out: Result[] = [];
  for (const p of listProjects(user)) if (hit(p.name, p.code, p.address)) out.push({ kind: "Project", title: p.name, sub: p.code, href: `/app/projects/${p.id}` });
  for (const x of listDefects(user)) if (hit(x.ref, x.title, x.trade)) out.push({ kind: "Defect", title: `${x.ref} · ${x.title}`, sub: projName(x.projectId), href: `/app/projects/${x.projectId}/quality/defects/${x.id}` });
  for (const x of d.documents) if (hit(x.number, x.title)) out.push({ kind: "Document", title: `${x.number} rev ${x.revision} · ${x.title}`, sub: projName(x.projectId), href: `/app/projects/${x.projectId}/documents` });
  for (const x of d.workers) if (hit(x.name)) out.push({ kind: "Worker", title: x.name, sub: contractor(x.contractorId)?.tradingName ?? "", href: `/app/people#${x.id}` });
  for (const x of listVariations(user)) if (hit(x.ref, x.title)) out.push({ kind: "Variation", title: `${x.ref} · ${x.title}`, sub: projName(x.projectId), href: `/app/projects/${x.projectId}/commercial` });
  return out.slice(0, 40);
}

export function projName(id: ID) {
  return db().projects.find((p) => p.id === id)?.name ?? "";
}

export function auditFor(recordId: ID) {
  return db().audit.filter((a) => a.recordId === recordId);
}

// ----------------------------------------------------------- mutations

export type Result = { ok: true; message: string; id?: string } | { ok: false; error: string };

function guard(fn: () => Result): Result {
  try {
    return fn();
  } catch (e) {
    if (e instanceof WorkflowError || e instanceof PermissionError) return { ok: false, error: e.message };
    throw e;
  }
}

export interface NewDefectInput {
  projectId: ID;
  title: string;
  locationId: ID;
  room?: string;
  trade: string;
  contractorId?: ID;
  priority: Defect["priority"];
  dueDate?: string;
  photos: string[];
  /** Client-generated key so a retried offline submission is not duplicated. */
  clientKey?: string;
  draft?: boolean;
}

const seenClientKeys = new Map<string, string>();

export function createDefect(user: User, input: NewDefectInput): Result {
  return guard(() => {
    assertCan(user, "defect.create");
    if (!getProject(user, input.projectId)) throw new WorkflowError("Project not found.");
    if (!input.title.trim()) throw new WorkflowError("Say what's wrong.");
    if (!input.locationId && !input.draft) throw new WorkflowError("Choose a location.");
    if (input.clientKey && seenClientKeys.has(input.clientKey)) {
      return { ok: true, message: "Already received.", id: seenClientKeys.get(input.clientKey) };
    }
    const n = nextSeq("defect");
    const assign = !input.draft && Boolean(input.contractorId && input.dueDate && can(user, "defect.assign"));
    const defect: Defect = {
      id: `d_${n}`,
      orgId: user.orgId,
      projectId: input.projectId,
      ref: `DEF-${String(n).padStart(4, "0")}`,
      title: input.title.trim(),
      description: input.title.trim(),
      category: "Workmanship",
      locationId: input.locationId || (db().locations.find((l) => l.projectId === input.projectId)?.id ?? ""),
      room: input.room,
      trade: input.trade || "General",
      contractorId: assign ? input.contractorId : undefined,
      priority: input.priority,
      dueDate: input.dueDate || undefined,
      status: input.draft ? "draft" : assign ? "assigned" : "open",
      raisedBy: user.id,
      raisedAt: new Date().toISOString(),
      photos: input.photos,
      evidencePhotos: [],
    };
    db().defects.unshift(defect);
    if (input.clientKey) seenClientKeys.set(input.clientKey, defect.id);
    audit({ projectId: defect.projectId, recordType: "defect", recordId: defect.id, action: "Defect raised", detail: `${defect.ref} · ${defect.title}`, actorId: user.id, to: defect.status }, user);
    if (assign) {
      audit({ projectId: defect.projectId, recordType: "defect", recordId: defect.id, action: "Assigned", detail: contractor(defect.contractorId)?.tradingName, actorId: user.id }, user);
    }
    return { ok: true, message: input.draft ? `${defect.ref} saved as a draft.` : `${defect.ref} raised${assign ? " and assigned" : ""}.`, id: defect.id };
  });
}

export function actOnDefect(user: User, defectId: ID, action: DefectAction): Result {
  return guard(() => {
    const d = getDefect(user, defectId);
    if (!d) throw new WorkflowError("Defect not found.");
    const before = d.status;
    const patch = transitionDefect(d, action, user);
    Object.assign(d, patch);
    const label: Record<DefectAction["type"], string> = {
      submit: "Submitted",
      assign: "Assigned",
      start_rectification: "Rectification started",
      submit_for_verification: "Submitted for verification",
      verify: "Verified and closed",
      reject: "Repair rejected",
    };
    audit(
      {
        projectId: d.projectId, recordType: "defect", recordId: d.id, action: label[action.type], actorId: user.id,
        from: before, to: d.status,
        detail: action.type === "reject" ? action.reason : action.type === "submit_for_verification" ? `${action.evidencePhotos.length} photos` : action.type === "assign" ? contractor(action.contractorId)?.tradingName : undefined,
      },
      user,
    );
    return { ok: true, message: `${d.ref}: ${label[action.type].toLowerCase()}.` };
  });
}

export function actOnVariation(user: User, variationId: ID, action: VariationAction): Result {
  return guard(() => {
    const v = listVariations(user).find((x) => x.id === variationId);
    if (!v) throw new WorkflowError("Variation not found.");
    const before = v.status;
    const patch: Partial<Variation> = transitionVariation(v, action, user, new Date());
    Object.assign(v, patch);
    audit({ projectId: v.projectId, recordType: "variation", recordId: v.id, action: `Variation ${v.status.replace(/_/g, " ")}`, detail: v.ref, actorId: user.id, from: before, to: v.status }, user);
    return { ok: true, message: `${v.ref} ${v.status.replace(/_/g, " ")}.` };
  });
}

export function releaseHoldPoint(user: User, itpId: ID, pointId: ID, decision: "release" | "reject", comment: string): Result {
  return guard(() => {
    assertCan(user, "itp.release_hold");
    const itp = db().itps.find((i) => i.id === itpId);
    const p = itp?.points.find((x) => x.id === pointId);
    if (!itp || !p) throw new WorkflowError("Inspection point not found.");
    if (p.status !== "submitted") throw new WorkflowError("Only a submitted point can be released or rejected.");
    if (decision === "release" && p.evidence.length === 0) throw new WorkflowError("No evidence attached — can't release.");
    if (decision === "reject" && !comment.trim()) throw new WorkflowError("Give a reason for rejecting.");
    p.status = decision === "release" ? "released" : "rejected";
    if (decision === "release") {
      p.releasedBy = user.id;
      p.releasedAt = new Date().toISOString();
    }
    // Releasing a hold point records quality acceptance. It does not mark the
    // programme task complete — those are separate facts.
    const t = db().tasks.find((x) => x.id === itp.taskId);
    if (t && t.status === "blocked" && !itp.points.some((x) => x.type === "hold" && x.status !== "released")) {
      t.status = "not_started";
    }
    audit({ projectId: itp.projectId, recordType: "itp_point", recordId: itp.id, action: decision === "release" ? "Hold point released" : "Inspection rejected", detail: `${itp.ref} · ${p.name}${comment ? ` — ${comment}` : ""}`, actorId: user.id }, user);
    return { ok: true, message: `${itp.ref} ${p.name}: ${decision === "release" ? "released" : "rejected"}.` };
  });
}

export function acknowledgeSwms(user: User, swmsId: ID): Result {
  return guard(() => {
    if (!user.workerId) throw new PermissionError("Only workers acknowledge a SWMS.");
    const s = db().swms.find((x) => x.id === swmsId);
    if (!s) throw new WorkflowError("SWMS not found.");
    if (s.status !== "approved") throw new WorkflowError("This SWMS isn't approved yet.");
    if (!s.acknowledgedBy.includes(user.workerId)) s.acknowledgedBy.push(user.workerId);
    audit({ projectId: s.projectId, recordType: "swms", recordId: s.id, action: "SWMS acknowledged", detail: `${s.title} v${s.version}`, actorId: user.id }, user);
    return { ok: true, message: `Acknowledged ${s.title} v${s.version}.` };
  });
}

export function reviewSwms(user: User, swmsId: ID, decision: "approve" | "changes", comment: string): Result {
  return guard(() => {
    assertCan(user, "swms.review");
    const s = db().swms.find((x) => x.id === swmsId);
    if (!s) throw new WorkflowError("SWMS not found.");
    if (s.status !== "submitted" && s.status !== "in_review") throw new WorkflowError("This SWMS isn't awaiting review.");
    if (decision === "changes" && !comment.trim()) throw new WorkflowError("Say what needs to change.");
    s.status = decision === "approve" ? "approved" : "changes_requested";
    audit({ projectId: s.projectId, recordType: "swms", recordId: s.id, action: decision === "approve" ? "SWMS approved" : "SWMS changes requested", detail: `${s.title} v${s.version}${comment ? ` — ${comment}` : ""}`, actorId: user.id }, user);
    return { ok: true, message: `${s.ref} ${decision === "approve" ? "approved" : "returned for changes"}.` };
  });
}

export function signInToSite(user: User, projectId: ID): Result {
  return guard(() => {
    if (!user.workerId) throw new PermissionError("Only workers sign in to site.");
    const r = workerRequirements(user.workerId, projectId);
    if (!r) throw new WorkflowError("Worker profile not found.");
    const missing = r.reqs.filter((x) => x.severity === "blocking");
    if (missing.length) throw new WorkflowError(`Can't sign in yet: ${missing.map((m) => `${m.label} — ${m.detail.toLowerCase()}`).join("; ")}.`);
    // A check-in is an attendance fact, not an approved timesheet.
    db().attendance.push({ id: `a_${nextSeq("attendance")}`, projectId, workerId: user.workerId, kind: "check_in", at: new Date().toISOString(), method: "qr" });
    audit({ projectId, recordType: "attendance", recordId: user.workerId, action: "Signed in to site", detail: "QR · Gate 1", actorId: user.id }, user);
    return { ok: true, message: "You're signed in. Have a safe day." };
  });
}

export function signOutOfSite(user: User, projectId: ID): Result {
  return guard(() => {
    if (!user.workerId) throw new PermissionError("Only workers sign out of site.");
    db().attendance.push({ id: `a_${nextSeq("attendance")}`, projectId, workerId: user.workerId, kind: "check_out", at: new Date().toISOString(), method: "qr" });
    audit({ projectId, recordType: "attendance", recordId: user.workerId, action: "Signed out of site", actorId: user.id }, user);
    return { ok: true, message: "Signed out." };
  });
}

export function submitDiary(user: User, projectId: ID, input: { weather: string; notes: string; delays: string }): Result {
  return guard(() => {
    assertCan(user, "diary.submit");
    if (!input.notes.trim()) throw new WorkflowError("Add a note about today's work.");
    const today = new Date().toISOString().slice(0, 10);
    const d = db();
    if (d.diary.some((e) => e.projectId === projectId && e.date === today && e.submitted)) {
      // Submitted records are never silently overwritten.
      throw new WorkflowError("Today's diary is already submitted. Add an amendment instead.");
    }
    const here = onSiteNow(projectId);
    const companies = new Set(here.map((e) => d.workers.find((w) => w.id === e.workerId)?.contractorId)).size;
    const id = `di_${nextSeq("audit")}`;
    d.diary.unshift({ id, projectId, date: today, weather: input.weather || "—", notes: input.notes.trim(), delays: input.delays.trim() || undefined, workersOnSite: here.length, companiesOnSite: companies, authorId: user.id, submitted: true });
    audit({ projectId, recordType: "diary", recordId: id, action: "Site diary submitted", actorId: user.id }, user);
    return { ok: true, message: "Diary submitted. Attendance was pulled in automatically." };
  });
}
