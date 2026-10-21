// Display helpers. Money is stored in cents.

export function money(cents: number, opts: { compact?: boolean; sign?: boolean } = {}): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? "-" : opts.sign && dollars > 0 ? "+" : "";
  const abs = Math.abs(dollars);
  if (opts.compact) {
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}m`;
    if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  }
  return `${sign}$${abs.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

export function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function longToday(): string {
  return new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** "2d ago", "today", "Fri 24 Oct" — relative when close, otherwise a date. */
export function dueLabel(iso?: string): string {
  if (!iso) return "—";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff < 0) return `${-diff}d ago`;
  if (diff === 1) return "Tomorrow";
  return shortDate(iso);
}

export function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
