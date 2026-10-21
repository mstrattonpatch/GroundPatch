import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Circle,
  CircleDashed,
  Clock,
  CloudOff,
  Lock,
  XCircle,
  type LucideIcon,
} from "lucide-react";

// One status language shared by every module: icon + word, never colour alone.

type Tone = "grey" | "outline" | "blue" | "green" | "amber" | "red" | "red-solid" | "dashed";

const STATUS: Record<string, { tone: Tone; icon: LucideIcon; label: string }> = {
  draft: { tone: "grey", icon: CircleDashed, label: "Draft" },
  open: { tone: "outline", icon: Circle, label: "Open" },
  assigned: { tone: "outline", icon: Circle, label: "Assigned" },
  not_started: { tone: "grey", icon: CircleDashed, label: "Not started" },
  pending: { tone: "grey", icon: CircleDashed, label: "Pending" },
  rectifying: { tone: "blue", icon: Clock, label: "Rectifying" },
  in_progress: { tone: "blue", icon: Clock, label: "In progress" },
  in_review: { tone: "blue", icon: Clock, label: "In review" },
  under_review: { tone: "blue", icon: Clock, label: "Under review" },
  submitted: { tone: "blue", icon: Clock, label: "Submitted" },
  ready_for_verification: { tone: "blue", icon: Clock, label: "In review" },
  awaiting_verification: { tone: "blue", icon: Clock, label: "Awaiting verification" },
  assessed: { tone: "blue", icon: Clock, label: "Assessed" },
  approved: { tone: "green", icon: Check, label: "Approved" },
  released: { tone: "green", icon: Check, label: "Released" },
  verified: { tone: "green", icon: Check, label: "Verified" },
  current: { tone: "green", icon: Check, label: "Current" },
  complete: { tone: "green", icon: Check, label: "Complete" },
  certified: { tone: "green", icon: Check, label: "Certified" },
  paid: { tone: "green", icon: Check, label: "Paid" },
  included_in_claim: { tone: "green", icon: Check, label: "In claim" },
  closed: { tone: "green", icon: Check, label: "Closed" },
  superseded: { tone: "grey", icon: CircleDashed, label: "Superseded" },
  overdue: { tone: "amber", icon: AlertTriangle, label: "Overdue" },
  expiring: { tone: "amber", icon: AlertTriangle, label: "Expiring" },
  changes_requested: { tone: "amber", icon: AlertTriangle, label: "Changes requested" },
  disputed: { tone: "amber", icon: AlertTriangle, label: "Disputed" },
  expired: { tone: "red", icon: XCircle, label: "Expired" },
  rejected: { tone: "red", icon: XCircle, label: "Rejected" },
  blocked: { tone: "red-solid", icon: Lock, label: "Blocked" },
  hold: { tone: "red-solid", icon: Lock, label: "Hold point" },
  offline: { tone: "dashed", icon: CloudOff, label: "Saved offline" },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] ?? { tone: "grey" as Tone, icon: Circle, label: status };
  const Icon = s.icon;
  return (
    <span className={`badge badge-${s.tone}`}>
      <Icon size={13} strokeWidth={2.4} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

export function Stepper<T extends string>({ steps, current }: { steps: { status: T; label: string }[]; current: T }) {
  const idx = steps.findIndex((s) => s.status === current);
  return (
    <ol className="stepper" aria-label="Workflow">
      {steps.map((s, i) => (
        <li key={s.status} className="row" style={{ gap: 6 }}>
          {i > 0 && <span className="sep" aria-hidden>›</span>}
          <span className="step" data-state={i < idx ? "done" : i === idx ? "current" : "todo"} aria-current={i === idx ? "step" : undefined}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Metric({
  label, value, note, tone, href,
}: { label: string; value: string | number; note?: React.ReactNode; tone?: "amber" | "red" | "muted"; href?: string }) {
  const body = (
    <>
      <div className="m-label">{label}</div>
      <div className="m-value">{value}</div>
      {note && (
        <div className={`m-note ${tone === "amber" ? "amber-text" : tone === "red" ? "red-text" : ""}`}>
          {tone === "amber" && <AlertTriangle size={12} strokeWidth={2.6} aria-hidden />}
          {tone === "red" && <Lock size={12} strokeWidth={2.6} aria-hidden />}
          {note}
        </div>
      )}
    </>
  );
  return href ? <Link className="metric" href={href}>{body}</Link> : <div className="metric">{body}</div>;
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="icon"><Icon size={20} aria-hidden /></div>
      <h3>{title}</h3>
      <p className="muted small" style={{ margin: "4px 0 14px", maxWidth: 420 }}>{body}</p>
      {action}
    </div>
  );
}

export function SampleTag() {
  return <span className="sample-tag" title="Illustrative figures for the prototype">Sample data</span>;
}

export function Logo({ light = false, size = 26 }: { light?: boolean; size?: number }) {
  return (
    <span className="row" style={{ gap: 9, fontWeight: 700, fontSize: 17, color: light ? "#fff" : "var(--ink)" }}>
      <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden>
        <rect width="26" height="26" rx="6" fill={light ? "#27815F" : "#182E27"} />
        <rect x="6" y="7" width="10" height="2.6" rx="1.3" fill="#fff" />
        <rect x="6" y="11.7" width="14" height="2.6" rx="1.3" fill="#fff" opacity=".85" />
        <rect x="6" y="16.4" width="7" height="2.6" rx="1.3" fill="#fff" opacity=".7" />
      </svg>
      BuildOS
    </span>
  );
}

export function PageHeader({
  crumbs, title, meta, actions,
}: { crumbs?: { href: string; label: string }[]; title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div style={{ minWidth: 0 }}>
        {crumbs && (
          <nav className="crumbs small muted" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.href}>
                {i > 0 && " › "}
                <Link href={c.href}>{c.label}</Link>
              </span>
            ))}
          </nav>
        )}
        <div className="row wrap" style={{ gap: 12 }}>
          <h1>{title}</h1>
        </div>
        {meta && <div className="page-meta muted">{meta}</div>}
      </div>
      {actions && <div className="row wrap page-actions">{actions}</div>}
    </div>
  );
}
