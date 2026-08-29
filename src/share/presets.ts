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
import { browserStore, keyFor, read, write, type Store } from "./storage";

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

export type ApplyOutcome = { ok: true; doc: BoardDoc } | { ok: false; error: string };

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
    formation: preset.formation ?? base.formation,
    squad: preset.players,
  };

  try {
    let next = applyFormation(doc, teamIndex, spec);
    const built = next.teams[teamIndex];

    // Only reachable from a hand-edited library — the app never saves one — but
    // silently renumbering someone's squad is a worse answer than saying so.
    if (duplicateNumber(preset.players)) {
      throw new SetupError("Two players in this squad share a shirt number.");
    }
    if (preset.formation && built.formation !== preset.formation) {
      throw new SetupError(`"${preset.formation}" is not a formation Pitchboard knows.`);
    }
    // buildTeam fills the formation's slots and ignores anything past them, so a
    // squad saved deeper than the shape would silently lose its tail.
    if (preset.players && preset.players.length > built.players.length) {
      throw new SetupError(
        `${preset.players.length} players saved but ${built.formation} has ${built.players.length} places.`,
      );
    }

    if (preset.links) {
      const resolved = resolveTeamLinks(built, preset.links, `"${preset.label}"`);
      next = { ...next, links: replaceTeamLinks(next, teamIndex, resolved) };
    }

    const parsed = boardDocSchema.safeParse(next);
    if (!parsed.success) throw new SetupError("That preset does not describe a valid team.");
    return { ok: true, doc: parsed.data as BoardDoc };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof SetupError ? e.message : "Could not apply that preset.",
    };
  }
}
