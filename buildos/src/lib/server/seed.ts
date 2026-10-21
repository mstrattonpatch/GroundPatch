import type {
  AttendanceEvent,
  AuditEvent,
  BudgetLine,
  Contractor,
  Credential,
  Defect,
  DefectStatus,
  DiaryEntry,
  DocumentRecord,
  Itp,
  Location,
  Organisation,
  Priority,
  ProgressClaim,
  Project,
  ProgrammeTask,
  Swms,
  User,
  Variation,
  Worker,
} from "../domain/types.ts";

// Illustrative sample data. Every figure here is an example and is labelled
// "Sample data" in the UI. Dates are generated relative to today so the demo
// never looks stale.

export interface Db {
  org: Organisation;
  users: User[];
  projects: Project[];
  locations: Location[];
  contractors: Contractor[];
  workers: Worker[];
  credentials: Credential[];
  tasks: ProgrammeTask[];
  defects: Defect[];
  itps: Itp[];
  swms: Swms[];
  documents: DocumentRecord[];
  attendance: AttendanceEvent[];
  budgetLines: BudgetLine[];
  variations: Variation[];
  claims: ProgressClaim[];
  diary: DiaryEntry[];
  audit: AuditEvent[];
  seq: Record<string, number>;
}

const $m = (millions: number) => Math.round(millions * 1_000_000 * 100);
const $ = (dollars: number) => Math.round(dollars * 100);

export function createSeed(now = new Date()): Db {
  const day = (offset: number, hour = 9, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const date = (offset: number) => day(offset).slice(0, 10);
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  const org: Organisation = { id: "org_1", name: "Demo Builders Pty Ltd", abn: "00 000 000 000" };
  const o = org.id;

  const users: User[] = [
    { id: "u_dir", orgId: o, name: "Alex Chen", initials: "AC", role: "director", title: "Construction director" },
    { id: "u_pm", orgId: o, name: "M. Stratton", initials: "MS", role: "project_manager", title: "Project manager" },
    { id: "u_sup", orgId: o, name: "Dana Morris", initials: "DM", role: "site_supervisor", title: "Site supervisor" },
    { id: "u_qm", orgId: o, name: "Priya Nair", initials: "PN", role: "quality_manager", title: "Quality manager" },
    { id: "u_sub", orgId: o, name: "Jordan Lee", initials: "JL", role: "subcontractor_admin", title: "Contracts admin · AquaSeal", contractorId: "c_wp" },
    { id: "u_wkr", orgId: o, name: "Sam Okafor", initials: "SO", role: "worker", title: "Concreter · Solid Pour", workerId: "w_co1" },
  ];

  const contractors: Contractor[] = [
    con("c_wp", "AquaSeal Waterproofing", "Waterproofing", 220, 180),
    con("c_pl", "Riverbend Plumbing", "Plumbing", 140, 300),
    con("c_ti", "Tile & Stone Co", "Tiling", 260, 200),
    con("c_co", "Solid Pour Concreting", "Concrete", 90, 160),
    con("c_el", "Brightline Electrical", "Electrical", -3, 210),
    con("c_sc", "Highreach Scaffolding", "Scaffolding", 190, 12),
    con("c_st", "Steelfix Reinforcing", "Reinforcement", 150, 240),
    con("c_ca", "Northside Carpentry", "Carpentry", 300, 280),
    con("c_fo", "FormRight Formwork", "Formwork", 120, 150),
  ];
  function con(id: string, name: string, trade: string, plDays: number, wcDays: number): Contractor {
    return {
      id,
      orgId: o,
      legalName: `${name} Pty Ltd`,
      tradingName: name,
      abn: "00 000 000 000",
      trade,
      insurances: [
        { type: "Public liability", expires: date(plDays), verified: true },
        { type: "Workers comp", expires: date(wcDays), verified: true },
      ],
    };
  }

  const projects: Project[] = [
    {
      id: "p_riv", orgId: o, code: "P-2041", name: "Riverside Apartments", address: "14 Wharf Rd, Riverside NSW",
      client: "Harbourview Developments", type: "Residential", status: "construction", pmId: "u_pm",
      contractSum: $m(18.0), startDate: date(-260), pcDate: date(234), plannedProgress: 62, verifiedProgress: 55,
      nextMilestone: { name: "L4 slab pour", date: date(2) }, weather: "Fine, 24°C",
    },
    {
      id: "p_har", orgId: o, code: "P-2038", name: "Harbour St Fit-out", address: "200 Harbour St, Sydney NSW",
      client: "Meridian Property Group", type: "Commercial", status: "construction", pmId: "u_pm",
      contractSum: $m(4.15), startDate: date(-150), pcDate: date(23), plannedProgress: 81, verifiedProgress: 70,
      nextMilestone: { name: "Practical completion", date: date(23) },
    },
    {
      id: "p_nor", orgId: o, code: "P-2044", name: "Northgate Warehouse", address: "8 Logistics Dr, Northgate NSW",
      client: "Coastline Logistics", type: "Industrial", status: "construction", pmId: "u_pm",
      contractSum: $m(9.7), startDate: date(-90), pcDate: date(200), plannedProgress: 31, verifiedProgress: 31,
      nextMilestone: { name: "Portal frames", date: date(12) },
    },
    {
      id: "p_elm", orgId: o, code: "P-2046", name: "Elm Grove Townhouses", address: "31 Elm Grove, Westfield NSW",
      client: "Elm Grove Living", type: "Residential", status: "construction", pmId: "u_pm",
      contractSum: $m(6.1), startDate: date(-40), pcDate: date(320), plannedProgress: 12, verifiedProgress: 12,
      nextMilestone: { name: "Slab on ground", date: date(8) },
    },
  ];

  const locations: Location[] = [
    loc("l_rb1", "p_riv", "B", "L1", "Units 101–108"),
    loc("l_rb2", "p_riv", "B", "L2", "Units 201–208"),
    loc("l_rb3", "p_riv", "B", "L3", "Units 301–308"),
    loc("l_rb3c", "p_riv", "B", "L3", "Corridor"),
    loc("l_rb4", "p_riv", "B", "L4", "Slab"),
    loc("l_h1", "p_har", "Tower", "L12", "North wing"),
    loc("l_h2", "p_har", "Tower", "L12", "South wing"),
    loc("l_n1", "p_nor", "Main", "Ground", "Grid A–F"),
    loc("l_e1", "p_elm", "Lot 1–6", "Ground", "Slab"),
  ];
  function loc(id: string, projectId: string, building: string, level: string, zone: string): Location {
    return { id, projectId, building, level, zone };
  }

  // ---- workers & credentials
  const workers: Worker[] = [];
  const credentials: Credential[] = [];
  const firstNames = ["Liam", "Noah", "Mia", "Ava", "Leo", "Kai", "Zoe", "Eli", "Ivy", "Max", "Ruby", "Jack", "Ella", "Theo", "Nina", "Owen", "Isla", "Finn", "Luca", "Ari"];
  const lastNames = ["Tran", "Nguyen", "Smith", "Kelly", "Brown", "Singh", "Wilson", "Martin", "Park", "Rossi", "Ali", "Cooper", "Walsh", "Reid", "Shaw"];
  let n = 0;
  const crew: [string, number][] = [
    ["c_co", 9], ["c_st", 7], ["c_fo", 8], ["c_wp", 5], ["c_pl", 6], ["c_el", 6], ["c_sc", 4],
  ];
  for (const [contractorId, size] of crew) {
    for (let i = 1; i <= size; i++) {
      const id = `w_${contractorId.slice(2)}${i}`;
      const name = id === "w_co1" ? "Sam Okafor" : `${firstNames[n % firstNames.length]} ${lastNames[(n * 7) % lastNames.length]}`;
      n++;
      // One concreter is missing the Riverside induction (drives the readiness item).
      const inducted = id === "w_co9" ? ["p_nor"] : ["p_riv", "p_nor"];
      workers.push({ id, name, contractorId, phone: "04xx xxx xxx", inductedProjectIds: inducted });
      credentials.push({ id: `cr_${id}_wc`, workerId: id, type: "White Card", number: `WC${100000 + n}`, status: "verified", verifiedBy: "u_sup", verifiedMethod: "Sighted original" });
    }
  }
  credentials.push(
    { id: "cr_ewp_sam", workerId: "w_co1", type: "EWP licence", number: "HRW-EWP-2231", expires: date(7), status: "verified", verifiedBy: "u_sup", verifiedMethod: "SafeWork register" },
    { id: "cr_ewp_tran", workerId: "w_sc2", type: "EWP licence", number: "HRW-EWP-1180", expires: date(6), status: "verified", verifiedBy: "u_sup", verifiedMethod: "SafeWork register" },
    { id: "cr_fa_1", workerId: "w_co2", type: "First aid", number: "HLTAID011", expires: date(200), status: "verified" },
    { id: "cr_dog_1", workerId: "w_st1", type: "Dogging licence", number: "HRW-DG-5521", expires: date(400), status: "awaiting_verification" },
  );
  const tran = workers.find((w) => w.id === "w_sc2");
  if (tran) tran.name = "J. Tran";

  // ---- attendance: 37 on site at Riverside today from 6 companies
  const attendance: AttendanceEvent[] = [];
  const onSite = workers.filter((w) => w.contractorId !== "c_sc" && w.id !== "w_co1" && w.id !== "w_co9").slice(0, 37);
  onSite.forEach((w, i) => {
    attendance.push({ id: `a_${w.id}`, projectId: "p_riv", workerId: w.id, kind: "check_in", at: day(0, 6, 15 + (i % 40)), method: i % 9 === 0 ? "kiosk" : "qr" });
  });
  // Northgate and Harbour have their own crews on site (counted in the company total).
  for (let i = 0; i < 47; i++) {
    attendance.push({ id: `a_x${i}`, projectId: i < 30 ? "p_nor" : "p_har", workerId: `w_ext${i}`, kind: "check_in", at: day(0, 6, 30), method: "qr" });
  }

  // ---- programme
  const tasks: ProgrammeTask[] = [
    task("t_r1", "p_riv", "L3 slab — pour & cure", "Concrete", "c_co", -40, -30, -40, -30, false, 100, "complete"),
    task("t_r2", "p_riv", "L4 slab — reo & formwork", "Formwork", "c_fo", -6, 1, -6, 1, false, 80, "in_progress", { itpId: "itp_r07" }),
    task("t_r3", "p_riv", "L4 slab pour", "Concrete", "c_co", 2, 2, 2, 2, true, 0, "blocked", { itpId: "itp_r07", swmsId: "swms_r03", predecessorIds: ["t_r2"] }),
    task("t_r4", "p_riv", "L3 waterproofing", "Waterproofing", "c_wp", -3, 3, -1, 5, false, 45, "in_progress"),
    task("t_r5", "p_riv", "L2 services rough-in", "Plumbing", "c_pl", 0, 10, 1, 11, false, 10, "in_progress"),
    task("t_r6", "p_riv", "L1 framing", "Carpentry", "c_ca", 6, 14, 7, 16, false, 0, "not_started"),
    task("t_r7", "p_riv", "L3 tiling", "Tiling", "c_ti", 6, 18, 8, 20, false, 0, "not_started", { predecessorIds: ["t_r4"] }),
    task("t_h1", "p_har", "L12 ceilings close-up", "Carpentry", "c_ca", -10, 4, -10, 8, false, 60, "in_progress"),
    task("t_h2", "p_har", "Practical completion", "—", undefined, 23, 23, 23, 23, true, 0, "not_started"),
    task("t_n1", "p_nor", "Portal frames", "Steel", "c_st", 12, 30, 12, 30, true, 0, "not_started"),
    task("t_e1", "p_elm", "Slab on ground", "Concrete", "c_co", 8, 8, 8, 8, true, 0, "not_started"),
  ];
  function task(
    id: string, projectId: string, name: string, trade: string, contractorId: string | undefined,
    bs: number, bf: number, fs: number, ff: number, isMilestone: boolean, progress: number,
    status: ProgrammeTask["status"], extra: Partial<ProgrammeTask> = {},
  ): ProgrammeTask {
    return {
      id, projectId, name, trade, contractorId, baselineStart: date(bs), baselineFinish: date(bf),
      forecastStart: date(fs), forecastFinish: date(ff), isMilestone, progress, status,
      predecessorIds: [], ...extra,
    };
  }

  // ---- defects
  const defects: Defect[] = [];
  let defNo = 90;
  const def = (
    projectId: string, title: string, locationId: string, room: string, trade: string,
    contractorId: string | undefined, priority: Priority, due: number | undefined, status: DefectStatus,
    raisedDaysAgo = 8, extra: Partial<Defect> = {},
  ) => {
    defNo++;
    defects.push({
      id: `d_${defNo}`, orgId: o, projectId, ref: extra.ref ?? `DEF-${String(defNo).padStart(4, "0")}`, title,
      description: title + ".", category: "Workmanship", locationId, room, trade, contractorId, priority,
      dueDate: due === undefined ? undefined : date(due), status, raisedBy: "u_sup", raisedAt: day(-raisedDaysAgo, 10),
      photos: ["photo-1.jpg"], evidencePhotos: [], ...extra,
    });
  };
  def("p_riv", "Paint overspray on window frame", "l_rb1", "Unit 102", "Painting", undefined, "low", undefined, "open", 3, { ref: "DEF-0099" });
  def("p_riv", "GPO not level", "l_rb2", "Unit 203", "Electrical", "c_el", "low", 8, "assigned", 6, { ref: "DEF-0104" });
  def("p_riv", "Missing fire collar at riser", "l_rb2", "Riser 1", "Plumbing", "c_pl", "high", 5, "assigned", 4, { ref: "DEF-0110" });
  def("p_riv", "Exposed reo at slab edge", "l_rb3", "East edge", "Concrete", "c_co", "medium", 2, "rectifying", 9, { ref: "DEF-0115" });
  def("p_riv", "Skirting gap over 3mm", "l_rb2", "Unit 205", "Carpentry", "c_ca", "low", 9, "assigned", 2, { ref: "DEF-0118" });
  def("p_riv", "Cracked tile at lift lobby", "l_rb2", "Lift lobby", "Tiling", undefined, "medium", undefined, "open", 1, { ref: "DEF-0120" });
  def("p_riv", "Puddle flange not lapped at floor waste", "l_rb3", "Unit 302", "Waterproofing", "c_wp", "high", -1, "assigned", 7, { ref: "DEF-0125" });
  def("p_riv", "Bond breaker missing at wall junction", "l_rb3", "Unit 306", "Waterproofing", "c_wp", "high", -4, "rectifying", 10, { ref: "DEF-0128" });
  def("p_riv", "Upturn height below spec", "l_rb3", "Unit 301", "Waterproofing", "c_wp", "medium", 6, "assigned", 2, { ref: "DEF-0131" });
  def("p_riv", "Penetration not sealed, riser 2", "l_rb3c", "Riser 2", "Plumbing", "c_pl", "high", 3, "ready_for_verification", 5, {
    ref: "DEF-0139", rectificationNote: "Sealed with fire-rated sealant, collar fitted.", evidencePhotos: ["fix-1.jpg", "fix-2.jpg"],
  });
  def("p_riv", "Membrane lap short at shower hob", "l_rb3", "Unit 304 · Ensuite", "Waterproofing", "c_wp", "high", -2, "assigned", 6, { ref: "DEF-0142" });
  def("p_riv", "Chipped bench edge", "l_rb1", "Unit 104", "Joinery", "c_ca", "low", -10, "closed", 20, {
    ref: "DEF-0091", rectificationNote: "Edge replaced.", evidencePhotos: ["fix.jpg"], verifiedBy: "u_sup",
  });
  defNo = 200;
  // Harbour St — 9 open, 2 overdue
  const harbour: [string, number | undefined, DefectStatus][] = [
    ["Ceiling tile damaged, meeting room 3", -3, "assigned"], ["Door closer not adjusted", 2, "assigned"],
    ["Fire stopping incomplete at L12 riser", -1, "rectifying"], ["Carpet seam visible at reception", 4, "assigned"],
    ["Downlight not aligned to grid", 6, "open"], ["Glazing film bubbled", 3, "ready_for_verification"],
    ["Joinery handle missing, kitchenette", 7, "assigned"], ["Paint touch-up at column C4", 5, "assigned"],
    ["Signage misaligned at lift", 10, "open"],
  ];
  harbour.forEach(([t, due, s], i) =>
    def("p_har", t, i % 2 ? "l_h1" : "l_h2", "", "Fit-out", s === "open" ? undefined : "c_ca", "medium", due, s, 5, {
      evidencePhotos: s === "ready_for_verification" ? ["fix.jpg"] : [], rectificationNote: s === "ready_for_verification" ? "Film replaced." : undefined,
    }),
  );
  // Northgate — 4 open, 1 overdue; Elm Grove — 3 open
  def("p_nor", "Holding-down bolt projection short", "l_n1", "Grid C3", "Steel", "c_st", "high", -2, "assigned");
  def("p_nor", "Slab joint sawcut late", "l_n1", "Grid E", "Concrete", "c_co", "medium", 5, "assigned");
  def("p_nor", "Stormwater pit lid missing", "l_n1", "Hardstand", "Civil", undefined, "high", undefined, "open");
  def("p_nor", "Bracing cleat misaligned", "l_n1", "Grid B2", "Steel", "c_st", "medium", 9, "assigned");
  def("p_elm", "Set-out peg disturbed", "l_e1", "Lot 3", "Survey", undefined, "medium", undefined, "open");
  def("p_elm", "Termite collar missing", "l_e1", "Lot 2", "Plumbing", "c_pl", "high", 4, "assigned");
  def("p_elm", "Vapour barrier torn", "l_e1", "Lot 5", "Concrete", "c_co", "medium", 3, "assigned");

  // ---- ITPs
  const itps: Itp[] = [
    {
      id: "itp_r07", projectId: "p_riv", ref: "ITP-07", title: "L4 slab — concrete", templateVersion: 3, taskId: "t_r3",
      points: [
        { id: "ip1", name: "Reinforcement", check: "Bar size, spacing and cover checked against S-201 rev C", type: "hold", status: "submitted", evidence: ["r1.jpg", "r2.jpg", "r3.jpg", "r4.jpg"] },
        { id: "ip2", name: "Formwork", check: "Dimensions and stability", type: "inspection", status: "released", evidence: ["f1.jpg"], releasedBy: "u_sup", releasedAt: day(-1, 15) },
        { id: "ip3", name: "Pre-pour services & embeds", check: "Services, sleeves and embeds confirmed", type: "hold", status: "released", evidence: ["s1.jpg"], releasedBy: "u_pm", releasedAt: day(-1, 16) },
        { id: "ip4", name: "Structural engineer", check: "Engineer site inspection", type: "witness", status: "pending", evidence: [] },
        { id: "ip5", name: "Concrete delivery", check: "Record batch dockets and slump tests", type: "test", status: "pending", evidence: [] },
        { id: "ip6", name: "Finish & curing", check: "Finish tolerance and curing regime", type: "inspection", status: "pending", evidence: [] },
      ],
    },
    {
      id: "itp_r06", projectId: "p_riv", ref: "ITP-06", title: "L3 slab — concrete", templateVersion: 3, taskId: "t_r1",
      points: [
        { id: "ip1", name: "Reinforcement", check: "Bar size, spacing and cover", type: "hold", status: "released", evidence: ["a.jpg"], releasedBy: "u_pm", releasedAt: minsAgo(18) },
      ],
    },
    {
      id: "itc_r14", projectId: "p_riv", ref: "ITC-14", title: "L3 waterproofing flood test · Units 301–306", templateVersion: 1,
      points: [
        { id: "ip1", name: "Flood test 24h", check: "No drop in water level after 24 hours", type: "test", status: "submitted", evidence: ["ft1.jpg", "ft2.jpg"] },
      ],
    },
    {
      id: "itp_h03", projectId: "p_har", ref: "ITP-03", title: "L12 fire stopping", templateVersion: 2,
      points: [
        { id: "ip1", name: "Penetrations sealed", check: "All penetrations sealed with approved system", type: "hold", status: "rejected", evidence: ["fs.jpg"] },
      ],
    },
  ];

  // ---- SWMS
  const swms: Swms[] = [
    {
      id: "swms_r03", projectId: "p_riv", ref: "SWMS-03", title: "Concrete placement", activity: "Concrete pumping and placement",
      contractorId: "c_co", version: 3, status: "approved", highRiskCategories: ["Work near mobile plant", "Fall > 2m"],
      acknowledgedBy: ["w_co2", "w_co3", "w_co4", "w_co5", "w_co6"],
    },
    {
      id: "swms_r04", projectId: "p_riv", ref: "SWMS-04", title: "Wet area waterproofing", activity: "Membrane application",
      contractorId: "c_wp", version: 1, status: "approved", highRiskCategories: ["Hazardous chemicals"],
      acknowledgedBy: ["w_wp1", "w_wp2", "w_wp3", "w_wp4", "w_wp5"],
    },
    {
      id: "swms_r05", projectId: "p_riv", ref: "SWMS-05", title: "Scaffold alteration", activity: "Scaffold modification",
      contractorId: "c_sc", version: 2, status: "in_review", highRiskCategories: ["Fall > 2m"], acknowledgedBy: [],
    },
    {
      id: "swms_n02", projectId: "p_nor", ref: "SWMS-02", title: "Formwork", activity: "Formwork erection", contractorId: "c_fo",
      version: 2, status: "submitted", highRiskCategories: ["Fall > 2m"], acknowledgedBy: [],
    },
    {
      id: "swms_n03", projectId: "p_nor", ref: "SWMS-03", title: "Steel erection", activity: "Portal frame erection", contractorId: "c_st",
      version: 1, status: "submitted", highRiskCategories: ["Fall > 2m", "Work near mobile plant"], acknowledgedBy: [],
    },
  ];

  // ---- documents
  const documents: DocumentRecord[] = [
    doc("p_riv", "A-101", "General arrangement — L1", "Architectural", "3", "current", -60),
    doc("p_riv", "A-102", "General arrangement — L2–L4", "Architectural", "3", "superseded", -60),
    doc("p_riv", "A-102", "General arrangement — L2–L4", "Architectural", "4", "in_review", -1),
    doc("p_riv", "S-201", "Slab reinforcement — L4", "Structural", "C", "current", -30),
    doc("p_riv", "S-201", "Slab reinforcement — L4", "Structural", "D", "in_review", 0),
    doc("p_riv", "H-301", "Hydraulic layout — L3", "Services", "2", "current", -45),
    doc("p_riv", "SPEC-07", "Waterproofing specification", "Specification", "1", "current", -200),
    doc("p_riv", "SMP-01", "Site safety management plan", "Safety", "2", "current", -120),
    doc("p_nor", "A-102", "Floor plan", "Architectural", "4", "current", -0.1),
    doc("p_har", "A-501", "Reflected ceiling plan — L12", "Architectural", "5", "current", -14),
  ];
  function doc(projectId: string, number: string, title: string, category: DocumentRecord["category"], revision: string, status: DocumentRecord["status"], uploaded: number): DocumentRecord {
    return { id: `doc_${projectId}_${number}_${revision}`, projectId, number, title, category, revision, status, uploadedBy: "u_pm", uploadedAt: day(Math.floor(uploaded), 11) };
  }

  // ---- budgets: lines sum to each project's forecast final cost
  const budgetLines: BudgetLine[] = [];
  const categories: [string, string, number][] = [
    ["01-PRE", "Preliminaries", 0.11], ["02-CON", "Concrete", 0.19], ["03-STL", "Reinforcement & steel", 0.12],
    ["04-FRM", "Formwork", 0.08], ["05-HYD", "Plumbing & hydraulics", 0.1], ["06-ELE", "Electrical", 0.1],
    ["07-WPF", "Waterproofing", 0.04], ["08-FIN", "Finishes", 0.16], ["09-LAB", "Own labour", 0.1],
  ];
  const plan: [string, number, number, number][] = [
    // projectId, forecast final ($m), committed ratio, actual ratio
    ["p_riv", 16.95, 0.78, 0.58], ["p_har", 4.31, 0.96, 0.82], ["p_nor", 8.86, 0.55, 0.3], ["p_elm", 5.52, 0.4, 0.1],
  ];
  for (const [projectId, ffc, cr, ar] of plan) {
    for (const [code, description, w] of categories) {
      const forecastFinal = Math.round($m(ffc) * w);
      budgetLines.push({
        id: `bl_${projectId}_${code}`, projectId, costCode: code, description,
        originalBudget: Math.round(forecastFinal * (projectId === "p_har" ? 0.97 : 1.004)),
        committed: Math.round(forecastFinal * cr), actual: Math.round(forecastFinal * ar), forecastFinal,
      });
    }
  }

  // ---- variations
  const variations: Variation[] = [
    vari("p_riv", "VAR-009", "Additional balcony waterproofing", $(120_000), "approved", -60),
    vari("p_riv", "VAR-010", "Client-requested kitchen upgrade, L3", $(186_500), "approved", -40),
    vari("p_riv", "VAR-011", "Façade louvre change", $(93_500), "included_in_claim", -30),
    vari("p_riv", "VAR-012", "Extra steel — L4 transfer beam", $(48_200), "under_review", -3),
    vari("p_riv", "VAR-013", "Rock excavation, lift pit", $(162_000), "submitted", -1),
    vari("p_har", "VAR-004", "Additional data points", $(100_000), "approved", -50),
    vari("p_har", "VAR-005", "Reception joinery redesign", $(214_000), "submitted", -6),
    vari("p_nor", "VAR-002", "Hardstand extension", $(100_000), "approved", -20),
    vari("p_nor", "VAR-003", "Additional roller door", $(215_800), "under_review", -4),
  ];
  function vari(projectId: string, ref: string, title: string, amount: number, status: Variation["status"], raised: number): Variation {
    const approved = status === "approved" || status === "included_in_claim";
    return {
      id: `v_${projectId}_${ref}`, orgId: o, projectId, ref, title, reason: "Client instruction", amount,
      approvedAmount: approved ? amount : undefined, timeImpactDays: 0, status, raisedAt: day(raised),
      approvedBy: approved ? "u_dir" : undefined, approvedAt: approved ? day(raised + 5) : undefined,
    };
  }

  // ---- claims
  const claims: ProgressClaim[] = [
    { id: "pc_r09", projectId: "p_riv", ref: "PC-09", periodEnd: date(-26), dueDate: date(-12), claimed: $(1_240_000), certified: $(1_190_000), paid: $(1_190_000), status: "paid" },
    { id: "pc_r10", projectId: "p_riv", ref: "PC-10", periodEnd: date(4), dueDate: date(4), claimed: $(960_000), status: "draft" },
    { id: "pc_h09", projectId: "p_har", ref: "PC-09", periodEnd: date(-5), dueDate: date(2), claimed: $(512_000), status: "submitted" },
    { id: "pc_h08", projectId: "p_har", ref: "PC-08", periodEnd: date(-35), dueDate: date(-9), claimed: $(410_000), certified: $(310_000), paid: 0, status: "certified" },
    { id: "pc_n04", projectId: "p_nor", ref: "PC-04", periodEnd: date(-4), dueDate: date(10), claimed: $(598_000), certified: $(598_000), status: "certified" },
    { id: "pc_e02", projectId: "p_elm", ref: "PC-02", periodEnd: date(-3), dueDate: date(11), claimed: $(100_000), status: "submitted" },
  ];

  const diary: DiaryEntry[] = [
    {
      id: "di_r1", projectId: "p_riv", date: date(-1), weather: "Fine, 24°C", workersOnSite: 37, companiesOnSite: 6, authorId: "u_sup", submitted: true,
      notes: "L4 reo 80% placed. Waterproofer on L3 units 301–306. Pump delivery confirmed for Thursday.",
      delays: "Crane down 40 min for wind.",
    },
    { id: "di_e1", projectId: "p_elm", date: date(-1), weather: "Showers, 19°C", workersOnSite: 11, companiesOnSite: 3, authorId: "u_sup", submitted: true, notes: "Set-out complete for lots 1–6." },
  ];

  const audit: AuditEvent[] = [
    { id: "ae1", orgId: o, projectId: "p_riv", recordType: "itp_point", recordId: "itp_r06", action: "Hold point released", detail: "ITP-06 L3 slab", actorId: "u_pm", at: minsAgo(18) },
    { id: "ae2", orgId: o, projectId: "p_har", recordType: "itp_point", recordId: "itp_h03", action: "Inspection failed", detail: "Fire stopping L12", actorId: "u_qm", at: minsAgo(62) },
    { id: "ae3", orgId: o, projectId: "p_nor", recordType: "document", recordId: "doc_p_nor_A-102_4", action: "A-102 rev 4 issued for construction", actorId: "u_pm", at: minsAgo(130) },
    { id: "ae4", orgId: o, projectId: "p_elm", recordType: "diary", recordId: "di_e1", action: "Site diary submitted", actorId: "u_sup", at: day(-1, 16, 40) },
    { id: "ae5", orgId: o, projectId: "p_riv", recordType: "defect", recordId: "d_100", action: "Evidence added", detail: "DEF-0139 · 2 photos", actorId: "u_sub", at: day(-1, 11, 47) },
  ];

  return {
    org, users, projects, locations, contractors, workers, credentials, tasks, defects, itps, swms, documents,
    attendance, budgetLines, variations, claims, diary, audit,
    seq: { defect: 230, variation: 13, audit: 100, attendance: 1000 },
  };
}
