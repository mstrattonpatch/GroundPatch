import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { db, listProjects } from "@/lib/server/store";
import { projectLocations } from "@/lib/server/registers";
import { can } from "@/lib/domain/permissions";
import { DefectForm } from "@/components/defect-form";

export default async function SiteDefect() {
  const user = await requireUser();
  const p = listProjects(user)[0];
  const contractors = db().contractors.filter((c) => ["Waterproofing", "Tiling", "Plumbing", "Concrete"].includes(c.trade)).map((c) => ({ id: c.id, label: c.tradingName.split(" ")[0], trade: c.trade }));
  return (
    <>
      <div className="site-top">
        <Link href="/site" className="link">Cancel</Link>
        <b>New defect</b>
        <span style={{ width: 52 }} />
      </div>
      <div className="site-body">
        <DefectForm
          variant="mobile"
          projectId={p.id}
          locations={projectLocations(p.id).map((l) => ({ id: l.id, label: `${l.building} › ${l.level} › ${l.zone}` }))}
          contractors={contractors}
          trades={[...new Set(db().contractors.map((c) => c.trade))]}
          canAssign={can(user, "defect.assign")}
          doneHref="/site"
        />
      </div>
    </>
  );
}
