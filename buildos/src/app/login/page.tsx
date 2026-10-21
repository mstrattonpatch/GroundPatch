import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { signInAs } from "@/app/actions";
import { db } from "@/lib/server/store";
import { ROLE_LABEL } from "@/lib/domain/permissions";
import { Logo } from "@/components/ui";

export const metadata = { title: "Log in" };

const LANDS: Record<string, string> = {
  director: "Control centre — portfolio & exposure",
  project_manager: "Project overview — today's attention list",
  site_supervisor: "Site app — today, inspections, on site",
  quality_manager: "Quality register and ITPs",
  subcontractor_admin: "Their defects, SWMS, crew compliance",
  worker: "Sign in, my credentials, my SWMS — no paid seat",
};

export default function Login() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" style={{ width: "100%", maxWidth: 520 }}>
        <div className="card-pad stack-lg">
          <Link href="/"><Logo /></Link>
          <div>
            <h1 style={{ fontSize: 24 }}>Explore the prototype</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              Pick a role. Each one lands on the screen built for it, and the server checks what that role is allowed to do.
            </p>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {db().users.map((u) => (
              <form key={u.id} action={signInAs}>
                <input type="hidden" name="userId" value={u.id} />
                <button type="submit" className="btn btn-block" style={{ height: "auto", padding: "12px 14px", justifyContent: "flex-start", textAlign: "left" }}>
                  <span className="avatar" style={{ width: 34, height: 34, fontSize: 12, flex: "none" }}>{u.initials}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block" }}>{ROLE_LABEL[u.role]} · <span className="muted" style={{ fontWeight: 500 }}>{u.name}</span></span>
                    <span className="muted small" style={{ fontWeight: 400, whiteSpace: "normal" }}>{LANDS[u.role]}</span>
                  </span>
                  <ArrowRight size={16} aria-hidden />
                </button>
              </form>
            ))}
          </div>
          <p className="small muted">Prototype sign-in only. Production uses a managed identity provider with MFA for privileged roles.</p>
        </div>
      </div>
    </div>
  );
}
