import { test } from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../src/lib/server/seed.ts";
import {
  canSignIn,
  commercialPosition,
  isOverdue,
  siteRequirements,
  transitionDefect,
  transitionVariation,
  WorkflowError,
} from "../src/lib/domain/workflows.ts";
import { PermissionError } from "../src/lib/domain/permissions.ts";

const db = createSeed(new Date());
const user = (id: string) => db.users.find((u) => u.id === id)!;
const defect = (ref: string) => structuredClone(db.defects.find((d) => d.ref === ref)!);

test("a defect can't be assigned without a due date", () => {
  const d = defect("DEF-0120"); // open, unassigned
  assert.throws(() => transitionDefect(d, { type: "assign", contractorId: "c_ti", dueDate: "" }, user("u_sup")), WorkflowError);
  const patch = transitionDefect(d, { type: "assign", contractorId: "c_ti", dueDate: "2030-01-01" }, user("u_sup"));
  assert.equal(patch.status, "assigned");
});

test("closing a defect needs an authorised reviewer, not just a status change", () => {
  const d = defect("DEF-0139"); // ready for verification, has evidence
  assert.throws(() => transitionDefect(d, { type: "verify" }, user("u_sub")), PermissionError);
  assert.equal(transitionDefect(d, { type: "verify" }, user("u_sup")).status, "closed");
});

test("closing is refused when completion evidence is missing", () => {
  const d = defect("DEF-0139");
  d.evidencePhotos = [];
  assert.throws(() => transitionDefect(d, { type: "verify" }, user("u_sup")), /evidence/i);
});

test("rejecting a repair returns it to rectification and needs a reason", () => {
  const d = defect("DEF-0139");
  assert.throws(() => transitionDefect(d, { type: "reject", reason: " " }, user("u_sup")), WorkflowError);
  assert.equal(transitionDefect(d, { type: "reject", reason: "Collar missing" }, user("u_sup")).status, "rectifying");
});

test("only the assigned subcontractor can submit their own rectification", () => {
  const mine = defect("DEF-0128"); // AquaSeal, rectifying
  const ok = transitionDefect(mine, { type: "submit_for_verification", note: "Bond breaker installed", evidencePhotos: ["a.jpg"] }, user("u_sub"));
  assert.equal(ok.status, "ready_for_verification");
  const theirs = defect("DEF-0115"); // Solid Pour, rectifying
  assert.throws(() => transitionDefect(theirs, { type: "submit_for_verification", note: "x", evidencePhotos: ["a.jpg"] }, user("u_sub")), PermissionError);
});

test("variation approval respects delegated authority", () => {
  const big = structuredClone(db.variations.find((v) => v.ref === "VAR-013")!); // $162,000
  assert.throws(() => transitionVariation(big, { type: "approve" }, user("u_pm"), new Date()), /delegated limit/);
  assert.equal(transitionVariation(big, { type: "approve" }, user("u_dir"), new Date()).status, "approved");
  const small = structuredClone(db.variations.find((v) => v.ref === "VAR-012")!); // $48,200
  assert.equal(transitionVariation(small, { type: "approve" }, user("u_pm"), new Date()).status, "approved");
});

test("approving twice is refused, so a retry can't double-count", () => {
  const v = structuredClone(db.variations.find((v) => v.ref === "VAR-012")!);
  Object.assign(v, transitionVariation(v, { type: "approve" }, user("u_pm"), new Date()));
  assert.throws(() => transitionVariation(v, { type: "approve" }, user("u_pm"), new Date()), WorkflowError);
});

test("unapproved variations are exposure only and never change the contract value", () => {
  const p = db.projects.find((x) => x.id === "p_riv")!;
  const vars = structuredClone(db.variations.filter((v) => v.projectId === p.id));
  const lines = db.budgetLines.filter((l) => l.projectId === p.id);
  const before = commercialPosition(p, vars, lines);
  assert.equal(before.revisedContract, p.contractSum + 400_000_00);
  assert.equal(before.variationExposure, 48_200_00 + 162_000_00);
  assert.ok(Math.abs(before.forecastMarginPct - 7.88) < 0.05);

  const v12 = vars.find((v) => v.ref === "VAR-012")!;
  Object.assign(v12, transitionVariation(v12, { type: "approve" }, user("u_pm"), new Date()));
  const after = commercialPosition(p, vars, lines);
  assert.equal(after.revisedContract, before.revisedContract + 48_200_00);
  assert.equal(after.variationExposure, before.variationExposure - 48_200_00);
  assert.equal(after.originalContract, before.originalContract);
});

test("site sign-in names the exact missing requirement", () => {
  const sam = db.workers.find((w) => w.id === "w_co1")!;
  const swms = structuredClone(db.swms.filter((s) => s.projectId === "p_riv"));
  let reqs = siteRequirements(sam, "p_riv", db.credentials, swms, new Date());
  assert.equal(canSignIn(reqs), false);
  assert.deepEqual(reqs.filter((r) => r.severity === "blocking").map((r) => r.label), ["SWMS · Concrete placement v3"]);
  assert.ok(reqs.some((r) => r.label === "EWP licence" && r.severity === "warning"));

  swms.find((s) => s.id === "swms_r03")!.acknowledgedBy.push(sam.id);
  reqs = siteRequirements(sam, "p_riv", db.credentials, swms, new Date());
  assert.equal(canSignIn(reqs), true);
});

test("a worker without the site induction is blocked", () => {
  const w = db.workers.find((x) => x.id === "w_co9")!;
  const reqs = siteRequirements(w, "p_riv", db.credentials, db.swms, new Date());
  assert.ok(reqs.some((r) => r.label === "Site induction" && r.severity === "blocking"));
});

test("closed defects are never overdue", () => {
  const d = defect("DEF-0091");
  assert.equal(isOverdue(d, new Date()), false);
  assert.equal(isOverdue(defect("DEF-0142"), new Date()), true);
});
