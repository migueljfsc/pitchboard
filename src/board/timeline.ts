/**
 * Resolving a document at an instant in time.
 *
 * Pure and framework-free, like the renderer that consumes it. `resolveAt` finds
 * which scene pair a time falls between; `positionAt` interpolates one entity;
 * `frameAt` does the whole board.
 */

import type { BoardDoc, Scene, Vec2 } from "./types";
import { BALL_ID } from "./types";
import { TOKEN_RADIUS, BALL_RADIUS } from "./pitch";
import {
  buildArcTable,
  cubicAtDistance,
  easeInOutCubic,
  easeOutQuad,
  lerpVec,
  type Bezier,
} from "./geometry";

/** Distance from a carrier's centre to the ball it is running with. */
export const BALL_GLUE = TOKEN_RADIUS + BALL_RADIUS + 0.15;

export type Resolved = {
  /** Scene being interpolated out of. Equal to `to` during a hold. */
  from: Scene;
  to: Scene;
  /** Raw progress 0..1. Exactly 1 during a hold, so callers need no special case. */
  u: number;
  /** False during a hold — lets the renderer skip path decoration. */
  moving: boolean;
  /** Index of `to` in doc.scenes. */
  index: number;
};

/**
 * How long the travel into a scene actually takes.
 *
 * `transitionMs` is the baseline every entity uses. An entity given its own time
 * in `travel` may take longer, and the scene stretches to fit its slowest mover —
 * otherwise a deliberately slow run would be cut off mid-stride.
 */
export function sceneTravelMs(scene: Scene): number {
  let longest = scene.transitionMs;
  if (scene.travel) {
    for (const ms of Object.values(scene.travel)) if (ms > longest) longest = ms;
  }
  return longest;
}

/** Travel time for one entity into a scene, falling back to the scene baseline. */
export function entityTravelMs(scene: Scene, entityId: string): number {
  return scene.travel?.[entityId] ?? scene.transitionMs;
}

/**
 * Scene 0 contributes only its hold; every later scene contributes a transition
 * then a hold. `scenes[0].transitionMs` is meaningless — there is nothing to
 * travel from — and is ignored throughout.
 */
export function totalDurationMs(doc: BoardDoc): number {
  let total = doc.scenes[0]?.holdMs ?? 0;
  for (let i = 1; i < doc.scenes.length; i++) {
    total += sceneTravelMs(doc.scenes[i]) + doc.scenes[i].holdMs;
  }
  return total;
}

export function resolveAt(doc: BoardDoc, tSeconds: number): Resolved {
  const scenes = doc.scenes;
  const last = scenes.length - 1;
  const total = totalDurationMs(doc);
  const ms = Math.min(Math.max(tSeconds * 1000, 0), total);

  const hold = (i: number): Resolved => ({ from: scenes[i], to: scenes[i], u: 1, moving: false, index: i });

  if (ms <= scenes[0].holdMs || last === 0) return hold(0);

  let acc = scenes[0].holdMs;
  for (let i = 1; i <= last; i++) {
    const s = scenes[i];
    const travel = sceneTravelMs(s);
    if (travel > 0 && ms < acc + travel) {
      return { from: scenes[i - 1], to: s, u: (ms - acc) / travel, moving: true, index: i };
    }
    acc += travel;
    if (ms <= acc + s.holdMs) return hold(i);
    acc += s.holdMs;
  }
  return hold(last);
}

/**
 * A synthetic Resolved for the transition into scene `index`, independent of where
 * the scrubber sits. The editor uses it to show and edit a run's curve while that
 * scene is selected.
 */
export function transitionInto(doc: BoardDoc, index: number): Resolved | null {
  if (index < 1 || index >= doc.scenes.length) return null;
  return { from: doc.scenes[index - 1], to: doc.scenes[index], u: 1, moving: true, index };
}

/**
 * The curve to DRAW for an entity's run, or null if it holds still.
 *
 * Unlike the motion curve, a straight run still yields a bezier with its controls
 * on the line — that is what gives the editor handles to drag in order to bend it.
 */
export function displayCurve(entityId: string, r: Resolved): Bezier | null {
  const p0 = r.from.positions[entityId];
  const p1 = r.to.positions[entityId];
  if (!p0 || !p1) return null;
  if (p0.x === p1.x && p0.y === p1.y) return null;

  const curve = r.to.paths[entityId];
  if (curve) return { p0, c1: curve.c1, c2: curve.c2, p1 };
  return {
    p0,
    c1: { x: p0.x + (p1.x - p0.x) / 3, y: p0.y + (p1.y - p0.y) / 3 },
    c2: { x: p0.x + (2 * (p1.x - p0.x)) / 3, y: p0.y + (2 * (p1.y - p0.y)) / 3 },
    p1,
  };
}

/** Curve for `entityId` travelling into `r.to`, or null for a straight tween. */
function bezierFor(entityId: string, r: Resolved): Bezier | null {
  const curve = r.to.paths[entityId];
  const p0 = r.from.positions[entityId];
  const p1 = r.to.positions[entityId];
  if (!curve || !p0 || !p1) return null;
  return { p0, c1: curve.c1, c2: curve.c2, p1 };
}

/**
 * Where one entity is within the scene's travel window, 0..1.
 *
 * `r.u` runs over the whole window, which is as long as the slowest mover needs.
 * An entity with a shorter time of its own finishes early and waits at its
 * destination.
 */
export function progressOf(entityId: string, r: Resolved): number {
  const window = sceneTravelMs(r.to);
  const own = entityTravelMs(r.to, entityId);
  if (window <= 0 || own <= 0) return 1;
  return Math.min((r.u * window) / own, 1);
}

export function positionAt(entityId: string, r: Resolved, doc: BoardDoc): Vec2 {
  const to = r.to.positions[entityId];
  if (!r.moving) return to ?? r.from.positions[entityId] ?? centre(doc);

  const from = r.from.positions[entityId];
  if (!from) return to ?? centre(doc);
  if (!to) return from;

  const eased = easeInOutCubic(progressOf(entityId, r));
  const b = bezierFor(entityId, r);
  // Travel BY LENGTH, not by parameter, or the run speeds up and stalls.
  return b ? cubicAtDistance(b, eased, buildArcTable(b)) : lerpVec(from, to, eased);
}

/**
 * Which way a stationary carrier is facing, so the ball sits ahead of the token
 * rather than on top of its number.
 *
 * Assumes teams[0] attacks towards +x, which is how createBoardDoc builds a
 * board. Getting it wrong costs a 1.5 m offset on the wrong side, not a bug.
 */
function facingOf(entityId: string, doc: BoardDoc): Vec2 {
  const home = doc.teams[0].players.some((p) => p.id === entityId);
  return { x: home ? 1 : -1, y: 0 };
}

/** Where the ball sits when `carrier` is running with it. */
function gluedTo(carrier: string, r: Resolved, doc: BoardDoc): Vec2 {
  const at = positionAt(carrier, r, doc);

  // Point the offset along the direction of travel, sampled either side of now.
  let dir = facingOf(carrier, doc);
  if (r.moving) {
    const ahead = positionAt(carrier, { ...r, u: Math.min(r.u + 0.02, 1) }, doc);
    const dx = ahead.x - at.x;
    const dy = ahead.y - at.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) dir = { x: dx / len, y: dy / len };
  }

  return { x: at.x + dir.x * BALL_GLUE, y: at.y + dir.y * BALL_GLUE };
}

/**
 * The ball is derived, never stored, while carried. A pass is a carrier change —
 * there is no pass object.
 *
 * | from -> to | behaviour                                            |
 * |------------|------------------------------------------------------|
 * | A -> A     | glued to A, offset along its direction of travel     |
 * | A -> B     | a pass: travels between the two, easeOutQuad         |
 * | A -> null  | loose: travels to the stored position                |
 * | null -> B  | collected                                            |
 * | null->null | ordinary entity, along ballPath if one is drawn      |
 */
export function ballAt(r: Resolved, doc: BoardDoc): Vec2 {
  const fromCarrier = r.from.carrier;
  const toCarrier = r.to.carrier;

  if (toCarrier && fromCarrier === toCarrier) return gluedTo(toCarrier, r, doc);
  if (!r.moving) {
    return toCarrier ? gluedTo(toCarrier, r, doc) : (r.to.ballPos ?? centre(doc));
  }

  // Both endpoints are evaluated live, so the ball tracks a receiver who is still
  // moving and arrives with them — no teleport at the handoff. Aiming at the
  // receiver's scene-start position instead would land the ball 50 m adrift.
  const start = fromCarrier ? gluedTo(fromCarrier, r, doc) : (r.from.ballPos ?? centre(doc));
  const end = toCarrier ? gluedTo(toCarrier, r, doc) : (r.to.ballPos ?? centre(doc));

  // A pass is struck hard and decelerates; easing it in like a jogging player
  // looks wrong immediately. The ball honours its own travel override too.
  const eased = easeOutQuad(progressOf(BALL_ID, r));
  const curve = r.to.ballPath;
  if (!curve) return lerpVec(start, end, eased);

  const b: Bezier = { p0: start, c1: curve.c1, c2: curve.c2, p1: end };
  return cubicAtDistance(b, eased, buildArcTable(b));
}

/** Resolved board state at an instant — everything the renderer needs. */
export type Frame = {
  positions: Record<string, Vec2>;
  ball: Vec2;
  resolved: Resolved;
};

export function frameAt(doc: BoardDoc, t: number): Frame {
  const resolved = resolveAt(doc, t);
  const positions: Record<string, Vec2> = {};
  for (const team of doc.teams) {
    for (const player of team.players) {
      positions[player.id] = positionAt(player.id, resolved, doc);
    }
  }
  return { positions, ball: ballAt(resolved, doc), resolved };
}

const centre = (doc: BoardDoc): Vec2 => ({ x: doc.pitch.length / 2, y: doc.pitch.width / 2 });
