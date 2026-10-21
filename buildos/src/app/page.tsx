import Link from "next/link";
import { ArrowRight, Check, ClipboardCheck, Lock, ShieldCheck, AlignLeft, AlertTriangle } from "lucide-react";
import { PublicFooter, PublicNav } from "@/components/public-chrome";

const PILLARS = [
  { icon: ClipboardCheck, tint: "var(--green-tint)", color: "var(--green-text)", title: "Quality", body: "Defects pinned to drawings, template-driven ITPs with hold and witness points, NCRs and audit-ready handover packs.", tags: ["Defects", "ITPs", "NCRs", "Handover"] },
  { icon: AlignLeft, tint: "var(--blue-tint)", color: "var(--blue)", title: "Projects & commercial", body: "Programmes, drawings with revision control, site diaries, budgets, purchase orders, variations and progress claims.", tags: ["Programme", "Documents", "Variations", "Claims"] },
  { icon: ShieldCheck, tint: "var(--amber-tint)", color: "var(--amber-text)", title: "Workforce & safety", body: "Worker credential wallets, inductions, SWMS review and acknowledgement, QR site sign-in and live muster lists.", tags: ["Credentials", "SWMS", "Site access", "Permits"] },
];

const FLOW = [
  ["Programme", "Pour is scheduled", "The task carries its ITP, SWMS and crew."],
  ["Workforce", "Crew signs in", "Credentials and inductions checked at the gate."],
  ["Quality", "Hold point released", "Photos and sign-off recorded against the task."],
  ["Site diary", "Day is logged", "Attendance and inspections pre-fill the diary."],
  ["Commercial", "Claim backed by evidence", "The assessor sees the site record beside the claim."],
];

export default function Home() {
  return (
    <div className="pub">
      <PublicNav />
      <main>
        <section>
          <div className="inner hero-grid">
            <div>
              <span className="pill-eyebrow">Quality · Projects · Workforce · Commercial</span>
              <h1 className="display">Everything on site.<br />Everything under control.</h1>
              <p className="lede">One connected platform for construction quality, project delivery, workforce compliance and commercial management. Enter it once, on site or in the office, and every team sees the same truth.</p>
              <div className="row wrap" style={{ marginTop: 28, gap: 12 }}>
                <Link href="/demo" className="btn btn-primary btn-lg">Book a demo <ArrowRight size={16} aria-hidden /></Link>
                <Link href="/login" className="btn btn-lg">Explore the platform</Link>
              </div>
              <p className="small muted" style={{ marginTop: 20 }}>Built in Australia for builders, head contractors and subcontractors.</p>
            </div>
            <div className="mock" aria-label="Product preview: Level 4 slab pour readiness">
              <div className="mock-rail" />
              <div className="mock-body">
                <div className="row"><b>Level 4 slab pour — readiness</b><span className="spacer" /><span className="badge badge-amber"><AlertTriangle size={12} />2 items outstanding</span></div>
                <div className="mock-row"><b>Programme</b> · Pour scheduled Thu 6:00am<span className="s green-text"><Check size={12} /> On track</span></div>
                <div className="mock-row"><b>ITP-07</b> · Reinforcement hold point<span className="s red-text"><Lock size={11} /> Hold · awaiting release</span></div>
                <div className="mock-row"><b>Defects</b> · 0 open on Level 4<span className="s green-text"><Check size={12} /> Clear</span></div>
                <div className="mock-row"><b>Concreter crew</b> · 1 of 9 missing induction<span className="s amber-text"><AlertTriangle size={11} /> Action</span></div>
                <div className="mock-row"><b>SWMS</b> · Concrete placement v3</div>
              </div>
              <div className="mock-phone">
                <div className="muted" style={{ fontSize: 10.5 }}>ITP-07 · Hold point</div>
                <b style={{ display: "block", margin: "4px 0 8px" }}>Bar spacing &amp; cover checked</b>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}><div className="photo-ph" style={{ minHeight: 40 }} /><div className="photo-ph" style={{ minHeight: 40, background: "#a9b8ae" }} /></div>
                <div className="muted" style={{ fontSize: 10.5, margin: "6px 0 8px" }}>4 photos · 40mm cover measured</div>
                <div className="btn btn-primary" style={{ height: 30, fontSize: 11.5, width: "100%" }}>Release hold point</div>
              </div>
            </div>
          </div>
        </section>

        <section className="problem">
          <div className="inner hero-grid" style={{ gap: 40 }}>
            <div>
              <span className="eyebrow" style={{ color: "#8fd1b3" }}>The problem</span>
              <h2 className="section" style={{ marginTop: 10, color: "#fff" }}>Three systems. The same data typed in three times. Nobody sees the whole job.</h2>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {[
                "A subbie's crew, their SWMS, their defects and their progress claim live in four different places.",
                "The office approves a claim without seeing the failed inspection on site.",
                "BuildOS keeps one project record, so every module reads from and writes to the same thing.",
              ].map((t, i) => (
                <div key={i} className="card-dark"><span className="mono" style={{ color: "#8fd1b3" }}>0{i + 1}</span><span>{t}</span></div>
              ))}
            </div>
          </div>
        </section>

        <section id="platform">
          <div className="inner">
            <div className="row" style={{ alignItems: "flex-end" }}>
              <h2 className="section" style={{ maxWidth: 520 }}>Three pillars, one connected platform</h2>
              <span className="spacer" />
              <Link href="/login" className="link">See every feature →</Link>
            </div>
            <div className="pillars">
              {PILLARS.map((p) => (
                <div key={p.title} className="card card-pad stack" style={{ padding: 24 }}>
                  <span className="li-icon" style={{ background: p.tint, color: p.color }}><p.icon size={20} aria-hidden /></span>
                  <h3 style={{ fontSize: 18 }}>{p.title}</h3>
                  <p className="muted">{p.body}</p>
                  <div className="row wrap" style={{ gap: 6 }}>{p.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ paddingTop: 0 }}>
          <div className="inner">
            <span className="eyebrow">How it connects</span>
            <h2 className="section" style={{ marginTop: 8 }}>From the pour to the progress claim</h2>
            <div className="flow">
              {FLOW.map(([k, t, b], i) => (
                <div key={k}>
                  <div className="mono" style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: i === 4 ? "var(--green-text)" : "var(--muted)" }}>Step {i + 1} · {k}</div>
                  <h3 style={{ margin: "8px 0 6px" }}>{t}</h3>
                  <p className="small muted">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="integrations" style={{ paddingTop: 0 }}>
          <div className="inner two-col">
            <div className="card" style={{ padding: 28 }}>
              <h2 style={{ fontSize: 24 }}>Built to stand up in a dispute</h2>
              <div className="two-col" style={{ marginTop: 18, gap: 18 }}>
                <div><b>Full audit history</b><p className="small muted">Who changed what, and when.</p></div>
                <div><b>Separated companies</b><p className="small muted">Subbies see their records, never your margin.</p></div>
                <div><b>Private files</b><p className="small muted">Short-lived links, never public URLs.</p></div>
                <div><b>Data location</b><p className="small muted">[Hosting region to confirm]</p></div>
              </div>
              <Link className="link small" href="/security" style={{ display: "inline-block", marginTop: 16 }}>Read about security →</Link>
            </div>
            <div className="card" style={{ padding: 28 }}>
              <h2 style={{ fontSize: 24 }}>Works with what you already run</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 18 }}>
                {["[Accounting]", "[Microsoft 365]", "[Google Workspace]", "[Payroll]", "Calendars", "CSV / XLSX"].map((x) => (
                  <div key={x} className="mono" style={{ border: "1px solid var(--border)", borderRadius: 8, height: 52, display: "grid", placeItems: "center", fontSize: 12.5 }}>{x}</div>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: 14 }}>Starting with reliable CSV/XLSX import and one accounting integration.</p>
            </div>
          </div>
        </section>

        <section id="industries" style={{ paddingTop: 0 }}>
          <div className="inner">
            <div className="cta-band">
              <div style={{ flex: 1, minWidth: 260 }}>
                <h2 style={{ fontSize: 30, color: "#fff" }}>See your next project in BuildOS</h2>
                <p style={{ marginTop: 8, color: "#d8efe4" }}>30-minute walkthrough with your own project structure. Plans from [PRICE] per month.</p>
              </div>
              <Link href="/demo" className="btn btn-lg" style={{ color: "var(--ink)" }}>Book a demo</Link>
              <Link href="/pricing" className="btn btn-lg" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.5)" }}>View pricing</Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
