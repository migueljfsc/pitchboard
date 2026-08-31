/**
 * Resolving a document at an instant in time.
 *
 * Pure and framework-free, like the renderer that consumes it. `resolveAt` finds
 * which scene pair a time falls between; `positionAt` interpolates one entity;
 * `frameAt` does the whole board.
 */

import type { BoardDoc, Scene, Vec2 } from "./types";
import { BALL_ID } from "./types";
import { ballRadius, tokenRadius, tokenScaleOf } from "./pitch";
import {
  buildArcTable,
  cubicAtDistance,
  easeInOutCubic,
  easeOutQuad,
  lerpVec,
  type Bezier,
} from "./geometry";

/** Distance from a carrier's centre to the ball it is running with. */
export const ballGlue = (doc: BoardDoc): number =>
  tokenRadius(doc) + ballRadius(doc) + 0.15 * tokenScaleOf(doc);

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
 * `transitionMs` is the baseline every entity uses. An entity may take longer
 * (`travel`) or set off later (`delay`), and the scene stretches to fit whoever
 * ARRIVES LAST — otherwise a deliberately slow or deliberately late run would be
 * cut off mid-stride.
 */
export function sceneTravelMs(scene: Scene): number {
  let longest = scene.transitionMs;

  // An entity is done when its own wait and its own run are both over, so the
  // window is measured from zero to the last arrival rather than to the longest
  // single run.
  for (const id of new Set([
    ...Object.keys(scene.travel ?? {}),
    ...Object.keys(scene.delay ?? {}),
  ])) {
    const ends = entityDelayMs(scene, id) + entityTravelMs(scene, id);
    if (ends > longest) longest = ends;
  }

  return longest;
}

/** Travel time for one entity into a scene, falling back to the scene baseline. */
export function entityTravelMs(scene: Scene, entityId: string): number {
  return scene.travel?.[entityId] ?? scene.transitionMs;
}

/** How long an entity waits before setting off into a scene. Zero by default. */
export function entityDelayMs(scene: Scene, entityId: string): number {
  return scene.delay?.[entityId] ?? 0;
}

// ---------------------------------------------------------------- flow mode

/** Bounds on the flow pace, in metres per second. A sprint is about 9. */
export const MIN_FLOW_SPEED = 1;
export const MAX_FLOW_SPEED = 30;
export const DEFAULT_FLOW_SPEED = 10;
export const DEFAULT_END_HOLD_MS = 1200;

/**
 * Floor on a flow transition, so a scene where nothing moves still exists.
 * Only ever reached when there is no movement at all to pace.
 */
export const MIN_FLOW_STEP_MS = 200;

/** Where the ball is at rest in a scene — its carrier, or its stored position. */
function ballRest(scene: Scene): Vec2 | undefined {
  return scene.carrier ? scene.positions[scene.carrier] : scene.ballPos;
}

/**
 * Is there a ball in this scene at all?
 *
 * A board starts without one. Held or loose, the ball is something the author put
 * on the pitch; before that there is nothing to draw, nothing to hit-test and
 * nothing to animate. See D44.
 */
export function hasBall(scene: Scene): boolean {
  return scene.carrier !== null || scene.ballPos !== undefined;
}

/**
 * The furthest anything travels between two scenes, in metres.
 *
 * Straight-line, not arc length: this is called every frame, and a curved run
 * coming out a few per cent quick is invisible next to the cost of building an
 * arc table per entity per scene.
 */
function longestMove(from: Scene, to: Scene): number {
  let longest = 0;
  for (const id of Object.keys(to.positions)) {
    const a = from.positions[id];
    const b = to.positions[id];
    if (a && b) longest = Math.max(longest, Math.hypot(b.x - a.x, b.y - a.y));
  }
  // The ball can outrun everyone — a pass between two players standing still.
  const ballFrom = ballRest(from);
  const ballTo = ballRest(to);
  if (ballFrom && ballTo) {
    longest = Math.max(longest, Math.hypot(ballTo.x - ballFrom.x, ballTo.y - ballFrom.y));
  }
  return longest;
}

/**
 * The pace of the travel INTO scene `index`, in metres per second.
 *
 * A scene's own pace, or the board's where it has none. One place, so the
 * timeline and the panel showing the number cannot disagree — and so a document
 * written before per-scene pacing still resolves to the board pace everywhere.
 */
export function scenePace(doc: BoardDoc, index: number): number {
  const raw = doc.scenes[index]?.speed ?? doc.flow?.speed ?? DEFAULT_FLOW_SPEED;
  return Math.min(Math.max(raw, MIN_FLOW_SPEED), MAX_FLOW_SPEED);
}

export type SceneTiming = { travelMs: number; holdMs: number };

/**
 * What each scene is actually worth, in milliseconds.
 *
 * The single source of timing for the whole engine: duration, scrubbing and
 * scene starts all read this rather than the raw fields, so flow mode is decided
 * in one place instead of branching in four.
 *
 * Scene 0 never has a travel — there is nothing to travel from.
 */
export function sceneTimings(doc: BoardDoc): SceneTiming[] {
  const last = doc.scenes.length - 1;

  if (!doc.flow) {
    return doc.scenes.map((scene, i) => ({
      travelMs: i === 0 ? 0 : sceneTravelMs(scene),
      holdMs: scene.holdMs,
    }));
  }

  return doc.scenes.map((scene, i) => ({
    travelMs:
      i === 0
        ? 0
        : Math.max(
            MIN_FLOW_STEP_MS,
            (longestMove(doc.scenes[i - 1], scene) / scenePace(doc, i)) * 1000,
          ),
    // Nothing rests but the final frame, which is the pause before the loop.
    holdMs: i === last ? doc.flow!.endHoldMs : 0,
  }));
}

export function totalDurationMs(doc: BoardDoc): number {
  return sceneTimings(doc).reduce((total, t) => total + t.travelMs + t.holdMs, 0);
}

/**
 * Slack at a scene boundary, in milliseconds.
 *
 * Scene start times are handed out in seconds and come back as milliseconds, and
 * that round trip is not exact — in flow mode least of all, where a travel is a
 * distance divided by a speed. A time a billionth short of the end of a travel
 * is the end of that travel, and must resolve as the scene at rest: landing
 * `moving` instead swaps the editing overlay for every run arrow on the board
 * and makes positions interpolated rather than stored.
 */
const SEAM_MS = 1e-6;

export function resolveAt(doc: BoardDoc, tSeconds: number): Resolved {
  const scenes = doc.scenes;
  const last = scenes.length - 1;
  const timing = sceneTimings(doc);
  const total = timing.reduce((n, t) => n + t.travelMs + t.holdMs, 0);
  const ms = Math.min(Math.max(tSeconds * 1000, 0), total);

  const hold = (i: number): Resolved => ({ from: scenes[i], to: scenes[i], u: 1, moving: false, index: i });

  if (ms <= timing[0].holdMs || last === 0) return hold(0);

  let acc = timing[0].holdMs;
  for (let i = 1; i <= last; i++) {
    const travel = timing[i].travelMs;
    if (travel > 0 && ms < acc + travel - SEAM_MS) {
      return { from: scenes[i - 1], to: scenes[i], u: (ms - acc) / travel, moving: true, index: i };
    }
    acc += travel;
    if (ms <= acc + timing[i].holdMs) return hold(i);
    acc += timing[i].holdMs;
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
 * An entity holds at its start until its own delay is up, then runs at its own
 * pace and waits at its destination once it arrives.
 */
export function progressOf(entityId: string, r: Resolved, doc?: BoardDoc): number {
  // Flow mode sets the pace for the whole board, so a per-entity override would
  // be one player breaking step. Everyone shares the window and arrives together.
  if (doc?.flow) return r.u;

  const window = sceneTravelMs(r.to);
  const own = entityTravelMs(r.to, entityId);
  if (window <= 0 || own <= 0) return 1;

  const elapsed = r.u * window - entityDelayMs(r.to, entityId);
  if (elapsed <= 0) return 0;
  return Math.min(elapsed / own, 1);
}

export function positionAt(entityId: string, r: Resolved, doc: BoardDoc): Vec2 {
  const to = r.to.positions[entityId];
  if (!r.moving) return to ?? r.from.positions[entityId] ?? centre(doc);

  const from = r.from.positions[entityId];
  if (!from) return to ?? centre(doc);
  if (!to) return from;

  // Flow mode is deliberately unEASED. easeInOutCubic starts and ends at zero
  // velocity, so with holds removed every player would still stop dead at each
  // scene boundary and set off again — the stutter that makes scenes read as
  // cuts. Linear is what makes one movement out of many.
  const u = progressOf(entityId, r, doc);
  const eased = doc.flow ? u : easeInOutCubic(u);
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

  const glue = ballGlue(doc);
  return { x: at.x + dir.x * glue, y: at.y + dir.y * glue };
}

/** Height of a lofted ball at the top of its flight, in metres. */
export const LOFT_APEX = 7;
/**
 * How much bigger a lofted ball is drawn at that apex, on the flat board.
 *
 * Double. Height read from directly above is only ever an inference from size, so
 * the change has to be large enough to be unmistakable in a single frame — a ball
 * a tenth bigger is a ball you have to be told about.
 */
export const LOFT_GROWTH = 1.0;

/**
 * How far off the ground the ball is, 0 at the turf and 1 at the apex.
 *
 * A parabola over the ball's raw progress, NOT over the eased position: a struck
 * ball decelerates across the ground while its height still answers to gravity,
 * so easing the arc would have it hang at the far post. Zero unless the scene
 * being travelled into is marked lofted (D45).
 */
export function ballLift(r: Resolved, doc: BoardDoc): number {
  if (!r.moving || r.to.loft !== true) return 0;
  // The same progress the lofted ball crosses the ground at, so the apex falls at
  // the midpoint of the flight in space as well as in time.
  const u = progressOf(BALL_ID, r, doc);
  return 4 * u * (1 - u);
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
 *
 * `null` when the destination scene has no ball — before it is first given to
 * anyone there is nothing on the pitch to draw (D44).
 */
export function ballAt(r: Resolved, doc: BoardDoc): Vec2 | null {
  const fromCarrier = r.from.carrier;
  const toCarrier = r.to.carrier;

  if (!hasBall(r.to)) return null;

  // Held throughout, standing still, or arriving on the pitch for the first time:
  // all three put the ball where this scene says it is rather than travelling it
  // in from somewhere. A ball that did not exist a moment ago has nowhere to come
  // from, so it appears on its new holder rather than flying in off the centre spot.
  if ((toCarrier && fromCarrier === toCarrier) || !r.moving || !hasBall(r.from)) {
    return toCarrier ? gluedTo(toCarrier, r, doc) : (r.to.ballPos ?? null);
  }

  // Endpoints are sampled ONCE, not per frame: the release point at u=0 and the
  // meeting point at u=1. A ball is struck once and travels straight; the
  // receiver runs onto it. Re-reading the receiver's live position every frame
  // made the ball bend after them like a homing missile (BUG-1).
  //
  // Both are still resolved through positionAt, so the receiver's own path and
  // per-player travel time are respected — only the sampling instant is fixed.
  // Continuity holds because the receiver reaches that same point at u=1.
  const release: Resolved = { ...r, u: 0 };
  const arrival: Resolved = { ...r, u: 1 };
  // Both scenes hold a ball by here, so neither end can be missing.
  const start = fromCarrier ? gluedTo(fromCarrier, release, doc) : r.from.ballPos;
  const end = toCarrier ? gluedTo(toCarrier, arrival, doc) : r.to.ballPos;
  if (!start || !end) return end ?? start ?? null;

  // A pass along the ground is struck hard and decelerates; easing it in like a
  // jogging player looks wrong immediately. The ball honours its own travel
  // override too, and keeps this easing in flow mode: a struck ball really does
  // decelerate, and that is its motion rather than a seam between scenes.
  //
  // A LOFTED ball does not. What slows a ground pass is the turf, and a ball in
  // the air is not touching it — its horizontal speed is very nearly constant all
  // the way. Decelerating it instead lands it beside the receiver at the top of
  // its arc, where it hangs and then drops straight down (D45).
  const u = progressOf(BALL_ID, r, doc);
  const eased = r.to.loft === true ? u : easeOutQuad(u);
  const curve = r.to.ballPath;
  if (!curve) return lerpVec(start, end, eased);

  const b: Bezier = { p0: start, c1: curve.c1, c2: curve.c2, p1: end };
  return cubicAtDistance(b, eased, buildArcTable(b));
}

/** Resolved board state at an instant — everything the renderer needs. */
/** A halo, resolved at an instant: how bright, and what colour. */
export type Highlight = { strength: number; color: string };

/**
 * The glow on an entity at this instant, or null.
 *
 * INTERPOLATED, not switched. `Resolved.index` is the scene being travelled INTO,
 * so anything keyed off it alone appears the moment the transition starts — which
 * is right for a zone appearing and wrong for a glow, where it reads as a
 * rendering fault. Strength rides the same easing the positions do, so the halo
 * comes up as the player arrives and fades as they leave.
 *
 * During a hold `from` and `to` are the same scene and `u` is 1, so this collapses
 * to plain on-or-off with no special case.
 *
 * The colour is the destination's where there is one, because that is the state
 * being moved towards. Cross-fading two hues would spend the whole transition
 * showing a third colour that neither scene asked for.
 */
export function highlightAt(entityId: string, r: Resolved): Highlight | null {
  const before = r.from.highlight?.[entityId];
  const after = r.to.highlight?.[entityId];
  if (before === undefined && after === undefined) return null;

  const eased = easeInOutCubic(r.u);
  const strength = (before === undefined ? 0 : 1 - eased) + (after === undefined ? 0 : eased);
  if (strength <= 0) return null;

  return { strength, color: after ?? before ?? "" };
}

export type Frame = {
  positions: Record<string, Vec2>;
  /** `null` before the ball is first given to anyone — see D44. */
  ball: Vec2 | null;
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
