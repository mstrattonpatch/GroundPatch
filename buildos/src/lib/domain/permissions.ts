import type { Role, User } from "./types.ts";

// Role-based permissions (blueprint §9). Checked on the server for every
// mutation — hiding a button in the UI is never the control.

export type Permission =
  | "defect.create"
  | "defect.assign"
  | "defect.rectify"
  | "defect.verify"
  | "itp.release_hold"
  | "variation.create"
  | "variation.approve"
  | "swms.review"
  | "attendance.override"
  | "commercial.view"
  | "diary.submit";

const GRANTS: Record<Role, Permission[]> = {
  director: [
    "defect.create",
    "defect.assign",
    "defect.verify",
    "itp.release_hold",
    "variation.create",
    "variation.approve",
    "swms.review",
    "attendance.override",
    "commercial.view",
    "diary.submit",
  ],
  project_manager: [
    "defect.create",
    "defect.assign",
    "defect.verify",
    "itp.release_hold",
    "variation.create",
    "variation.approve",
    "swms.review",
    "attendance.override",
    "commercial.view",
    "diary.submit",
  ],
  site_supervisor: [
    "defect.create",
    "defect.assign",
    "defect.verify",
    "swms.review",
    "attendance.override",
    "diary.submit",
  ],
  quality_manager: ["defect.create", "defect.assign", "defect.verify", "itp.release_hold"],
  subcontractor_admin: ["defect.rectify", "variation.create"],
  worker: ["defect.create"],
};

/** Delegated authority for approving variations, in cents. */
export const VARIATION_APPROVAL_LIMIT: Partial<Record<Role, number>> = {
  project_manager: 50_000_00,
  director: Number.POSITIVE_INFINITY,
};

export const ROLE_LABEL: Record<Role, string> = {
  director: "Director",
  project_manager: "Project manager",
  site_supervisor: "Site supervisor",
  quality_manager: "Quality manager",
  subcontractor_admin: "Subcontractor admin",
  worker: "Worker",
};

export function can(user: User, permission: Permission): boolean {
  return GRANTS[user.role].includes(permission);
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export function assertCan(user: User, permission: Permission): void {
  if (!can(user, permission)) {
    throw new PermissionError(`${ROLE_LABEL[user.role]} cannot ${permission.replace(".", " → ")}.`);
  }
}
