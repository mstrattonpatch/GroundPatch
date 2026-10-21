import { requireUser } from "@/lib/server/session";
import { db } from "@/lib/server/store";
import { ROLE_LABEL, VARIATION_APPROVAL_LIMIT } from "@/lib/domain/permissions";
import { PageHeader } from "@/components/ui";
import { money } from "@/lib/format";

export const metadata = { title: "Settings" };

export default async function Settings() {
  await requireUser();
  const d = db();
  return (
    <>
      <PageHeader title="Company settings" meta={<span>{d.org.name} · ABN {d.org.abn}</span>} />
      <section className="card">
        <div className="card-head"><h2>Team &amp; roles</h2><div className="spacer" /><span className="small muted">Enforced on every server request, not just hidden buttons</span></div>
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th>Person</th><th>Role</th><th>Variation approval limit</th></tr></thead>
            <tbody>
              {d.users.map((u) => {
                const lim = VARIATION_APPROVAL_LIMIT[u.role];
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}<div className="muted small">{u.title}</div></td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td className="mono">{lim === undefined ? "—" : Number.isFinite(lim) ? money(lim) : "Unlimited"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
