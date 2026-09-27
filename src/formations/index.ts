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

import type {
  BoardDoc,
  Link,
  LinkStyle,
  Player,
  Scene,
  Sport,
  Team,
  TeamPattern,
  Vec2,
} from "@/board/types";
import { SPORTS } from "@/board/sports";
import { moveEntities, type Carry } from "@/board/interaction";
import { pruneLinks, replaceTeamLinks } from "@/board/links";
import { pruneBallFlags } from "@/board/scenes";

export type FormationLine = {
  /** Shown in the seeded link's name, e.g. "Back 4". */
  label: string;
  depth: number;
  /** Per player, where a line is not straight across — a handball six bends round its goal. */
  depths?: number[];
  spread: number[];
  numbers: number[];
  /** Omit for lines not worth linking (a lone striker, the keeper). */
  link?: LinkStyle;
};

export type Formation = {
  id: string;
  /** Which game's catalogue it belongs to. */
  sport: Sport;
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
export function fromNotation(notation: string, group: string, sport: Sport = "football"): Formation {
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

  return { id: notation, sport, name: notation, group, lines: [GK, ...lines] };
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

/**
 * A formation written out by hand, line by line from its own baseline: too few
 * players, and no keeper, for a notation to say where each one stands. Numbers are
 * positions, 1 the point guard to 5 the centre.
 */
function laidOut(
  sport: Sport,
  id: string,
  group: string,
  /** `depth` is one for the line, or one per player where the line bends. */
  lines: [label: string, depth: number | number[], spread: number[], numbers: number[]][],
): Formation {
  return {
    id,
    sport,
    name: id,
    group,
    lines: lines.map(([label, depth, spread, numbers]) => ({
      label,
      depth: typeof depth === "number" ? depth : depth[0],
      ...(typeof depth === "number" ? {} : { depths: depth }),
      spread,
      numbers,
      link: linkFor(spread.length),
    })),
  };
}

/** Basketball's shapes, each in its own half: a defence set against the ball. */
const BASKETBALL_FORMATIONS: Formation[] = [
  laidOut("basketball", "2-3", "Zones", [
    ["Back 3", 0.1, [0.2, 0.5, 0.8], [3, 5, 4]],
    ["Front 2", 0.25, [0.33, 0.67], [1, 2]],
  ]),
  laidOut("basketball", "3-2", "Zones", [
    ["Back 2", 0.1, [0.35, 0.65], [4, 5]],
    ["Front 3", 0.24, [0.2, 0.5, 0.8], [2, 1, 3]],
  ]),
  laidOut("basketball", "1-3-1", "Zones", [
    ["Back 1", 0.07, [0.5], [5]],
    ["Middle 3", 0.18, [0.2, 0.5, 0.8], [3, 4, 2]],
    ["Front 1", 0.32, [0.5], [1]],
  ]),
  laidOut("basketball", "1-2-2", "Zones", [
    ["Back 2", 0.1, [0.3, 0.7], [4, 5]],
    ["Middle 2", 0.22, [0.2, 0.8], [3, 2]],
    ["Front 1", 0.34, [0.5], [1]],
  ]),
  laidOut("basketball", "Box-and-1", "Combination", [
    ["Back 2", 0.1, [0.33, 0.67], [4, 5]],
    ["Front 2", 0.22, [0.33, 0.67], [2, 3]],
    ["Chaser", 0.36, [0.5], [1]],
  ]),
];

/**
 * Handball's defences, around the six-metre line. Depths are metres from the goal line
 * over the court's 40, spreads metres across over its 20: the line bends round the goal,
 * so the wings stand nearly on the goal line and the middle out at the six.
 */
const HB_KEEPER: [string, number, number[], number[]] = ["Keeper", 0.02, [0.5], [1]];
const HANDBALL_FORMATIONS: Formation[] = [
  laidOut("handball", "6-0", "Defence", [
    HB_KEEPER,
    ["Back 6", [0.0375, 0.1375, 0.17, 0.17, 0.1375, 0.0375], [0.1, 0.25, 0.415, 0.585, 0.75, 0.9], [2, 3, 4, 5, 6, 7]],
  ]),
  laidOut("handball", "5-1", "Defence", [
    HB_KEEPER,
    ["Back 5", [0.0375, 0.1375, 0.17, 0.1375, 0.0375], [0.1, 0.25, 0.5, 0.75, 0.9], [2, 3, 4, 6, 7]],
    ["Front 1", 0.2375, [0.5], [5]],
  ]),
  laidOut("handball", "3-2-1", "Defence", [
    HB_KEEPER,
    ["Back 3", [0.1575, 0.17, 0.1575], [0.3, 0.5, 0.7], [3, 4, 5]],
    ["Middle 2", 0.2125, [0.2, 0.8], [2, 7]],
    ["Front 1", 0.275, [0.5], [6]],
  ]),
  laidOut("handball", "4-2", "Defence", [
    HB_KEEPER,
    ["Back 4", [0.0875, 0.165, 0.165, 0.0875], [0.15, 0.375, 0.625, 0.85], [2, 3, 5, 7]],
    ["Front 2", 0.2375, [0.35, 0.65], [4, 6]],
  ]),
  laidOut("handball", "3-3", "Defence", [
    HB_KEEPER,
    ["Back 3", [0.1575, 0.17, 0.1575], [0.3, 0.5, 0.7], [3, 4, 5]],
    ["Front 3", 0.2375, [0.2, 0.5, 0.8], [2, 6, 7]],
  ]),
];

/** Field hockey is eleven a side with a keeper, and reads its shapes as football does. */
const HOCKEY_FORMATIONS: Formation[] = (
  [
    ["Back four", ["4-3-3", "4-4-2", "4-2-3-1"]],
    ["Back three", ["3-3-1-3", "3-4-3", "3-3-3-1"]],
  ] as [string, string[]][]
).flatMap(([group, ids]) => ids.map((id) => fromNotation(id, group, "hockey")));

/**
 * Volleyball's shapes, six a side and no keeper. Depths are metres over the board's 24 —
 * court and free zone, own end line at 3, net at 12 — and spreads metres over its 15.
 * Numbers are rotation positions: 4-3-2 across the front, 5-6-1 across the back.
 */
const VOLLEYBALL_FORMATIONS: Formation[] = [
  laidOut("volleyball", "Base", "Rotation", [
    ["Back row", 0.229, [0.3, 0.5, 0.7], [5, 6, 1]],
    ["Front row", 0.4375, [0.3, 0.5, 0.7], [4, 3, 2]],
  ]),
  laidOut("volleyball", "W-receive", "Serve receive", [
    ["Back W", 0.208, [0.367, 0.633], [5, 6]],
    ["Front W", 0.354, [0.267, 0.5, 0.733], [4, 3, 2]],
    ["Setter", 0.471, [0.633], [1]],
  ]),
  laidOut("volleyball", "3-receive", "Serve receive", [
    ["Passers", 0.25, [0.3, 0.5, 0.7], [5, 6, 1]],
    ["Hitters", 0.458, [0.267, 0.733], [4, 2]],
    ["Setter", 0.471, [0.6], [3]],
  ]),
];

const CATALOGUE: Record<Sport, Formation[]> = {
  football: FORMATIONS,
  basketball: BASKETBALL_FORMATIONS,
  handball: HANDBALL_FORMATIONS,
  hockey: HOCKEY_FORMATIONS,
  volleyball: VOLLEYBALL_FORMATIONS,
};

/** What each side starts in, per sport: home then away. */
const SIDE_FORMATIONS: Record<Sport, [string, string]> = {
  football: [DEFAULT_FORMATION, "4-4-2"],
  basketball: ["2-3", "1-3-1"],
  handball: ["6-0", "5-1"],
  hockey: ["4-3-3", "3-3-1-3"],
  volleyball: ["Base", "W-receive"],
};

/** The formations a sport offers, and the groups its picker shows them under. */
export const formationsFor = (sport: Sport = "football"): Formation[] => CATALOGUE[sport];
export const formationGroupsFor = (sport: Sport = "football"): string[] => [
  ...new Set(CATALOGUE[sport].map((f) => f.group)),
];

/** The formation named, if its sport offers it; that sport's default otherwise. */
export function getFormation(id: string, sport: Sport = "football"): Formation {
  const list = CATALOGUE[sport];
  return list.find((f) => f.id === id) ?? list.find((f) => f.id === SIDE_FORMATIONS[sport][0])!;
}

/** Which goal a team defends. "left" attacks towards +x. */
export type Direction = "left" | "right";

export type TeamSpec = {
  id: string;
  name: string;
  color: string;
  textColor: string;
  pattern?: TeamPattern;
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
/** `wanted`, or the lowest shirt not already worn in this build. */
function freeNumber(wanted: number, used: Set<number>): number {
  if (!used.has(wanted)) return wanted;
  for (let n = 1; n <= 99; n++) if (!used.has(n)) return n;
  return wanted;
}

export function buildTeam(
  spec: TeamSpec,
  pitch: { length: number; width: number },
  sport: Sport = "football",
): BuiltTeam {
  const formation = getFormation(spec.formation, sport);
  const players: Player[] = [];
  const positions: Record<string, Vec2> = {};
  const links: Link[] = [];

  // Runs across every line, so a squad override addresses the eleven in one
  // sequence rather than line by line.
  let slot = 0;

  // Ids are `<team>-<number>`, so two players sharing a number share an id, and
  // the second silently overwrites the first in every scene's positions. A
  // formation's own numbers never collide; a squad carried across a formation
  // change can, when it is shorter than the new shape and a default lands on a
  // number the squad already uses.
  const used = new Set<number>();

  for (const line of formation.lines) {
    const ids: string[] = [];

    line.spread.forEach((across, i) => {
      const override = spec.squad?.[slot++];
      const depth = line.depths?.[i] ?? line.depth;
      const number = freeNumber(override?.number ?? line.numbers[i] ?? i + 1, used);
      used.add(number);
      const id = `${spec.id}-${number}`;
      ids.push(id);

      players.push({ id, number, label: override?.label ?? "" });
      positions[id] = {
        x: spec.direction === "left" ? depth * pitch.length : (1 - depth) * pitch.length,
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
      // buildTeam mints the whole team, so anything not on the spec is dropped —
      // the same reason a formation change has to carry the squad across.
      ...(spec.pattern ? { pattern: spec.pattern } : {}),
      players,
      formation: formation.id,
    },
    positions,
    links,
  };
}

/**
 * A team whose players are GIVEN rather than laid out from a preset.
 *
 * Video import needs this: the squad is whoever was tracked, which is however many
 * people were on screen, and there is no formation to place them in — their positions
 * come from the film. Kept here beside `buildTeam` on purpose. Anything added to `Team`
 * has to be carried through every site that mints one, and the whole point of that rule
 * is that there is one place to look.
 */
export function buildSquad(
  spec: Omit<TeamSpec, "formation" | "direction">,
  squad: { number?: number; label?: string }[],
): Team {
  const used = new Set<number>();
  const players: Player[] = squad.map((entry, i) => {
    // Ids are `<team>-<number>`, so two players sharing a number share an id and the
    // second silently overwrites the first in every scene's positions. Numbers read off
    // a shirt can repeat across a mis-read, and a track with none needs one anyway.
    const number = freeNumber(entry.number ?? i + 1, used);
    used.add(number);
    return { id: `${spec.id}-${number}`, number, label: entry.label ?? "" };
  });

  return {
    id: spec.id,
    name: spec.name,
    color: spec.color,
    textColor: spec.textColor,
    ...(spec.pattern ? { pattern: spec.pattern } : {}),
    players,
    // No formation: this side was never laid out from one, and claiming one would let
    // "reset positions" rearrange a squad that came off a video into a 4-3-3.
  };
}

export const DEFAULT_PITCH = { length: 105, width: 68 } as const;

/**
 * The two colours a board wears when the clip could not say what the kits were.
 *
 * Amber and violet, and deliberately NOT red and blue: those are the two most common kits
 * in football, so they are the two most likely to be read as real. A coach importing
 * Sporting against Galatasaray got his hooped side painted red and the actually-red side
 * painted blue, and spent six rounds of feedback translating the board back to the game.
 *
 * These are picker swatches like any other, so a coach who wants the real colours can set
 * them in two clicks -- and where the clip DOES measure the kits, `boardFromTracks` uses
 * those instead and never reaches here (D92 in football-tracks).
 */
export const HOME: TeamSpec = {
  id: "home",
  name: "Home",
  color: "#f59e0b",
  textColor: "#ffffff",
  formation: DEFAULT_FORMATION,
  direction: "left",
};

export const AWAY: TeamSpec = {
  id: "away",
  name: "Away",
  color: "#7c3aed",
  textColor: "#ffffff",
  formation: "4-4-2",
  direction: "right",
};

/**
 * The two sides a new board of `sport` starts with: home and away as ever, in that
 * sport's own opening shapes.
 */
export function sidesFor(sport: Sport = "football"): [TeamSpec, TeamSpec] {
  const [home, away] = SIDE_FORMATIONS[sport];
  return [
    { ...HOME, formation: home },
    { ...AWAY, formation: away },
  ];
}

/** A complete one-scene board — what the editor opens with. */
export function createBoardDoc(
  home: TeamSpec = HOME,
  away: TeamSpec = AWAY,
  /** The sport's own court when not given. */
  pitch?: { length: number; width: number },
  /**
   * What a new board and its first scene are called.
   *
   * Passed in rather than fixed here, so a board made in Portuguese is seeded in
   * Portuguese. English when nobody says otherwise, which keeps the engine
   * usable — and testable — with no translator in sight.
   */
  labels: { board?: string; scene?: string } = {},
  /** Football's boards say nothing about it, so every board drawn before there was a choice reads the same. */
  sport: Sport = "football",
): BoardDoc {
  const court = pitch ?? SPORTS[sport].pitch;
  const a = buildTeam(home, court, sport);
  const b = buildTeam(away, court, sport);

  return {
    version: 1,
    name: labels.board ?? "Untitled board",
    ...(sport !== "football" ? { sport } : {}),
    pitch: { ...court },
    teams: [a.team, b.team],
    scenes: [
      {
        id: "scene-1",
        name: labels.scene ?? "Scene 1",
        transitionMs: 0,
        holdMs: 1000,
        positions: { ...a.positions, ...b.positions },
        paths: {},
        // No ball until one is given to somebody — see D44.
        carrier: null,
        ballPath: null,
      },
    ],
    links: [...a.links, ...b.links],
  };
}

/**
 * Whether a board is still the one its sport opens with: nothing moved, added, drawn
 * or renamed beyond the names a board is seeded with in the reader's language.
 *
 * What decides whether switching sport can simply replace it, or has to ask first.
 */
export function isUntouched(doc: BoardDoc): boolean {
  const [home, away] = sidesFor(doc.sport);
  const fresh = createBoardDoc(home, away, undefined, {}, doc.sport ?? "football");
  // The seeded names are the reader's language's, so they are the one thing allowed
  // to differ: a board made in Portuguese is as untouched as one made in English.
  const bare = (d: BoardDoc) =>
    JSON.stringify({
      ...d,
      name: "",
      teams: d.teams.map((t) => ({ ...t, name: "" })),
      scenes: d.scenes.map((s) => ({ ...s, name: "" })),
      links: d.links.map((l) => ({ ...l, name: "" })),
    });
  return bare(doc) === bare(fresh);
}

/**
 * Re-apply a formation to one team in place, preserving the other team, the ball
 * and any links belonging to the side that did not change.
 */
export function applyFormation(doc: BoardDoc, teamIndex: 0 | 1, spec: TeamSpec): BoardDoc {
  const built = buildTeam(spec, doc.pitch, doc.sport);
  const other = doc.teams[teamIndex === 0 ? 1 : 0];
  const otherIds = new Set(other.players.map((p) => p.id));

  const teams: [Team, Team] = teamIndex === 0 ? [built.team, other] : [other, built.team];

  const scenes = doc.scenes.map((scene) => {
    const positions: Record<string, Vec2> = { ...built.positions };
    for (const id of otherIds) {
      const p = scene.positions[id];
      if (p) positions[id] = p;
    }
    // A carrier that no longer exists would fail validation. One who leaves the
    // squad drops the ball where they were standing; a scene that had no ball
    // still has none.
    const held = scene.carrier;
    const carrier = held && (otherIds.has(held) || held in built.positions) ? held : null;
    return {
      ...scene,
      positions,
      carrier,
      ballPos:
        carrier !== null
          ? undefined
          : (scene.ballPos ?? (held ? scene.positions[held] : undefined)),
    };
  });

  // The old shape's units go with the old shape: a back four's chain says
  // nothing about a back three, and keeping both would stack a stale connector
  // under the new one. Ownership is read from the OLD team, since a squad
  // carried across keeps its ids and the stale links would otherwise survive.
  // Slotted in where that side's links already sat, so the draw order holds.
  const links = replaceTeamLinks(doc, teamIndex, built.links);

  // pruneLinks drops any link still referencing a player who has just gone, and
  // discards ones left with fewer than two members. pruneBallFlags does the same for
  // a strike whose ball no longer travels — a carrier who has just been rebuilt
  // away is nulled above, which can leave two scenes holding the ball still.
  return pruneBallFlags(pruneLinks({ ...doc, teams, scenes, links }));
}

/**
 * Change one side's shape, keeping the squad that stands in it.
 *
 * The names and numbers are the coach's work and survive; the positions and the
 * seeded links belong to the shape and do not. Slots pair by ORDER, so a squad
 * deeper than the new shape loses its tail, and a shallower one takes the new
 * shape's own numbers for the slots it does not reach.
 *
 * `applyFormation` stays mechanical — it does what its spec says, which is what
 * lets a preset bring a squad of its own. This is the editor's intent, named so
 * it can be tested without a component.
 */
export function changeFormation(doc: BoardDoc, teamIndex: 0 | 1, formation: string): BoardDoc {
  const team = doc.teams[teamIndex];
  return applyFormation(doc, teamIndex, {
    ...(teamIndex === 0 ? HOME : AWAY),
    name: team.name,
    color: team.color,
    textColor: team.textColor,
    pattern: team.pattern,
    formation,
    squad: team.players.map((p) => ({ number: p.number, label: p.label })),
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
  const target = formationMarks(doc);

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

/**
 * Where each player's formation puts him, by id.
 *
 * Players added by hand sit past the last slot of the shape and have no mark, so
 * they are simply absent.
 */
export function formationMarks(doc: BoardDoc): Record<string, Vec2> {
  const target: Record<string, Vec2> = {};

  doc.teams.forEach((team, i) => {
    const built = buildTeam(
      {
        id: team.id,
        name: team.name,
        color: team.color,
        textColor: team.textColor,
        formation: team.formation ?? sidesFor(doc.sport)[i].formation,
        direction: directionOf(i),
      },
      doc.pitch,
      doc.sport,
    );

    // Paired by ORDER, not by id. Renumbering a player keeps their id, so the
    // `<team>-<number>` ids a fresh build produces need not match the squad at
    // all. Players added by hand sit past the last slot and stay where they are.
    team.players.forEach((player, k) => {
      const slot = built.team.players[k];
      if (slot) target[player.id] = built.positions[slot.id];
    });
  });

  return target;
}

/**
 * The same scene, with nothing left of an entity's run into it: its curve, its own
 * travel time, its wait and its run style. A run of zero length has no use for
 * any of them, and leaving them behind would let a later drag resurrect a timing
 * nobody can see.
 */
function withoutRun(scene: Scene, id: string): Scene {
  const next: Scene = { ...scene, paths: { ...scene.paths } };
  delete next.paths[id];
  for (const field of ["travel", "delay", "run"] as const) {
    const record = scene[field];
    if (!record || !(id in record)) continue;
    const rest = { ...record };
    delete rest[id];
    if (Object.keys(rest).length === 0) delete next[field];
    else (next[field] as Record<string, unknown>) = rest;
  }
  return next;
}

/**
 * Take back players' moves into one scene.
 *
 * Each goes back to where he stood in the scene before — on the first scene, where
 * there is no scene before, back to his formation mark — and the run into it goes
 * with the move. The change is carried forward exactly as a drag is (`carry`), so
 * a player moved by mistake while "While still" was on comes back out of every
 * scene the mistake reached, and stops where it stopped.
 */
export function resetMove(
  doc: BoardDoc,
  sceneIndex: number,
  ids: Iterable<string>,
  carry: Carry,
): BoardDoc {
  const scene = doc.scenes[sceneIndex];
  if (!scene) return doc;
  const marks = sceneIndex === 0 ? formationMarks(doc) : null;

  let next = doc;
  for (const id of ids) {
    const at = scene.positions[id];
    const back = marks ? marks[id] : doc.scenes[sceneIndex - 1].positions[id];
    if (!at || !back) continue;
    next = moveEntities(next, sceneIndex, [id], { x: back.x - at.x, y: back.y - at.y }, carry);
    if (sceneIndex > 0) {
      const scenes = next.scenes.slice();
      scenes[sceneIndex] = withoutRun(scenes[sceneIndex], id);
      next = { ...next, scenes };
    }
  }
  return next;
}

/** Is there a move into this scene for any of these players to take back? */
export function canResetMove(doc: BoardDoc, sceneIndex: number, ids: Iterable<string>): boolean {
  const scene = doc.scenes[sceneIndex];
  if (!scene) return false;
  const marks = sceneIndex === 0 ? formationMarks(doc) : null;
  for (const id of ids) {
    const at = scene.positions[id];
    const back = marks ? marks[id] : doc.scenes[sceneIndex - 1].positions[id];
    if (!at || !back) continue;
    if (Math.hypot(at.x - back.x, at.y - back.y) > 1e-6) return true;
    if (sceneIndex > 0 && runLeftovers(scene, id)) return true;
  }
  return false;
}

const runLeftovers = (scene: Scene, id: string): boolean =>
  scene.paths[id] != null ||
  scene.travel?.[id] !== undefined ||
  scene.delay?.[id] !== undefined ||
  scene.run?.[id] !== undefined;

/**
 * Take away every move players make: each stands where the first scene has him, in
 * every scene, with no runs, timings or run styles left anywhere. The first scene
 * is his starting position, not a move, so it is kept — "Back to formation" on it
 * is the single-scene reset.
 */
export function removeAllMovement(doc: BoardDoc, ids: Iterable<string>): BoardDoc {
  const list = [...ids];
  const start = doc.scenes[0];
  const scenes = doc.scenes.map((scene, k) => {
    let next: Scene = { ...scene, positions: { ...scene.positions } };
    for (const id of list) {
      const at = start.positions[id];
      if (!at || !next.positions[id]) continue;
      next.positions[id] = { ...at };
      if (k > 0) next = withoutRun(next, id);
    }
    return next;
  });
  return pruneBallFlags({ ...doc, scenes });
}

/** Does any of these players move, or keep any run, anywhere after the first scene? */
export function hasMovement(doc: BoardDoc, ids: Iterable<string>): boolean {
  const list = [...ids];
  const start = doc.scenes[0];
  return doc.scenes.some(
    (scene, k) =>
      k > 0 &&
      list.some((id) => {
        const a = start.positions[id];
        const b = scene.positions[id];
        return (!!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) > 1e-6) || runLeftovers(scene, id);
      }),
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
