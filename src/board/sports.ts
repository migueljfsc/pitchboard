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
  /**
   * How far the goal line stands in from the end of the board, in units. Absent is on the
   * end, as every net was before ice hockey (D123), whose goals stand 4 m out from the end
   * boards with play behind them.
   */
  line?: number;
};

/** Where a net's goal line is along the board: at the near end (`dir` 1) or the far one. */
export const goalLineX = (goal: NetGoal, length: number, dir: 1 | -1): number =>
  dir === 1 ? (goal.line ?? 0) : length - (goal.line ?? 0);

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

/** No goal at all: nothing a dropped ball lands in scores (volleyball). */
export type NoGoal = { kind: "none" };

/**
 * A net strung across the middle of the court (volleyball), in units: its top off the
 * floor, the depth of its mesh below that, and how far its posts stand outside each
 * sideline. Stands in 3D, sorted among the players by the centre line it hangs over.
 */
export type CentreNet = { top: number; mesh: number; postsOut: number; antenna: number };

export type SportSpec = {
  id: Sport;
  /** The court as measured, in metres. */
  metres: { length: number; width: number };
  /** The court as stored, in board units: always football's length. */
  pitch: { length: number; width: number };
  metresPerUnit: number;
  /** Whether a side has a goalkeeper, who can wear a kit of his own. */
  keeper: boolean;
  /**
   * What the court is laid on. Grass takes the turf's texture; a floor and synthetic
   * turf take only its shade.
   */
  surface: "grass" | "floor" | "turf";
  goal: NetGoal | HoopGoal | NoGoal;
  /** A net across the middle, where the game has one. */
  centreNet?: CentreNet;
  /**
   * The court's lines, in units, inside the board. Absent is the board itself. Volleyball's
   * board is the court AND its free zone, so a server can stand behind the end line.
   */
  court?: { x: number; y: number; length: number; width: number };
  /** What names the ball in a list or on a button, where a word would be a language's. */
  ballGlyph: string;
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

/** A FIFA futsal court's markings, in metres (Futsal Laws of the Game, Law 1). */
export const FUTSAL_COURT = {
  lineWidth: 0.08,
  centreCircle: 3,
  /**
   * The penalty area: quarter circles of 6 m about the OUTSIDE of each post, joined by a
   * 3.16 m line — the goal's 3 m and both posts.
   */
  penaltyArea: 6,
  postWidth: 0.08,
  penaltyMark: 6,
  secondPenaltyMark: 10,
  /** The two marks either side of the second penalty mark. */
  secondMarkSide: 5,
  markRadius: 0.1,
  cornerArc: 0.25,
  /** The substitution zones: 5 m long, starting 5 m from the halfway line, on the bench side. */
  substitution: { from: 5, to: 10, tick: 0.4 },
  goalWidth: 3,
  goalHeight: 2,
  goalDepth: 1,
} as const;

const FUTSAL = scaled(40, 20);
const fs = (m: number): number => m / FUTSAL.metresPerUnit;

/** An IHF handball court's markings, in metres. */
export const HANDBALL_COURT = {
  lineWidth: 0.05,
  /** The goal area: quarter circles about each post, joined by a line across the goal. */
  goalArea: 6,
  /** The free-throw line, dashed, drawn the same way. */
  freeThrow: 9,
  /** The 7-metre line, a metre long, and the keeper's 4-metre restraining line. */
  sevenMetre: 7,
  sevenMetreLength: 1,
  keeperLine: 4,
  keeperLineLength: 0.15,
  goalWidth: 3,
  goalHeight: 2,
  goalDepth: 1,
} as const;

const HANDBALL = scaled(40, 20);
const hb = (m: number): number => m / HANDBALL.metresPerUnit;

/** An FIH field hockey pitch's markings, in metres. */
export const HOCKEY_FIELD = {
  lineWidth: 0.075,
  /** The shooting circle: quarter circles about each post, joined by a line across the goal. */
  circle: 14.63,
  /** The dashed circle five metres beyond it. */
  outerCircle: 19.63,
  /** The 23-metre line, in from each back line. */
  quarter: 22.9,
  penaltySpot: 6.475,
  goalWidth: 3.66,
  goalHeight: 2.14,
  goalDepth: 1.2,
} as const;

const HOCKEY = scaled(91.4, 55);
const fh = (m: number): number => m / HOCKEY.metresPerUnit;

/** An FIVB volleyball court's markings, in metres. The board is the court and its free zone. */
export const VOLLEYBALL_COURT = {
  length: 18,
  width: 9,
  /** Around the court on every side, and inside the board. */
  freeZone: 3,
  lineWidth: 0.05,
  /** The attack line, in from the centre line on each side. */
  attack: 3,
  /** The top of the net off the floor (men's), and the depth of its mesh. */
  netTop: 2.43,
  netMesh: 1,
  postsOut: 1,
  antenna: 0.8,
} as const;

/**
 * An IIHF ice rink's markings, in metres (IIHF Official Rule Book and Ice Arena Guide): the
 * championship rink, 60 × 30 m with the larger corner radius. The goal lines stand in from the
 * end boards, and the goals on them, so play goes on behind each net (D123).
 */
export const ICE_RINK = {
  length: 60,
  width: 30,
  cornerRadius: 8.5,
  goalLine: 4,
  goalLineWidth: 0.05,
  /** Fifteen metres apart, so a quarter of the rink: centred 7.5 m either side of centre ice. */
  blueApart: 15,
  blueWidth: 0.3,
  redWidth: 0.3,
  circleRadius: 4.5,
  centreSpot: 0.15,
  spot: 0.3,
  /** End-zone spots: out from the goal line, and either side of the long axis. */
  endSpotOut: 6,
  spotSide: 7,
  /** Neutral-zone spots: in from each blue line, towards centre ice. */
  neutralSpotIn: 1.5,
  /** The hash marks on the outer edge of each end-zone circle, parallel to the goal line. */
  hashLength: 0.6,
  hashApart: 1.7,
  /** The goal crease, a semicircle out from the goal line. */
  crease: 1.83,
  /** The goalkeeper's trapezoid behind each goal: across at the goal line, and at the boards. */
  trapezoid: { atGoalLine: 6.8, atBoards: 8.6 },
  /** The officials' crease, a semicircle against the boards at centre ice. */
  officials: 3,
  goalWidth: 1.83,
  goalHeight: 1.22,
  goalDepth: 1.12,
} as const;

const ICE = scaled(ICE_RINK.length, ICE_RINK.width);
const ih = (m: number): number => m / ICE.metresPerUnit;

const V = VOLLEYBALL_COURT;
const VOLLEYBALL = scaled(V.length + V.freeZone * 2, V.width + V.freeZone * 2);
const vb = (m: number): number => m / VOLLEYBALL.metresPerUnit;

export const SPORTS: Record<Sport, SportSpec> = {
  football: {
    id: "football",
    ...scaled(PITCH.length, PITCH.width),
    keeper: true,
    surface: "grass",
    goal: { kind: "net", width: PITCH.goalWidth, depth: PITCH.goalDepth, height: PITCH.goalHeight },
    ballGlyph: "⚽",
    headroom: HEADROOM,
    snaps: {
      depths: [PITCH.sixYardDepth, PITCH.penaltySpot, PITCH.penaltyDepth],
      spans: [PITCH.sixYardWidth, PITCH.penaltyWidth],
    },
  },
  futsal: {
    id: "futsal",
    ...FUTSAL,
    keeper: true,
    surface: "floor",
    goal: {
      kind: "net",
      width: fs(FUTSAL_COURT.goalWidth),
      depth: fs(FUTSAL_COURT.goalDepth),
      height: fs(FUTSAL_COURT.goalHeight),
    },
    ballGlyph: "⚽",
    headroom: 0.05,
    snaps: {
      depths: [FUTSAL_COURT.penaltyArea, FUTSAL_COURT.secondPenaltyMark].map(fs),
      spans: [fs(FUTSAL_COURT.goalWidth)],
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
    ballGlyph: "🏀",
    headroom: 0.08,
    snaps: { depths: [bb(COURT.keyDepth)], spans: [bb(COURT.keyWidth)] },
  },
  handball: {
    id: "handball",
    ...HANDBALL,
    keeper: true,
    surface: "floor",
    goal: {
      kind: "net",
      width: hb(HANDBALL_COURT.goalWidth),
      depth: hb(HANDBALL_COURT.goalDepth),
      height: hb(HANDBALL_COURT.goalHeight),
    },
    ballGlyph: "🤾",
    headroom: 0.05,
    snaps: {
      depths: [HANDBALL_COURT.goalArea, HANDBALL_COURT.sevenMetre, HANDBALL_COURT.freeThrow].map(hb),
      spans: [hb(HANDBALL_COURT.goalWidth)],
    },
  },
  hockey: {
    id: "hockey",
    ...HOCKEY,
    keeper: true,
    surface: "turf",
    goal: {
      kind: "net",
      width: fh(HOCKEY_FIELD.goalWidth),
      depth: fh(HOCKEY_FIELD.goalDepth),
      height: fh(HOCKEY_FIELD.goalHeight),
    },
    ballGlyph: "🏑",
    headroom: HEADROOM,
    snaps: {
      depths: [HOCKEY_FIELD.penaltySpot, HOCKEY_FIELD.circle, HOCKEY_FIELD.quarter].map(fh),
      spans: [fh(HOCKEY_FIELD.goalWidth)],
    },
  },
  icehockey: {
    id: "icehockey",
    ...ICE,
    keeper: true,
    // Ice takes the board's shade and nothing else, as a hall floor does.
    surface: "floor",
    goal: {
      kind: "net",
      width: ih(ICE_RINK.goalWidth),
      depth: ih(ICE_RINK.goalDepth),
      height: ih(ICE_RINK.goalHeight),
      line: ih(ICE_RINK.goalLine),
    },
    ballGlyph: "🏒",
    headroom: 0.05,
    snaps: {
      depths: [
        ICE_RINK.goalLine,
        ICE_RINK.goalLine + ICE_RINK.endSpotOut,
        ICE_RINK.length / 2 - ICE_RINK.blueApart / 2,
      ].map(ih),
      spans: [ih(ICE_RINK.spotSide * 2)],
    },
  },
  volleyball: {
    id: "volleyball",
    ...VOLLEYBALL,
    keeper: false,
    surface: "floor",
    goal: { kind: "none" },
    centreNet: { top: vb(V.netTop), mesh: vb(V.netMesh), postsOut: vb(V.postsOut), antenna: vb(V.antenna) },
    court: { x: vb(V.freeZone), y: vb(V.freeZone), length: vb(V.length), width: vb(V.width) },
    ballGlyph: "🏐",
    headroom: HEADROOM,
    snaps: {
      depths: [V.freeZone, V.freeZone + V.length / 2 - V.attack].map(vb),
      spans: [vb(V.width)],
    },
  },
};

export { SPORT_IDS } from "./types";

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
  if (goal.kind === "none") return null;
  if (goal.kind === "net" && goal.line) {
    // A goal standing on the ice is its own footprint: behind the goal line but beside or
    // behind the net is where play goes on, not a goal (D123).
    const half = goal.width / 2;
    if (Math.abs(p.y - width / 2) > half) return null;
    const near = goalLineX(goal, length, 1);
    const far = goalLineX(goal, length, -1);
    const inNear = p.x < near && p.x >= near - goal.depth;
    const inFar = p.x > far && p.x <= far + goal.depth;
    return inNear || inFar ? p : null;
  }
  if (goal.kind === "net") return p.x < 0 || p.x > length ? p : null;
  for (const x of [goal.centre, length - goal.centre]) {
    const ring = { x, y: width / 2 };
    if (Math.hypot(p.x - ring.x, p.y - ring.y) <= goal.reach) return ring;
  }
  return null;
}
