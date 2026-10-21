import { requireUser } from "@/lib/server/session";
import { myTasks } from "@/lib/server/insights";
import { ROLE_LABEL } from "@/lib/domain/permissions";
import { PageHeader } from "@/components/ui";
import { TaskList } from "@/components/task-list";

export const metadata = { title: "My tasks" };

export default async function Tasks() {
  const user = await requireUser();
  const items = myTasks(user);
  return (
    <>
      <PageHeader title="My tasks" meta={<span>{items.length} open · everything assigned to you as {ROLE_LABEL[user.role].toLowerCase()}, across every module</span>} />
      <section className="card card-pad"><TaskList items={items} /></section>
    </>
  );
}
