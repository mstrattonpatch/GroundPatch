import Link from "next/link";
import { Logo } from "./ui";

export function PublicNav() {
  return (
    <header className="pub-nav">
      <div className="inner">
        <Link href="/"><Logo /></Link>
        <nav aria-label="Site">
          <Link href="/#platform">Platform</Link>
          <Link href="/#industries">Industries</Link>
          <Link href="/#integrations">Integrations</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/security">Security</Link>
        </nav>
        <div className="spacer" />
        <Link href="/login" style={{ fontWeight: 600, fontSize: 14 }}>Log in</Link>
        <Link href="/demo" className="btn btn-dark">Book a demo</Link>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="pub-foot">
      <div className="inner">
        <Logo size={20} />
        <div className="spacer" />
        <Link href="/#platform">Platform</Link>
        <Link href="/#industries">Industries</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/security">Security &amp; privacy</Link>
        <Link href="/demo">Contact</Link>
        <div className="spacer" />
        <span className="muted">© [Company name] · ABN [—]</span>
      </div>
    </footer>
  );
}
