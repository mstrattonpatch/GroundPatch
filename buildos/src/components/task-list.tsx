import Link from "next/link";
import type { TaskItem } from "@/lib/server/insights";

export function TaskList({ items }: { items: TaskItem[] }) {
  if (!items.length) return <p className="muted small">Nothing waiting on you. Nice.</p>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {items.map((t) => (
        <Link key={t.id} href={t.href} className="task-item" data-tone={t.tone}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.title}</div>
          <div className="muted small">{t.sub}</div>
        </Link>
      ))}
    </div>
  );
}
