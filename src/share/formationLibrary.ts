/**
 * Formations drawn by hand, kept to pick from again (D122).
 *
 * The library is where a shape is kept, not where a board reads it: picking one copies it onto
 * the team (`Team.shape`), so deleting or renaming one here changes no board. It follows the same
 * rule as the squad library (D30) — the browser's while signed out, the account's while signed
 * in, never both — and its storage mirrors `presets.ts` for the same reasons.
 */

import { z } from "zod";
import type { Sport, TeamShape } from "@/board/types";
import { SPORT_IDS } from "@/board/types";
import { teamShapeSchema } from "@/board/schema";
import { browserStore, keyFor, read, remove, write, type Store } from "./storage";

export const FORMATIONS_KEY = keyFor("formations");

/** Mirrors `MAX_FORMATIONS_PER_USER` in `worker/lib/limits.ts`. */
export const MAX_FORMATIONS = 50;
export const MAX_FORMATION_NAME = 40;

const customFormationSchema = z.object({
  id: z.string().min(1).max(60),
  /** Absent is football (D113). */
  sport: z.enum(SPORT_IDS).optional(),
  shape: teamShapeSchema,
});

export type CustomFormation = z.infer<typeof customFormationSchema>;
export type FormationLibrary = CustomFormation[];

const librarySchema = z.array(customFormationSchema).max(MAX_FORMATIONS);

/** The shapes kept for one sport: a basketball five means nothing on a football pitch. */
export const formationsOf = (list: FormationLibrary, sport: Sport = "football"): FormationLibrary =>
  list.filter((f) => (f.sport ?? "football") === sport);

// ------------------------------------------------------------------ storage

/** Everything kept in this browser, or nothing: a library that no longer validates is dropped (D31). */
export function loadFormations(store: Store | null = browserStore()): FormationLibrary {
  return (
    read(store, FORMATIONS_KEY, (raw) => {
      const parsed = librarySchema.safeParse(raw);
      return parsed.success ? (parsed.data as FormationLibrary) : null;
    }) ?? []
  );
}

export function saveFormations(list: FormationLibrary, store: Store | null = browserStore()): boolean {
  return write(store, FORMATIONS_KEY, list);
}

/** Forget the browser's library, once it is safely on the account. */
export function clearFormations(store: Store | null = browserStore()): void {
  remove(store, FORMATIONS_KEY);
}

// ------------------------------------------------------- the account's copy

/** What an account row's `body` holds: everything but the id and the name, which are columns. */
export function serialiseFormation(formation: CustomFormation): string {
  const shape: Record<string, unknown> = { ...formation.shape };
  delete shape.name;
  return JSON.stringify({ ...(formation.sport ? { sport: formation.sport } : {}), shape });
}

/** A row back into a formation, or null. The row's id and name win over anything in the body. */
export function formationFromRow(row: { id: string; name: string; body: string }): CustomFormation | null {
  let body: unknown;
  try {
    body = JSON.parse(row.body);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { sport, shape } = body as { sport?: unknown; shape?: unknown };
  if (typeof shape !== "object" || shape === null) return null;
  const parsed = customFormationSchema.safeParse({ id: row.id, sport, shape: { ...shape, name: row.name } });
  return parsed.success ? (parsed.data as CustomFormation) : null;
}

/** The rows that parsed, in the order they arrived. One bad row costs that shape, not the library. */
export const formationLibraryFromRows = (
  rows: { id: string; name: string; body: string }[],
): FormationLibrary => rows.map(formationFromRow).filter((f): f is CustomFormation => f !== null);

// ------------------------------------------------------------------ editing
// Pure: the caller persists the result, so a failed write cannot leave the list disagreeing.

function freshId(list: FormationLibrary): string {
  const taken = new Set(list.map((f) => f.id));
  let n = list.length + 1;
  while (taken.has(`shape-${n}`)) n++;
  return `shape-${n}`;
}

/** A shape as a library entry for its sport, with an id this list has not used. */
export function customFormation(shape: TeamShape, sport: Sport, list: FormationLibrary): CustomFormation {
  return {
    id: freshId(list),
    ...(sport !== "football" ? { sport } : {}),
    shape: { ...shape, name: shape.name.trim().slice(0, MAX_FORMATION_NAME) },
  };
}

/** The entry a save would replace: the same name, trimmed and case-blind, in the same sport. */
export function sameName(list: FormationLibrary, name: string, sport: Sport): CustomFormation | null {
  const key = name.trim().toLowerCase();
  return formationsOf(list, sport).find((f) => f.shape.name.trim().toLowerCase() === key) ?? null;
}

export const addFormation = (list: FormationLibrary, formation: CustomFormation): FormationLibrary =>
  [...list, formation].slice(-MAX_FORMATIONS);

export const updateFormation = (list: FormationLibrary, formation: CustomFormation): FormationLibrary =>
  list.map((f) => (f.id === formation.id ? formation : f));

export const renameFormation = (list: FormationLibrary, id: string, name: string): FormationLibrary =>
  list.map((f) => (f.id === id ? { ...f, shape: { ...f.shape, name: name.trim().slice(0, MAX_FORMATION_NAME) } } : f));

export const deleteFormation = (list: FormationLibrary, id: string): FormationLibrary =>
  list.filter((f) => f.id !== id);
