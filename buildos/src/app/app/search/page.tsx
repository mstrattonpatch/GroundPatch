import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { search } from "@/lib/server/store";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Search" };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const results = search(user, q);
  return (
    <>
      <PageHeader title={q ? `Results for “${q}”` : "Search"} meta={<span>Projects, defects, documents, workers and variations — only what your role can see.</span>} />
      <section className="card">
        {results.length === 0 ? (
          <EmptyState icon={SearchIcon} title={q ? "Nothing found" : "Search everything"} body={q ? "Try a record ID like DEF-0142, a drawing number like A-102, or a worker's name." : "Type in the search bar above."} />
        ) : (
          <div className="table-wrap">
            <table className="register">
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td style={{ width: 110 }}><span className="tag">{r.kind}</span></td>
                    <td><Link className="rowlink" href={r.href}>{r.title}</Link></td>
                    <td className="small muted">{r.sub}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
