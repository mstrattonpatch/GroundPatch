"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, requireUser } from "@/lib/server/session";
import * as store from "@/lib/server/store";
import type { DefectAction } from "@/lib/domain/workflows";
import type { Priority } from "@/lib/domain/types";

export type FormState = { ok: boolean; message: string } | null;

const homeFor: Record<string, string> = {
  u_dir: "/app",
  u_pm: "/app/projects/p_riv",
  u_sup: "/site",
  u_qm: "/app/projects/p_riv/quality",
  u_sub: "/app/projects/p_riv/quality",
  u_wkr: "/site/sign-in",
};

function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

function done(r: store.Result): FormState {
  if (r.ok) revalidatePath("/", "layout");
  return r.ok ? { ok: true, message: r.message } : { ok: false, message: r.error };
}

export async function signInAs(fd: FormData) {
  const id = str(fd, "userId");
  if (!store.getUser(id)) redirect("/login");
  (await cookies()).set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(str(fd, "next") || homeFor[id] || "/app");
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function resetDemo() {
  await requireUser();
  store.resetDemo();
  revalidatePath("/", "layout");
}

export async function createDefect(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const photos = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).map((f) => f.name);
  const r = store.createDefect(user, {
    projectId: str(fd, "projectId"),
    title: str(fd, "title"),
    locationId: str(fd, "locationId"),
    room: str(fd, "room") || undefined,
    trade: str(fd, "trade"),
    contractorId: str(fd, "contractorId") || undefined,
    priority: (str(fd, "priority") || "medium") as Priority,
    dueDate: str(fd, "dueDate") || undefined,
    photos,
    clientKey: str(fd, "clientKey") || undefined,
    draft: str(fd, "draft") === "1",
  });
  return done(r);
}

/** JSON entry point used by the site app to sync drafts saved offline. */
export async function syncOfflineDefect(input: Omit<store.NewDefectInput, "photos"> & { photoCount: number }) {
  const user = await requireUser();
  const { photoCount, ...rest } = input;
  const r = store.createDefect(user, { ...rest, photos: Array.from({ length: photoCount }, (_, i) => `offline-${i + 1}.jpg`) });
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function defectAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const type = str(fd, "type") as DefectAction["type"];
  let action: DefectAction;
  switch (type) {
    case "assign":
      action = { type, contractorId: str(fd, "contractorId"), dueDate: str(fd, "dueDate") };
      break;
    case "submit_for_verification": {
      const photos = fd.getAll("evidence").filter((f): f is File => f instanceof File && f.size > 0).map((f) => f.name);
      action = { type, note: str(fd, "note"), evidencePhotos: photos };
      break;
    }
    case "reject":
      action = { type, reason: str(fd, "reason") };
      break;
    default:
      action = { type } as DefectAction;
  }
  return done(store.actOnDefect(user, str(fd, "defectId"), action));
}

export async function variationAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const type = str(fd, "type");
  const id = str(fd, "variationId");
  if (type === "reject") return done(store.actOnVariation(user, id, { type, reason: str(fd, "reason") }));
  if (type === "approve" || type === "start_review" || type === "submit" || type === "include_in_claim") {
    return done(store.actOnVariation(user, id, { type }));
  }
  return { ok: false, message: "Unknown action." };
}

export async function holdPointAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const decision = str(fd, "decision") === "reject" ? "reject" : "release";
  return done(store.releaseHoldPoint(user, str(fd, "itpId"), str(fd, "pointId"), decision, str(fd, "comment")));
}

export async function swmsReview(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const decision = str(fd, "decision") === "changes" ? "changes" : "approve";
  return done(store.reviewSwms(user, str(fd, "swmsId"), decision, str(fd, "comment")));
}

export async function swmsAcknowledge(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return done(store.acknowledgeSwms(user, str(fd, "swmsId")));
}

export async function siteSignIn(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return done(store.signInToSite(user, str(fd, "projectId")));
}

export async function siteSignOut(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return done(store.signOutOfSite(user, str(fd, "projectId")));
}

export async function submitDiary(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return done(store.submitDiary(user, str(fd, "projectId"), { weather: str(fd, "weather"), notes: str(fd, "notes"), delays: str(fd, "delays") }));
}
