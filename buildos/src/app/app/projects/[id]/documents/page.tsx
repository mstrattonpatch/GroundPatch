import { AlertTriangle } from "lucide-react";
import { loadProject } from "@/lib/server/load";
import { db, getUser } from "@/lib/server/store";
import { PageHeader, StatusBadge } from "@/components/ui";
import { dayMonth } from "@/lib/format";

export const metadata = { title: "Documents" };

export default async function Documents({ params }: { params: Promise<{ id: string }> }) {
  const { project: p } = await loadProject(params);
  const base = `/app/projects/${p.id}`;
  const docs = db().documents.filter((d) => d.projectId === p.id).sort((a, b) => a.number.localeCompare(b.number) || b.revision.localeCompare(a.revision));
  const pending = docs.filter((d) => d.status === "in_review");
  return (
    <>
      <PageHeader crumbs={[{ href: "/app/projects", label: "Projects" }, { href: base, label: p.name }]} title="Documents & drawings" />
      {pending.length > 0 && (
        <div className="notice notice-warn">
          <AlertTriangle size={16} aria-hidden />
          <span>{pending.map((d) => `${d.number} rev ${d.revision}`).join(", ")} {pending.length > 1 ? "are" : "is"} in review. The previous revision stays current until review is complete, then it&apos;s labelled superseded and kept for audit.</span>
        </div>
      )}
      <section className="card">
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Number</th><th>Title</th><th>Category</th><th>Rev</th><th>Uploaded</th><th>Status</th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} style={d.status === "superseded" ? { opacity: 0.6 } : undefined}>
                  <td className="mono">{d.number}</td>
                  <td>{d.title}</td>
                  <td className="small">{d.category}</td>
                  <td className="mono">{d.revision}</td>
                  <td className="small">{getUser(d.uploadedBy)?.name} · {dayMonth(d.uploadedAt)}</td>
                  <td><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="small muted">File storage (private bucket, short-lived signed links, virus scanning) and drawing markup come with the backend build.</p>
    </>
  );
}
