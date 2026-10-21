import type {
  Credential,
  Defect,
  DefectStatus,
  Project,
  Swms,
  User,
  Variation,
  VariationStatus,
  Worker,
  BudgetLine,
} from "./types.ts";
import { assertCan, PermissionError, VARIATION_APPROVAL_LIMIT } from "./permissions.ts";

// Status transitions and the rules that guard them. These functions are pure:
// they validate and return the next state, and the server store applies it
// and writes the audit event. Keeping them pure means they are unit-testable
// and cannot be bypassed by a modified browser request.

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

// ---------------------------------------------------------------- defects

export const DEFECT_STEPS: { status: DefectStatus; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "assigned", label: "Assigned" },
  { status: "rectifying", label: "Rectifying" },
  { status: "ready_for_verification", label: "Verify" },
  { status: "closed", label: "Closed" },
];

export type DefectAction =
  | { type: "submit" }
  | { type: "assign"; contractorId: string; dueDate: string }
  | { type: "start_rectification" }
  | { type: "submit_for_verification"; note: string; evidencePhotos: string[] }
  | { type: "verify" }
  | { type: "reject"; reason: string };

export function transitionDefect(defect: Defect, action: DefectAction, user: User): Partial<Defect> {
  const from = defect.status;
  const bad = () => new WorkflowError(`Can't ${action.type.replace(/_/g, " ")} a defect that is ${from.replace(/_/g, " ")}.`);

  switch (action.type) {
    case "submit":
      assertCan(user, "defect.create");
      if (from !== "draft") throw bad();
      return { status: "open" };

    case "assign":
      assertCan(user, "defect.assign");
      if (from !== "open" && from !== "assigned") throw bad();
      if (!action.contractorId) throw new WorkflowError("Choose a responsible contractor.");
      if (!action.dueDate) throw new WorkflowError("A due date is needed before this can be assigned.");
      return { status: "assigned", contractorId: action.contractorId, dueDate: action.dueDate };

    case "start_rectification":
      if (from !== "assigned") throw bad();
      assertSubcontractorOwns(user, defect);
      return { status: "rectifying" };

    case "submit_for_verification":
      if (from !== "rectifying" && from !== "assigned") throw bad();
      assertSubcontractorOwns(user, defect);
      if (!action.note.trim()) throw new WorkflowError("Describe the rectification before submitting.");
      if (action.evidencePhotos.length === 0)
        throw new WorkflowError("Add at least one completion photo as evidence.");
      return {
        status: "ready_for_verification",
        rectificationNote: action.note.trim(),
        evidencePhotos: [...defect.evidencePhotos, ...action.evidencePhotos],
      };

    case "verify":
      assertCan(user, "defect.verify");
      if (from !== "ready_for_verification") throw bad();
      // Closing needs evidence and an authorised reviewer, not just a status change.
      if (defect.evidencePhotos.length === 0 || !defect.rectificationNote)
        throw new WorkflowError("Completion evidence is missing — can't close.");
      return { status: "closed", verifiedBy: user.id };

    case "reject":
      assertCan(user, "defect.verify");
      if (from !== "ready_for_verification") throw bad();
      if (!action.reason.trim()) throw new WorkflowError("Give a reason so the contractor knows what to fix.");
      return { status: "rectifying" };
  }
}

function assertSubcontractorOwns(user: User, defect: Defect) {
  const isOwner = user.role === "subcontractor_admin" && user.contractorId === defect.contractorId;
  const isSupervisor = user.role === "site_supervisor" || user.role === "project_manager";
  if (!isOwner && !isSupervisor) {
    throw new PermissionError("Only the assigned contractor or site team can record rectification.");
  }
}

export function isOverdue(defect: Pick<Defect, "dueDate" | "status">, today: Date): boolean {
  if (!defect.dueDate || defect.status === "closed" || defect.status === "draft") return false;
  return new Date(defect.dueDate) < startOfDay(today);
}

// ------------------------------------------------------------- variations

export type VariationAction =
  | { type: "submit" }
  | { type: "start_review" }
  | { type: "approve"; approvedAmount?: number }
  | { type: "reject"; reason: string }
  | { type: "include_in_claim" };

const VARIATION_NEXT: Record<VariationAction["type"], VariationStatus[]> = {
  submit: ["draft"],
  start_review: ["submitted"],
  approve: ["submitted", "under_review"],
  reject: ["submitted", "under_review"],
  include_in_claim: ["approved"],
};

export function transitionVariation(
  v: Variation,
  action: VariationAction,
  user: User,
  now: Date,
): Partial<Variation> {
  if (!VARIATION_NEXT[action.type].includes(v.status)) {
    throw new WorkflowError(`Can't ${action.type.replace(/_/g, " ")} a variation that is ${v.status.replace(/_/g, " ")}.`);
  }
  switch (action.type) {
    case "submit":
      assertCan(user, "variation.create");
      return { status: "submitted" };
    case "start_review":
      assertCan(user, "variation.approve");
      return { status: "under_review" };
    case "approve": {
      assertCan(user, "variation.approve");
      const amount = action.approvedAmount ?? v.amount;
      const limit = VARIATION_APPROVAL_LIMIT[user.role] ?? 0;
      if (amount > limit) {
        throw new PermissionError(
          `This exceeds your delegated limit of ${formatMoneyPlain(limit)}. A director must approve it.`,
        );
      }
      return { status: "approved", approvedAmount: amount, approvedBy: user.id, approvedAt: now.toISOString() };
    }
    case "reject":
      assertCan(user, "variation.approve");
      if (!action.reason.trim()) throw new WorkflowError("A reason is required to reject a variation.");
      return { status: "rejected" };
    case "include_in_claim":
      assertCan(user, "variation.approve");
      return { status: "included_in_claim" };
  }
}

// ------------------------------------------------------------- commercial

export interface CommercialPosition {
  originalContract: number;
  approvedVariations: number;
  /** Unapproved variations — exposure only, never added to the contract sum. */
  variationExposure: number;
  revisedContract: number;
  budget: number;
  committed: number;
  actual: number;
  forecastFinalCost: number;
  /** Revised contract minus forecast final cost, before overheads. */
  forecastMargin: number;
  forecastMarginPct: number;
}

export function commercialPosition(
  project: Pick<Project, "contractSum">,
  variations: Variation[],
  lines: BudgetLine[],
): CommercialPosition {
  const approvedVariations = sum(
    variations.filter((v) => v.status === "approved" || v.status === "included_in_claim"),
    (v) => v.approvedAmount ?? v.amount,
  );
  const variationExposure = sum(
    variations.filter((v) => v.status === "submitted" || v.status === "under_review" || v.status === "draft"),
    (v) => v.amount,
  );
  const revisedContract = project.contractSum + approvedVariations;
  const forecastFinalCost = sum(lines, (l) => l.forecastFinal);
  const forecastMargin = revisedContract - forecastFinalCost;
  return {
    originalContract: project.contractSum,
    approvedVariations,
    variationExposure,
    revisedContract,
    budget: sum(lines, (l) => l.originalBudget),
    committed: sum(lines, (l) => l.committed),
    actual: sum(lines, (l) => l.actual),
    forecastFinalCost,
    forecastMargin,
    forecastMarginPct: revisedContract === 0 ? 0 : (forecastMargin / revisedContract) * 100,
  };
}

// ---------------------------------------------------------- site access

export interface Requirement {
  label: string;
  met: boolean;
  /** Exact reason shown to the worker — never a generic "not compliant". */
  detail: string;
  severity: "ok" | "warning" | "blocking";
}

const REQUIRED_CREDENTIALS = ["White Card"];

export function siteRequirements(
  worker: Worker,
  projectId: string,
  credentials: Credential[],
  activeSwms: Swms[],
  today: Date,
): Requirement[] {
  const reqs: Requirement[] = [];
  const mine = credentials.filter((c) => c.workerId === worker.id);

  for (const type of REQUIRED_CREDENTIALS) {
    const c = mine.find((x) => x.type === type);
    reqs.push(credentialRequirement(type, c, today, true));
  }

  reqs.push({
    label: "Site induction",
    met: worker.inductedProjectIds.includes(projectId),
    detail: worker.inductedProjectIds.includes(projectId) ? "Complete" : "Not yet inducted to this site",
    severity: worker.inductedProjectIds.includes(projectId) ? "ok" : "blocking",
  });

  for (const c of mine.filter((x) => !REQUIRED_CREDENTIALS.includes(x.type))) {
    reqs.push(credentialRequirement(c.type, c, today, false));
  }

  for (const s of activeSwms.filter((s) => s.contractorId === worker.contractorId && s.status === "approved")) {
    const ack = s.acknowledgedBy.includes(worker.id);
    reqs.push({
      label: `SWMS · ${s.title} v${s.version}`,
      met: ack,
      detail: ack ? "Acknowledged" : "Needs signing",
      severity: ack ? "ok" : "blocking",
    });
  }
  return reqs;
}

function credentialRequirement(type: string, c: Credential | undefined, today: Date, mandatory: boolean): Requirement {
  if (!c) return { label: type, met: false, detail: "Not uploaded", severity: mandatory ? "blocking" : "warning" };
  if (c.expires && new Date(c.expires) < startOfDay(today))
    return { label: type, met: false, detail: `Expired ${formatShortDate(c.expires)}`, severity: "blocking" };
  if (c.status !== "verified")
    return { label: type, met: false, detail: "Awaiting verification", severity: mandatory ? "blocking" : "warning" };
  const days = c.expires ? daysBetween(today, new Date(c.expires)) : Infinity;
  if (days <= 30) return { label: type, met: true, detail: `Expires ${formatShortDate(c.expires!)}`, severity: "warning" };
  return { label: type, met: true, detail: "Verified", severity: "ok" };
}

export function canSignIn(reqs: Requirement[]): boolean {
  return reqs.every((r) => r.severity !== "blocking");
}

// ---------------------------------------------------------------- helpers

export function sum<T>(items: T[], f: (t: T) => number): number {
  return items.reduce((acc, t) => acc + f(t), 0);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function formatMoneyPlain(cents: number): string {
  if (!Number.isFinite(cents)) return "unlimited";
  return `$${(cents / 100).toLocaleString("en-AU")}`;
}
