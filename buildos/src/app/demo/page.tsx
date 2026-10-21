import Link from "next/link";
import { PublicFooter, PublicNav } from "@/components/public-chrome";
import { DemoForm } from "./demo-form";

export const metadata = { title: "Book a demo" };

export default function Demo() {
  return (
    <div className="pub">
      <PublicNav />
      <main>
        <section>
          <div className="inner hero-grid" style={{ alignItems: "start" }}>
            <div>
              <span className="eyebrow">Book a demo</span>
              <h1 className="display" style={{ fontSize: 44 }}>30 minutes, your own project structure.</h1>
              <p className="lede">We&apos;ll walk through a concrete pour from programme to progress claim using your buildings, trades and cost codes.</p>
              <p className="small muted" style={{ marginTop: 16 }}>Want to look around first? <Link href="/login" className="link">Explore the prototype</Link>.</p>
            </div>
            <div className="card card-pad"><DemoForm /></div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
