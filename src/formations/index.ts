/**
 * Formation presets, generated from their notation.
 *
 * A preset is just a string: "4-2-3-1" becomes lines of 4, 2, 3 and 1. Depth,
 * width, shirt numbers and seeded links are all derived, so adding a formation is
 * adding one entry to NOTATIONS — there is no 27-way hand-written table to keep
 * consistent.
 *
 * Positions are normalised: `depth` runs 0 (own goal line) to 1 (opponent goal
 * line), `spread` runs 0 to 1 across the width. Every preset is a kickoff shape —
 * no line goes past DEPTH_MAX, so two opposing defaults sit clear of each other
 * rather than overlapping around the halfway line.
 */

import type { BoardDoc, Link, LinkStyle, Player, Team, Vec2 } from "@/board/types";
import { pruneLinks } from "@/board/links";

export type FormationLine = {
  /** Shown in the seeded link's name, e.g. "Back 4". */
  label: string;
  depth: number;
  spread: number[];
  numbers: number[];
  /** Omit for lines not worth linking (a lone striker, the keeper). */
  link?: LinkStyle;
};

export type Formation = {
  id: string;
  name: string;
  /** Groups the picker by back-line shape. */
  group: string;
  lines: FormationLine[];
};

/** Outfield lines sit between these depths, keeping every team in its own half. */
export const DEPTH_MIN = 0.18;
export const DEPTH_MAX = 0.45;
/** Half-width of the widest line, as a fraction of the pitch. */
const SPAN = 0.35;

const GK: FormationLine = { label: "Keeper", depth: 0.05, spread: [0.5], numbers: [1] };

/**
 * How wide a line sits.
 *
 * The awkward case is an interior three: in a 4-3-3 those are central midfielders
 * and should be compact, but in a 4-2-3-1 they are wingers and should hug the
 * touchlines. What separates them is the line in front — a front three already
 * carries the width, a lone striker does not.
 */
function widthFactor(count: number, index: number, lastIndex: number, finalCount: number): number {
  if (count === 1) return 0;
  // Full-backs hug the touchline; a back three is three centre-backs.
  if (index === 0) return count >= 4 ? 1 : count === 3 ? 0.72 : 0.5;
  // Four or more in a line always means wide players somewhere in it.
  if (count >= 4) return 1;
  // Wingers spread; a front two stays central.
  if (index === lastIndex) return count >= 3 ? 1 : 0.45;
  if (count === 3 && index === lastIndex - 1 && finalCount < 3) return 0.92;
  return count === 2 ? 0.5 : 0.72;
}

/** Symmetric positions across the pitch, centred on 0.5. */
function spreadFor(count: number, width: number): number[] {
  const d = SPAN * width;
  switch (count) {
    case 1:
      return [0.5];
    case 2:
      return [0.5 - d, 0.5 + d];
    case 3:
      return [0.5 - d, 0.5, 0.5 + d];
    case 4:
      return [0.5 - d, 0.5 - d / 3, 0.5 + d / 3, 0.5 + d];
    default: {
      // Evenly spaced for five or more.
      const step = (d * 2) / (count - 1);
      return Array.from({ length: count }, (_, i) => 0.5 - d + i * step);
    }
  }
}

/** Conventional shirt numbers for a back line, by size. */
const BACK_NUMBERS: Record<number, number[]> = {
  2: [2, 3],
  3: [4, 5, 6],
  4: [2, 5, 6, 3],
  5: [2, 5, 6, 4, 3],
};

/** Preferred numbers for the most advanced line, by size. */
const FRONT_NUMBERS: Record<number, number[]> = {
  1: [9],
  2: [9, 10],
  3: [7, 9, 11],
  4: [7, 9, 10, 11],
};

/**
 * Fallback order for interior lines. 2 and 3 sit mid-list so a back three frees
 * them for wing-backs rather than the line reaching squad numbers like 14 and 16,
 * which look wrong in a starting eleven.
 */
const MIDFIELD_POOL = [4, 8, 6, 10, 7, 11, 2, 3, 5, 14, 16, 17, 18];

function nameFor(index: number, lastIndex: number, count: number): string {
  if (index === 0) return `Back ${count}`;
  if (index === lastIndex) return `Front ${count}`;
  const interior = lastIndex - 1;
  if (interior === 1) return `Midfield ${count}`;
  return index === 1 ? `Holding ${count}` : index === lastIndex - 1 ? `Attacking ${count}` : `Midfield ${count}`;
}

function linkFor(count: number): LinkStyle | undefined {
  // Every seeded line is a chain, matching what createLink defaults to. Closing
  // a three is a choice, and it belongs to whoever is drawing the tactic.
  return count < 2 ? undefined : "chain";
}

/**
 * Build a formation from its notation. Zero-count lines (as in the five-a-side
 * "2-0-2") are dropped rather than producing an empty line.
 */
export function fromNotation(notation: string, group: string): Formation {
  const counts = notation.split("-").map(Number).filter((n) => n > 0);
  const last = counts.length - 1;

  // Reserve numbers so a line never collides with one already assigned.
  const used = new Set<number>([1]);
  const take = (preferred: number[], count: number): number[] => {
    const out: number[] = [];
    const wanted = [...preferred, ...MIDFIELD_POOL];
    for (const n of wanted) {
      if (out.length === count) break;
      if (!used.has(n)) {
        used.add(n);
        out.push(n);
      }
    }
    for (let n = 2; out.length < count; n++) {
      if (!used.has(n)) {
        used.add(n);
        out.push(n);
      }
    }
    return out;
  };

  // Front line first so the striker gets 9 rather than losing it to a midfielder.
  const numbersByLine: number[][] = [];
  numbersByLine[0] = take(BACK_NUMBERS[counts[0]] ?? [], counts[0]);
  if (last > 0) numbersByLine[last] = take(FRONT_NUMBERS[counts[last]] ?? [], counts[last]);
  for (let i = 1; i < last; i++) numbersByLine[i] = take([], counts[i]);

  const lines: FormationLine[] = counts.map((count, i) => ({
    label: nameFor(i, last, count),
    depth: last === 0 ? (DEPTH_MIN + DEPTH_MAX) / 2 : DEPTH_MIN + ((DEPTH_MAX - DEPTH_MIN) * i) / last,
    spread: spreadFor(count, widthFactor(count, i, last, counts[last])),
    numbers: numbersByLine[i],
    link: linkFor(count),
  }));

  return { id: notation, name: notation, group, lines: [GK, ...lines] };
}

/** Mirrors the eleven-a-side catalogue offered by lineup-builder.co.uk. */
const NOTATIONS: [string, string[]][] = [
  [
    "Back four",
    ["4-4-2", "4-3-3", "4-2-3-1", "4-1-4-1", "4-4-1-1", "4-5-1", "4-3-1-2", "4-2-2-2",
     "4-3-2-1", "4-1-3-2", "4-1-2-3", "4-2-1-3", "4-2-4"],
  ],
  [
    "Back three",
    ["3-5-2", "3-4-3", "3-4-2-1", "3-4-1-2", "3-1-4-2", "3-5-1-1", "3-3-1-3", "3-3-3-1",
     "3-2-4-1"],
  ],
  ["Back five", ["5-3-2", "5-4-1", "5-2-3", "5-2-2-1"]],
  ["Back two", ["2-3-4-1"]],
];

export const FORMATIONS: Formation[] = NOTATIONS.flatMap(([group, ids]) =>
  ids.map((id) => fromNotation(id, group)),
);

export const FORMATION_GROUPS: string[] = NOTATIONS.map(([group]) => group);

export const DEFAULT_FORMATION = "4-3-3";

export function getFormation(id: string): Formation {
  return FORMATIONS.find((f) => f.id === id) ?? FORMATIONS.find((f) => f.id === DEFAULT_FORMATION)!;
}

/** Which goal a team defends. "left" attacks towards +x. */
export type Direction = "left" | "right";

export type TeamSpec = {
  id: string;
  name: string;
  color: string;
  textColor: string;
  formation: string;
  direction: Direction;
  /**
   * Per-slot overrides in formation order, keeper first. Used by JSON import to
   * name and number a starting eleven without having to know which shirt the
   * preset would otherwise have handed out.
   */
  squad?: { number?: number; label?: string }[];
};

export type BuiltTeam = {
  team: Team;
  positions: Record<string, Vec2>;
  links: Link[];
};

/**
 * Turn a preset into players, metre positions and seeded links.
 *
 * Player ids are `<teamId>-<shirt number>`, which is stable across formation
 * changes and unique across teams because team ids differ.
 */
export function buildTeam(
  spec: TeamSpec,
  pitch: { length: number; width: number },
): BuiltTeam {
  const formation = getFormation(spec.formation);
  const players: Player[] = [];
  const positions: Record<string, Vec2> = {};
  const links: Link[] = [];

  // Runs across every line, so a squad override addresses the eleven in one
  // sequence rather than line by line.
  let slot = 0;

  for (const line of formation.lines) {
    const ids: string[] = [];

    line.spread.forEach((across, i) => {
      const override = spec.squad?.[slot++];
      const number = override?.number ?? line.numbers[i] ?? i + 1;
      const id = `${spec.id}-${number}`;
      ids.push(id);

      players.push({ id, number, label: override?.label ?? "" });
      positions[id] = {
        x: spec.direction === "left" ? line.depth * pitch.length : (1 - line.depth) * pitch.length,
        // Mirror across the width too, so the two sides are not a straight copy
        // and full-backs end up on opposite flanks as they should.
        y: spec.direction === "left" ? across * pitch.width : (1 - across) * pitch.width,
      };
    });

    // A link needs at least two members; lone strikers and keepers get none.
    if (line.link && ids.length >= 2) {
      links.push({
        id: `${spec.id}-${slug(line.label)}`,
        name: `${spec.name} — ${line.label}`,
        members: ids,
        style: line.link,
        // No colour: a seeded link follows the kit it was seeded from.
        showDistances: false,
      });
    }
  }

  return {
    // The RESOLVED id, not the requested one, so the document never records a
    // formation that getFormation would have to fall back from.
    team: {
      id: spec.id,
      name: spec.name,
      color: spec.color,
      textColor: spec.textColor,
      players,
      formation: formation.id,
    },
    positions,
    links,
  };
}

export const DEFAULT_PITCH = { length: 105, width: 68 } as const;

export const HOME: TeamSpec = {
  id: "home",
  name: "Home",
  color: "#e11d48",
  textColor: "#ffffff",
  formation: DEFAULT_FORMATION,
  direction: "left",
};

export const AWAY: TeamSpec = {
  id: "away",
  name: "Away",
  color: "#2563eb",
  textColor: "#ffffff",
  formation: "4-4-2",
  direction: "right",
};

/** A complete one-scene board — what the editor opens with. */
export function createBoardDoc(
  home: TeamSpec = HOME,
  away: TeamSpec = AWAY,
  pitch = DEFAULT_PITCH,
): BoardDoc {
  const a = buildTeam(home, pitch);
  const b = buildTeam(away, pitch);

  return {
    version: 1,
    name: "Untitled board",
    pitch: { ...pitch },
    teams: [a.team, b.team],
    scenes: [
      {
        id: "scene-1",
        name: "Scene 1",
        transitionMs: 0,
        holdMs: 1000,
        positions: { ...a.positions, ...b.positions },
        paths: {},
        carrier: null,
        ballPos: { x: pitch.length / 2, y: pitch.width / 2 },
        ballPath: null,
      },
    ],
    links: [...a.links, ...b.links],
  };
}

/**
 * Re-apply a formation to one team in place, preserving the other team, the ball
 * and any links belonging to the side that did not change.
 */
export function applyFormation(doc: BoardDoc, teamIndex: 0 | 1, spec: TeamSpec): BoardDoc {
  const built = buildTeam(spec, doc.pitch);
  const other = doc.teams[teamIndex === 0 ? 1 : 0];
  const otherIds = new Set(other.players.map((p) => p.id));

  const teams: [Team, Team] = teamIndex === 0 ? [built.team, other] : [other, built.team];

  const scenes = doc.scenes.map((scene) => {
    const positions: Record<string, Vec2> = { ...built.positions };
    for (const id of otherIds) {
      const p = scene.positions[id];
      if (p) positions[id] = p;
    }
    // A carrier that no longer exists would fail validation.
    const carrier = scene.carrier && (otherIds.has(scene.carrier) || scene.carrier in built.positions)
      ? scene.carrier
      : null;
    return {
      ...scene,
      positions,
      carrier,
      ballPos: carrier === null ? (scene.ballPos ?? { x: doc.pitch.length / 2, y: doc.pitch.width / 2 }) : undefined,
    };
  });

  // pruneLinks drops any link still referencing a player who has just gone, and
  // discards ones left with fewer than two members.
  return pruneLinks({
    ...doc,
    teams,
    scenes,
    links: [...doc.links, ...built.links],
  });
}

/** Which goal a side defends, by index. teams[0] attacks +x throughout. */
export const directionOf = (teamIndex: number): Direction =>
  teamIndex === 0 ? HOME.direction : AWAY.direction;

/**
 * Put every player back on their formation mark, in every scene.
 *
 * Deliberately the narrow reset: names, numbers, links, annotations, scene
 * timings, the ball and the squad all survive — only the shape goes back to the
 * preset. Runs are cleared with the positions, since every scene now holds the
 * same shape and a curve between two identical points is a journey of zero
 * length.
 */
export function resetPositions(doc: BoardDoc): BoardDoc {
  const target: Record<string, Vec2> = {};

  doc.teams.forEach((team, i) => {
    const built = buildTeam(
      {
        id: team.id,
        name: team.name,
        color: team.color,
        textColor: team.textColor,
        formation: team.formation ?? (i === 0 ? HOME.formation : AWAY.formation),
        direction: directionOf(i),
      },
      doc.pitch,
    );

    // Paired by ORDER, not by id. Renumbering a player keeps their id, so the
    // `<team>-<number>` ids a fresh build produces need not match the squad at
    // all. Players added by hand sit past the last slot and stay where they are.
    team.players.forEach((player, k) => {
      const slot = built.team.players[k];
      if (slot) target[player.id] = built.positions[slot.id];
    });
  });

  const scenes = doc.scenes.map((scene) => {
    const positions = { ...scene.positions };
    const paths = { ...scene.paths };
    for (const [id, at] of Object.entries(target)) {
      positions[id] = { ...at };
      delete paths[id];
    }
    return { ...scene, positions, paths };
  });

  return { ...doc, scenes };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
