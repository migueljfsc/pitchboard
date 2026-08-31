/**
 * Named squad presets.
 *
 * A preset is a setup team with a label on it: formation, kit, the XI with their
 * numbers and names, and that side's units. It reuses `setupTeamSchema` rather
 * than declaring a shape of its own, so a preset and a hand-written setup file
 * can never drift apart.
 *
 * Applying one rebuilds ONE team. The opponent, the scenes, the drawings and the
 * timings are left exactly as they were — which is the whole point of storing a
 * squad rather than a board.
 */

import { z } from "zod";
import type { BoardDoc } from "@/board/types";
import { boardDocSchema } from "@/board/schema";
import { AWAY, HOME, applyFormation, type TeamSpec } from "@/formations";
import { replaceTeamLinks } from "@/board/links";
import {
  SetupError,
  duplicateNumber,
  resolveTeamLinks,
  setupTeamSchema,
  teamToSetup,
} from "./json";
import { browserStore, keyFor, read, remove, write, type Store } from "./storage";
import { msg, type Message } from "@/i18n/core";

export const PRESETS_KEY = keyFor("squads");

/** Well above what anyone will keep, and far below the storage quota. */
export const MAX_PRESETS = 50;
export const MAX_PRESET_LABEL = 60;

export const presetSchema = setupTeamSchema.extend({
  id: z.string().min(1).max(60),
  /** What the coach called it — "Our first XI". Distinct from the team's name. */
  label: z.string().min(1).max(MAX_PRESET_LABEL),
});

export type SquadPreset = z.infer<typeof presetSchema>;
export type PresetLibrary = SquadPreset[];

const librarySchema = z.array(presetSchema).max(MAX_PRESETS);

// ------------------------------------------------------------------ storage

/**
 * Everything in the library, or an empty one.
 *
 * A stored library that no longer validates is discarded rather than repaired:
 * it is the user's own browser data, it can be edited by hand, and a
 * half-understood preset reaching `applyFormation` is worse than none.
 */
export function loadPresets(store: Store | null = browserStore()): PresetLibrary {
  return read(store, PRESETS_KEY, (raw) => {
    const parsed = librarySchema.safeParse(raw);
    return parsed.success ? (parsed.data as PresetLibrary) : null;
  }) ?? [];
}

/** False when the write did not happen — no store, or the quota is full. */
export function savePresets(
  presets: PresetLibrary,
  store: Store | null = browserStore(),
): boolean {
  return write(store, PRESETS_KEY, presets);
}

/**
 * Forget the browser's library.
 *
 * Called once, after it has been copied into an account: from then on the account IS the
 * library, and a second copy left behind would be a library nobody is writing to and everybody
 * would eventually have to merge.
 */
export function clearPresets(store: Store | null = browserStore()): void {
  remove(store, PRESETS_KEY);
}

// ------------------------------------------------------- the account's copy

/**
 * A preset without its identity — what an account row's `body` holds.
 *
 * The id and the label are the row's own columns: the id because the server mints it, and the
 * label because it is the one part the server has an opinion about. What is left is exactly a
 * setup team, which is what a preset has always been (D30).
 */
export function serialisePreset(preset: SquadPreset): string {
  // Spread and remove, rather than naming the fields that stay: a preset is whatever a setup
  // team is, and listing them here is the trap that drops the next one added (D32, D37).
  const team: Record<string, unknown> = { ...preset };
  delete team.id;
  delete team.label;
  return JSON.stringify(team);
}

/**
 * A stored row back into a preset, or null.
 *
 * A document from an account gets no more trust than one from `localStorage`: the server
 * stores it opaquely and validates only its size, so this is where it is checked (D31). The
 * row's own id and label win over anything the body claims — the body is not supposed to carry
 * either, and a hand-written one that does must not be able to rename or re-address itself.
 */
export function presetFromRow(row: { id: string; label: string; body: string }): SquadPreset | null {
  let team: unknown;
  try {
    team = JSON.parse(row.body);
  } catch {
    return null;
  }
  if (typeof team !== "object" || team === null || Array.isArray(team)) return null;

  const parsed = presetSchema.safeParse({ ...team, id: row.id, label: row.label });
  return parsed.success ? (parsed.data as SquadPreset) : null;
}

/** The rows that parsed, in the order they arrived. One bad row costs that squad, not the library. */
export const libraryFromRows = (
  rows: { id: string; label: string; body: string }[],
): PresetLibrary =>
  rows.map(presetFromRow).filter((p): p is SquadPreset => p !== null);

// ------------------------------------------------------------------ editing
// All pure: the caller persists the result, so an undo or a failed write cannot
// leave the list on screen disagreeing with the list in storage.

function freshId(list: PresetLibrary): string {
  const taken = new Set(list.map((p) => p.id));
  let n = list.length + 1;
  while (taken.has(`squad-${n}`)) n++;
  return `squad-${n}`;
}

/** Capture one side of the board as a preset. `label` defaults to the team name. */
export function presetFrom(
  doc: BoardDoc,
  teamIndex: 0 | 1,
  list: PresetLibrary,
  label?: string,
): SquadPreset {
  const team = teamToSetup(doc, teamIndex);
  return {
    ...team,
    id: freshId(list),
    label: (label ?? team.name ?? "Squad").slice(0, MAX_PRESET_LABEL),
  };
}

/**
 * The preset a save would replace: the same name standing in the same shape.
 *
 * Same name with a DIFFERENT formation is a different preset. "Arsenal" as a
 * 4-3-3 and "Arsenal" as a 3-5-2 are two setups a coach switches between, not
 * one setup saved twice — and the picker shows the formation beside the name
 * precisely so they read as a pair.
 *
 * Names are matched trimmed and case-insensitively, so re-saving under what
 * reads as the same name replaces it rather than leaving a near-duplicate that
 * only differs by a capital.
 */
export function replaceable(
  list: PresetLibrary,
  label: string,
  formation: string | undefined,
): SquadPreset | null {
  const key = label.trim().toLowerCase();
  return (
    list.find(
      (p) => p.label.trim().toLowerCase() === key && (p.formation ?? "") === (formation ?? ""),
    ) ?? null
  );
}

export const addPreset = (list: PresetLibrary, preset: SquadPreset): PresetLibrary =>
  [...list, preset].slice(-MAX_PRESETS);

/** Replace a preset in place, keeping its position in the list. */
export const updatePreset = (list: PresetLibrary, preset: SquadPreset): PresetLibrary =>
  list.map((p) => (p.id === preset.id ? preset : p));

export const renamePreset = (list: PresetLibrary, id: string, label: string): PresetLibrary =>
  list.map((p) => (p.id === id ? { ...p, label: label.slice(0, MAX_PRESET_LABEL) } : p));

export const deletePreset = (list: PresetLibrary, id: string): PresetLibrary =>
  list.filter((p) => p.id !== id);

// ------------------------------------------------------------------ applying

export type ApplyOutcome = { ok: true; doc: BoardDoc } | { ok: false; error: Message };

/**
 * Put a preset onto one side of the board.
 *
 * Positions for that team go back to their formation marks in every scene —
 * unavoidable, since changing the shape is repositioning — while the opponent
 * keeps theirs. The result is validated as a board before it is returned, so
 * nothing the schema would reject reaches the editor.
 */
export function applyPreset(
  doc: BoardDoc,
  teamIndex: 0 | 1,
  preset: SquadPreset,
): ApplyOutcome {
  const base = teamIndex === 0 ? HOME : AWAY;
  const spec: TeamSpec = {
    ...base,
    name: preset.name ?? base.name,
    color: preset.color ?? base.color,
    textColor: preset.textColor ?? base.textColor,
    pattern: preset.pattern ?? base.pattern,
    formation: preset.formation ?? base.formation,
    squad: preset.players,
  };

  try {
    let next = applyFormation(doc, teamIndex, spec);
    const built = next.teams[teamIndex];

    // Only reachable from a hand-edited library — the app never saves one — but
    // silently renumbering someone's squad is a worse answer than saying so.
    if (duplicateNumber(preset.players)) {
      throw new SetupError(msg("preset.duplicateNumber"));
    }
    if (preset.formation && built.formation !== preset.formation) {
      throw new SetupError(msg("preset.unknownFormation", { formation: preset.formation }));
    }
    // buildTeam fills the formation's slots and ignores anything past them, so a
    // squad saved deeper than the shape would silently lose its tail.
    if (preset.players && preset.players.length > built.players.length) {
      throw new SetupError(
        msg("preset.tooManyPlayers", {
          saved: preset.players.length,
          formation: built.formation ?? "",
          places: built.players.length,
        }),
      );
    }

    if (preset.links) {
      const resolved = resolveTeamLinks(built, preset.links, { kind: "preset", label: preset.label });
      next = { ...next, links: replaceTeamLinks(next, teamIndex, resolved) };
    }

    const parsed = boardDocSchema.safeParse(next);
    if (!parsed.success) throw new SetupError(msg("preset.invalid"));
    return { ok: true, doc: parsed.data as BoardDoc };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof SetupError ? e.info : msg("preset.failed"),
    };
  }
}
