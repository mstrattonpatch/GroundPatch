import Link from "next/link";
import { Check } from "lucide-react";
import { PublicFooter, PublicNav } from "@/components/public-chrome";

export const metadata = { title: "Pricing" };

const PLANS = [
  { name: "Starter", who: "Small builders and subcontractors", items: ["Core projects & documents", "Defects with photos", "Basic scheduling", "Limited active projects"] },
  { name: "Professional", who: "Growing construction companies", items: ["Everything in Starter", "ITPs, NCRs & hold points", "Workforce, SWMS & site access", "Timesheets & commercial workflows"], featured: true },
  { name: "Enterprise", who: "Large builders and multi-site operators", items: ["Advanced permissions", "Integrations & portfolio analytics", "Audit controls", "Enterprise support"] },
];

export default function Pricing() {
  return (
    <div className="pub">
      <PublicNav />
      <main>
        <section>
          <div className="inner">
            <span className="eyebrow">Pricing</span>
            <h1 className="display" style={{ fontSize: 44 }}>Priced per company, not per click.</h1>
            <p className="lede">Subcontractors and invited workers don&apos;t need a paid seat to sign in, upload credentials or rectify their defects. No fee per defect, inspection or SWMS.</p>
            <div className="pillars">
              {PLANS.map((p) => (
                <div key={p.name} className="card stack" style={{ padding: 26, borderColor: p.featured ? "var(--green)" : undefined, borderWidth: p.featured ? 2 : 1 }}>
                  <h2>{p.name}</h2>
                  <p className="muted small">{p.who}</p>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>[PRICE]<span className="muted small" style={{ fontWeight: 500 }}> / month</span></div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">
                    {p.items.map((i) => <li key={i} className="row"><Check size={16} color="var(--green)" aria-hidden />{i}</li>)}
                  </ul>
                  <Link href="/demo" className={`btn ${p.featured ? "btn-primary" : ""}`}>Talk to us</Link>
                </div>
              ))}
            </div>
            <p className="small muted" style={{ marginTop: 18 }}>Plan structure is a starting point to test with customers — prices to be confirmed.</p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
