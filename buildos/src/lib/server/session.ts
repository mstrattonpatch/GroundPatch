import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUser } from "./store.ts";
import type { User } from "../domain/types.ts";

// Prototype sign-in: the demo picks a role and we remember the user ID in a
// cookie. Replace with a managed identity provider (with MFA for privileged
// roles) before real data goes in.

export const SESSION_COOKIE = "buildos_user";

export async function currentUser(): Promise<User | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  return id ? (getUser(id) ?? null) : null;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
