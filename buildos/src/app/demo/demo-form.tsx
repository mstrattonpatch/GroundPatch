"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

// Lead capture is not wired to a CRM yet — the form confirms locally only.
export function DemoForm() {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <div className="notice notice-ok"><CheckCircle2 size={16} aria-hidden /><span>Thanks — this prototype doesn&apos;t send the request anywhere yet. Hook it up to your CRM or inbox before launch.</span></div>
    );
  }
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
      <label className="field"><span>Name <span className="req">*</span></span><input className="input" required name="name" autoComplete="name" /></label>
      <label className="field"><span>Work email <span className="req">*</span></span><input className="input" required type="email" name="email" autoComplete="email" /></label>
      <label className="field"><span>Company</span><input className="input" name="company" autoComplete="organization" /></label>
      <label className="field"><span>What do you build?</span>
        <select className="input" name="type" defaultValue="">
          <option value="" disabled>Choose one</option><option>Commercial</option><option>Residential</option><option>Civil</option><option>Fit-out</option><option>Subcontractor</option>
        </select>
      </label>
      <button className="btn btn-primary btn-lg" type="submit">Book a demo</button>
    </form>
  );
}
