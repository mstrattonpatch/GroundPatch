import { requireUser } from "@/lib/server/session";
import { contractor, getProject } from "@/lib/server/store";
import { filterDefects, locationLabel } from "@/lib/server/registers";

// Permission-checked CSV export of the (filtered) defect register.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = getProject(user, id);
  if (!project) return new Response("Not found", { status: 404 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = filterDefects(user, id, sp);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["ID", "Title", "Location", "Trade", "Contractor", "Priority", "Due", "Status"].join(","),
    ...rows.map((d) => [d.ref, d.title, locationLabel(d), d.trade, contractor(d.contractorId)?.tradingName, d.priority, d.dueDate, d.status].map(esc).join(",")),
  ].join("\n");
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${project.code}-defects.csv"` },
  });
}
