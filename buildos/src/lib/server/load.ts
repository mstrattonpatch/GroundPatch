import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "./session.ts";
import { getProject } from "./store.ts";

export async function loadProject(params: Promise<{ id: string }>) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const project = getProject(user, id);
  if (!project) notFound();
  return { user, project };
}
