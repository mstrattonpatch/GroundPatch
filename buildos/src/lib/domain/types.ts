// Core entities shared by every module (blueprint §8). Every record carries
// an organisation ID so one customer's data can never leak into another's.
// Money is stored as integer cents; dates as ISO strings.

export type ID = string;

export type Role =
  | "director"
  | "project_manager"
  | "site_supervisor"
  | "quality_manager"
  | "subcontractor_admin"
  | "worker";

export interface Organisation {
  id: ID;
  name: string;
  abn: string;
}

export interface User {
  id: ID;
  orgId: ID;
  name: string;
  initials: string;
  role: Role;
  title: string;
  /** Set for subcontractor users — limits what they can see. */
  contractorId?: ID;
  /** Set for users who are also site workers. */
  workerId?: ID;
}

export type ProjectStatus = "tender" | "construction" | "handover" | "dlp";

export interface Project {
  id: ID;
  orgId: ID;
  code: string;
  name: string;
  address: string;
  client: string;
  type: "Residential" | "Commercial" | "Industrial" | "Civil";
  status: ProjectStatus;
  pmId: ID;
  /** Original contract sum, excl. GST. Never changed by variations. */
  contractSum: number;
  startDate: string;
  pcDate: string;
  /** Planned progress from the baseline programme (0–100). */
  plannedProgress: number;
  /** Physical progress verified on site (0–100). Not the same as planned. */
  verifiedProgress: number;
  nextMilestone: { name: string; date: string };
  weather?: string;
}

export interface Location {
  id: ID;
  projectId: ID;
  building: string;
  level: string;
  zone: string;
}

export interface Contractor {
  id: ID;
  orgId: ID;
  legalName: string;
  tradingName: string;
  abn: string;
  trade: string;
  insurances: Insurance[];
}

export interface Insurance {
  type: "Public liability" | "Workers comp" | "Professional indemnity";
  expires: string;
  verified: boolean;
}

export type CredentialStatus =
  | "uploaded"
  | "awaiting_verification"
  | "verified"
  | "expired"
  | "rejected"
  | "unable_to_verify";

export interface Credential {
  id: ID;
  workerId: ID;
  type: string;
  number: string;
  expires?: string;
  status: CredentialStatus;
  verifiedBy?: ID;
  verifiedMethod?: string;
}

export interface Worker {
  id: ID;
  name: string;
  contractorId: ID;
  phone: string;
  /** Projects where this worker has completed the site induction. */
  inductedProjectIds: ID[];
}

export type TaskStatus = "not_started" | "in_progress" | "complete" | "blocked";

export interface ProgrammeTask {
  id: ID;
  projectId: ID;
  name: string;
  trade: string;
  contractorId?: ID;
  baselineStart: string;
  baselineFinish: string;
  forecastStart: string;
  forecastFinish: string;
  isMilestone: boolean;
  /** Physical progress — kept separate from ITP sign-off. */
  progress: number;
  status: TaskStatus;
  predecessorIds: ID[];
  costCode?: string;
  itpId?: ID;
  swmsId?: ID;
}

export type DefectStatus =
  | "draft"
  | "open"
  | "assigned"
  | "rectifying"
  | "ready_for_verification"
  | "closed";

export type Priority = "low" | "medium" | "high" | "critical";

export interface Defect {
  id: ID;
  orgId: ID;
  projectId: ID;
  ref: string; // DEF-0142
  title: string;
  description: string;
  category: string;
  locationId: ID;
  room?: string;
  trade: string;
  contractorId?: ID;
  priority: Priority;
  dueDate?: string;
  status: DefectStatus;
  raisedBy: ID;
  raisedAt: string;
  photos: string[];
  rectificationNote?: string;
  evidencePhotos: string[];
  verifiedBy?: ID;
  taskId?: ID;
  itpId?: ID;
}

export type ItpPointType = "hold" | "witness" | "inspection" | "test";
export type ItpPointStatus = "pending" | "submitted" | "released" | "rejected";

export interface ItpPoint {
  id: ID;
  name: string;
  check: string;
  type: ItpPointType;
  status: ItpPointStatus;
  evidence: string[];
  releasedBy?: ID;
  releasedAt?: string;
}

export interface Itp {
  id: ID;
  projectId: ID;
  ref: string; // ITP-07
  title: string;
  templateVersion: number;
  taskId?: ID;
  points: ItpPoint[];
}

export type SwmsStatus = "submitted" | "in_review" | "approved" | "changes_requested";

export interface Swms {
  id: ID;
  projectId: ID;
  ref: string;
  title: string;
  activity: string;
  contractorId: ID;
  version: number;
  status: SwmsStatus;
  highRiskCategories: string[];
  /** Worker IDs who acknowledged the current version. */
  acknowledgedBy: ID[];
}

export type DocumentStatus = "current" | "in_review" | "superseded";

export interface DocumentRecord {
  id: ID;
  projectId: ID;
  number: string; // A-102
  title: string;
  category: "Architectural" | "Structural" | "Services" | "Specification" | "Contract" | "Safety";
  revision: string;
  status: DocumentStatus;
  uploadedBy: ID;
  uploadedAt: string;
}

export interface AttendanceEvent {
  id: ID;
  projectId: ID;
  workerId: ID;
  kind: "check_in" | "check_out";
  at: string;
  method: "qr" | "kiosk" | "manual";
  overrideReason?: string;
}

export interface BudgetLine {
  id: ID;
  projectId: ID;
  costCode: string;
  description: string;
  originalBudget: number;
  committed: number;
  actual: number;
  forecastFinal: number;
}

export type VariationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "included_in_claim";

export interface Variation {
  id: ID;
  orgId: ID;
  projectId: ID;
  ref: string; // VAR-012
  title: string;
  reason: string;
  /** Proposed cost impact in cents. */
  amount: number;
  /** Set once approved — may differ from the proposed amount. */
  approvedAmount?: number;
  timeImpactDays: number;
  status: VariationStatus;
  raisedAt: string;
  approvedBy?: ID;
  approvedAt?: string;
}

export type ClaimStatus = "draft" | "submitted" | "assessed" | "certified" | "paid" | "disputed";

export interface ProgressClaim {
  id: ID;
  projectId: ID;
  ref: string; // PC-09
  periodEnd: string;
  dueDate: string;
  claimed: number;
  certified?: number;
  paid?: number;
  status: ClaimStatus;
}

export interface DiaryEntry {
  id: ID;
  projectId: ID;
  date: string;
  weather: string;
  workersOnSite: number;
  companiesOnSite: number;
  notes: string;
  delays?: string;
  authorId: ID;
  submitted: boolean;
}

export interface AuditEvent {
  id: ID;
  orgId: ID;
  projectId?: ID;
  recordType: string;
  recordId: ID;
  action: string;
  actorId: ID;
  at: string;
  from?: string;
  to?: string;
  detail?: string;
}
