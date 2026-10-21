import { PublicFooter, PublicNav } from "@/components/public-chrome";

export const metadata = { title: "Security & privacy" };

const ITEMS = [
  ["Separate organisation spaces", "Every record carries an organisation ID and every request is checked against it, so one customer's data can't leak into another's."],
  ["Permissions on the server", "Role and project permissions are enforced on every backend request — not just by hiding buttons."],
  ["Tamper-evident history", "Inspection sign-offs, financial approvals and submitted compliance records keep a full history of who changed what, and when."],
  ["Private files", "Photos and documents live in private storage and are served through short-lived signed links, never public URLs."],
  ["Corrections, not deletions", "Submitted records are corrected through revisions or amendments rather than silently overwritten."],
  ["Privacy", "We are assessing Australian Privacy Act obligations, data hosting location and sub-processors. [Hosting region to confirm]"],
];

export default function Security() {
  return (
    <div className="pub">
      <PublicNav />
      <main>
        <section>
          <div className="inner">
            <span className="eyebrow">Security &amp; privacy</span>
            <h1 className="display" style={{ fontSize: 44 }}>Records you can rely on in a dispute.</h1>
            <div className="pillars">
              {ITEMS.map(([t, b]) => (
                <div key={t} className="card" style={{ padding: 24 }}><h3>{t}</h3><p className="muted" style={{ marginTop: 8 }}>{b}</p></div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
