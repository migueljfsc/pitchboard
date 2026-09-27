/**
 * The games a board can be drawn for, and everything that differs between them.
 *
 * Every sport shares one engine: scenes, runs, the ball, links, drawings, the 3D
 * view and export are the same code. What differs is the court, its markings, the
 * goals, the ball and the lineups — and those are read from here, never branched on
 * by name at a call site.
 *
 * Every court is laid out at football's length, in BOARD UNITS (D113). A basketball
 * court is 28 m long and is stored 105 units long, so a token, a line, an arrowhead,
 * a snap distance and the 3D camera — all tuned on a 105 m pitch — are the same size
 * against it. A person never reads a unit: `metresPerUnit` turns one back into
 * metres for the link distances, the ruler, the pass speed and the flow pace.
 */

import type { BoardDoc, Sport, Vec2 } from "./types";
import { PITCH } from "./pitch";
import { HEADROOM } from "./projection";

/** A football goal: a net behind the line, between two posts. */
export type NetGoal = {
  kind: "net";
  /** Between the posts, in units. */
  width: number;
  /** Behind the line, in units. */
  depth: number;
  height: number;
};

/**
 * A basketball goal: a ring in front of a backboard, inside the court, off the floor.
 * Distances are from the baseline, in units.
 */
export type HoopGoal = {
  kind: "hoop";
  /** The ring's centre, out from the baseline. */
  centre: number;
  radius: number;
  height: number;
  /** The backboard: where it stands, how wide it is, and its bottom and top edges. */
  board: { line: number; width: number; bottom: number; top: number };
  /** How near a dropped ball has to land to the ring's centre to go in. */
  reach: number;
};

export type SportSpec = {
  id: Sport;
  /** The court as measured, in metres. */
  metres: { length: number; width: number };
  /** The court as stored, in board units: always football's length. */
  pitch: { length: number; width: number };
  metresPerUnit: number;
  /** Whether a side has a goalkeeper, who can wear a kit of his own. */
  keeper: boolean;
  /** What the court is laid on, and so what draws it. */
  surface: "grass" | "floor";
  goal: NetGoal | HoopGoal;
  /**
   * Room the 3D view leaves above the far end, as a fraction of the board's height:
   * a ring's backboard stands five times as tall as a crossbar.
   */
  headroom: number;
  /**
   * The markings a dragged label is drawn onto, beyond the lines every court has:
   * `depths` in from each end, `spans` wide about the middle.
   */
  snaps: { depths: number[]; spans: number[] };
};

/** Football's length is the board's; every court is scaled to it. */
const BOARD_LENGTH = PITCH.length;

/** A court measured in metres, as a spec's `pitch` and `metresPerUnit`. */
function scaled(length: number, width: number) {
  const metresPerUnit = length / BOARD_LENGTH;
  return {
    metres: { length, width },
    pitch: { length: BOARD_LENGTH, width: width / metresPerUnit },
    metresPerUnit,
  };
}

/**
 * A FIBA court's markings, in metres. Converted to units where they are drawn, so the
 * numbers here read as the rulebook does.
 */
export const COURT = {
  lineWidth: 0.05,
  centreCircle: 1.8,
  /** The restricted area: from the baseline to the free-throw line, and across. */
  keyDepth: 5.8,
  keyWidth: 4.9,
  freeThrowCircle: 1.8,
  /** Radius of the three-point arc, from the ring's centre. */
  threePoint: 6.75,
  /** The straight part of the three-point line, in from each sideline. */
  threePointSide: 0.9,
  /** The no-charge semicircle under the ring. */
  noCharge: 1.25,
} as const;

const BASKETBALL = scaled(28, 15);
/** FIBA metres into basketball's units. */
const bb = (m: number): number => m / BASKETBALL.metresPerUnit;

export const SPORTS: Record<Sport, SportSpec> = {
  football: {
    id: "football",
    ...scaled(PITCH.length, PITCH.width),
    keeper: true,
    surface: "grass",
    goal: { kind: "net", width: PITCH.goalWidth, depth: PITCH.goalDepth, height: PITCH.goalHeight },
    headroom: HEADROOM,
    snaps: {
      depths: [PITCH.sixYardDepth, PITCH.penaltySpot, PITCH.penaltyDepth],
      spans: [PITCH.sixYardWidth, PITCH.penaltyWidth],
    },
  },
  basketball: {
    id: "basketball",
    ...BASKETBALL,
    keeper: false,
    surface: "floor",
    goal: {
      kind: "hoop",
      centre: bb(1.575),
      radius: bb(0.225),
      height: bb(3.05),
      board: { line: bb(1.2), width: bb(1.8), bottom: bb(2.9), top: bb(3.95) },
      reach: bb(0.45),
    },
    headroom: 0.08,
    snaps: { depths: [bb(COURT.keyDepth)], spans: [bb(COURT.keyWidth)] },
  },
};

/** Every sport, in the order a picker offers them. */
export const SPORT_IDS: readonly Sport[] = ["football", "basketball"];

export const DEFAULT_SPORT: Sport = "football";

export const sportOf = (doc: { sport?: Sport }): SportSpec => SPORTS[doc.sport ?? DEFAULT_SPORT];

/** A distance on the board, in the metres a person reads. */
export const toMetres = (doc: { sport?: Sport }, units: number): number =>
  units * sportOf(doc).metresPerUnit;

/**
 * The spot a ball dropped at `p` scores in, or null.
 *
 * A net takes anything behind either goal line — `clampBall` has already kept it
 * between the posts. A ring takes a ball dropped within reach of its centre, and the
 * ball is put through the middle of it.
 */
export function goalAt(doc: Pick<BoardDoc, "sport" | "pitch">, p: Vec2): Vec2 | null {
  const goal = sportOf(doc).goal;
  const { length, width } = doc.pitch;
  if (goal.kind === "net") return p.x < 0 || p.x > length ? p : null;
  for (const x of [goal.centre, length - goal.centre]) {
    const ring = { x, y: width / 2 };
    if (Math.hypot(p.x - ring.x, p.y - ring.y) <= goal.reach) return ring;
  }
  return null;
}
