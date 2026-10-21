import { requireUser } from "@/lib/server/session";

export const metadata = { title: "Site app" };

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="site-wrap">
      <div className="site">{children}</div>
    </div>
  );
}
