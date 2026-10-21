import "server-only";
import { contractor, db, listDefects, location } from "./store.ts";
import { isOverdue } from "../domain/workflows.ts";
import type { Defect, User } from "../domain/types.ts";

export type DefectFilters = { level?: string; trade?: string; contractor?: string; status?: string; q?: string };

export function filterDefects(user: User, projectId: string, f: DefectFilters): Defect[] {
  const now = new Date();
  return listDefects(user, projectId).filter((d) => {
    const loc = location(d.locationId);
    if (f.level && loc?.level !== f.level) return false;
    if (f.trade && d.trade !== f.trade) return false;
    if (f.contractor && d.contractorId !== f.contractor) return false;
    if (f.status === "overdue" && !isOverdue(d, now)) return false;
    if (f.status === "open" && (d.status === "closed" || d.status === "draft")) return false;
    if (f.status && !["overdue", "open"].includes(f.status) && d.status !== f.status) return false;
    if (f.q && !`${d.ref} ${d.title}`.toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  });
}

export function locationLabel(d: Defect) {
  const l = location(d.locationId);
  return l ? `${l.building} · ${l.level} · ${d.room || l.zone}` : "—";
}

export function defectFacets(user: User, projectId: string) {
  const all = listDefects(user, projectId);
  const levels = [...new Set(all.map((d) => location(d.locationId)?.level).filter(Boolean))] as string[];
  const trades = [...new Set(all.map((d) => d.trade))];
  const contractors = [...new Set(all.map((d) => d.contractorId).filter(Boolean))].map((id) => contractor(id)!);
  return { levels: levels.sort(), trades: trades.sort(), contractors };
}

export function projectLocations(projectId: string) {
  return db().locations.filter((l) => l.projectId === projectId);
}
