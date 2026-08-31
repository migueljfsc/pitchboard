/**
 * Scene list operations. Every function returns a new document; none mutate.
 *
 * Paths live on the scene being travelled INTO, so deleting a scene takes its
 * paths with it and cannot orphan anything.
 */

import type { BoardDoc, PathCurve, Scene, Vec2 } from "./types";
import { BALL_ID } from "./types";
import {
  MAX_FLOW_SPEED,
  MIN_FLOW_SPEED,
  ballAt,
  hasBall,
  resolveAt,
  type Resolved,
  sceneTimings,
  totalDurationMs,
} from "./timeline";
import { pruneAnnotations, straightCurve } from "./annotations";
import { pruneLinkRanges } from "./links";
import { SAME_PLACE, distance, type Bezier } from "./geometry";
import type { Carry } from "./interaction";
import { teamOf } from "./players";

export const DEFAULT_TRANSITION_MS = 1500;
export const DEFAULT_HOLD_MS = 800;

/**
 * Swap the scene list in, and keep `shot` honest.
 *
 * `shot` describes the ball's travel INTO a scene, so it means nothing on a
 * scene the ball does not travel into. Almost every scene edit can change that,
 * and rarely obviously: setting a carrier changes the travel into that scene AND
 * into the one after it, and deleting or reordering a scene changes it for a
 * neighbour. Enforcing it at the one point they all pass through is what stops a
 * flag going stale — otherwise a scene with nothing arriving still reads "shot"
 * in the strip, still shows the toggle lit while disabled, and quietly becomes a
 * shot again the moment the ball is released.
 */
const replace = (doc: BoardDoc, scenes: Scene[]): BoardDoc => pruneBallFlags({ ...doc, scenes });

/**
 * Clear `shot` and `loft` wherever the travel they describe no longer exists.
 *
 * Scene 0 included: there is nothing for the ball to arrive from. The two flags
 * have different gates — a shot needs a LOOSE travel, a loft needs only that the
 * ball leaves someone's feet — so each is asked its own question.
 */
export function pruneBallFlags(doc: BoardDoc): BoardDoc {
  let changed = false;

  const scenes = doc.scenes.map((scene, i) => {
    const dropShot = scene.shot === true && !canShoot(doc, i);
    const dropLoft = scene.loft === true && !canLoft(doc, i);
    if (!dropShot && !dropLoft) return scene;

    changed = true;
    const next = { ...scene };
    if (dropShot) delete next.shot;
    if (dropLoft) delete next.loft;
    return next;
  });

  return changed ? { ...doc, scenes } : doc;
}

/**
 * Seconds at which scene `index` comes to rest — where the scrubber should sit.
 *
 * Reads the timing table rather than the raw fields, so it lands in the right
 * place in flow mode too.
 */
export function sceneStartSeconds(doc: BoardDoc, index: number): number {
  const timing = sceneTimings(doc);
  let ms = 0;
  for (let i = 1; i <= Math.min(index, doc.scenes.length - 1); i++) {
    ms += timing[i - 1].holdMs + timing[i].travelMs;
  }
  return ms / 1000;
}

export function totalSeconds(doc: BoardDoc): number {
  return totalDurationMs(doc) / 1000;
}

function freshId(doc: BoardDoc): string {
  let n = doc.scenes.length + 1;
  const taken = new Set(doc.scenes.map((s) => s.id));
  while (taken.has(`scene-${n}`)) n++;
  return `scene-${n}`;
}

/**
 * Insert a scene after `index`, starting from that scene's positions.
 *
 * Paths are cleared: the new scene is where the previous one already was, so any
 * inherited curve would describe a journey of zero length.
 */
/** `name` lets the caller name the scene in the reader’s language; the English
 *  fallback keeps the engine usable, and testable, without one. */
export function addSceneAfter(doc: BoardDoc, index: number, name?: string): BoardDoc {
  const base = doc.scenes[index];
  if (!base) return doc;

  const scene: Scene = {
    id: freshId(doc),
    name: name ?? `Scene ${doc.scenes.length + 1}`,
    transitionMs: DEFAULT_TRANSITION_MS,
    holdMs: DEFAULT_HOLD_MS,
    positions: { ...base.positions },
    paths: {},
    carrier: base.carrier,
    ballPos: base.ballPos ? { ...base.ballPos } : undefined,
    ballPath: null,
    // Carry the pace forward: a scene added while working at 20 m/s should
    // travel at 20 m/s, not snap back to the board's default.
    ...(base.speed !== undefined ? { speed: base.speed } : {}),
  };

  const scenes = doc.scenes.slice();
  scenes.splice(index + 1, 0, scene);
  return replace(doc, scenes);
}

/** Copy a scene wholesale, paths included — useful for a repeated movement. */
export function duplicateScene(doc: BoardDoc, index: number, name?: string): BoardDoc {
  const base = doc.scenes[index];
  if (!base) return doc;

  const scene: Scene = {
    ...structuredClone(base),
    id: freshId(doc),
    name: name ?? `${base.name} copy`,
    transitionMs: base.transitionMs || DEFAULT_TRANSITION_MS,
  };

  const scenes = doc.scenes.slice();
  scenes.splice(index + 1, 0, scene);
  return replace(doc, scenes);
}

/** Remove a scene. The last remaining scene cannot be deleted. */
export function deleteScene(doc: BoardDoc, index: number): BoardDoc {
  if (doc.scenes.length <= 1 || !doc.scenes[index]) return doc;
  const scenes = doc.scenes.filter((_, i) => i !== index);
  // Annotations and links both reference scenes by id, so one just deleted leaves
  // a dangling range on either. Pruning pulls it back rather than discarding the
  // drawing or the unit.
  return pruneLinkRanges(pruneAnnotations(replace(doc, scenes)));
}

export function moveScene(doc: BoardDoc, from: number, to: number): BoardDoc {
  const n = doc.scenes.length;
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return doc;
  const scenes = doc.scenes.slice();
  const [moved] = scenes.splice(from, 1);
  scenes.splice(to, 0, moved);
  return replace(doc, scenes);
}

export function setSceneTiming(
  doc: BoardDoc,
  index: number,
  timing: Partial<Pick<Scene, "transitionMs" | "holdMs">>,
): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene) return doc;
  const clampMs = (v: number) => Math.max(0, Math.min(60_000, Math.round(v)));
  const scenes = doc.scenes.slice();
  scenes[index] = {
    ...scene,
    transitionMs: timing.transitionMs === undefined ? scene.transitionMs : clampMs(timing.transitionMs),
    holdMs: timing.holdMs === undefined ? scene.holdMs : clampMs(timing.holdMs),
  };
  return replace(doc, scenes);
}

export function renameScene(doc: BoardDoc, index: number, name: string): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene) return doc;
  const scenes = doc.scenes.slice();
  scenes[index] = { ...scene, name };
  return replace(doc, scenes);
}

/**
 * Did anything happen to the ball between these two scenes?
 *
 * The same question the drag carry asks of a player, asked of a discrete state
 * rather than a position: the same holder is nobody deciding anything, and so is
 * a loose ball nobody moved. A different holder is a pass, and a ball put down
 * somewhere else is a pass to a space — both are decisions, and both stop a carry.
 *
 * A player running with the ball moves it, but that is the player's edit, not the
 * ball's: no handover happened in that scene, so it is one the carry may pass
 * through.
 */
function sameBall(scene: Scene, before: Scene): boolean {
  if (scene.carrier !== before.carrier) return false;
  if (scene.carrier !== null) return true;
  const here = scene.ballPos;
  const there = before.ballPos;
  // No ball in either is the commonest case of nothing happening: it is what
  // every scene looks like before the ball is first given out (D44).
  if (here === undefined && there === undefined) return true;
  return here !== undefined && there !== undefined && distance(here, there) <= SAME_PLACE;
}

/**
 * Give the ball to a player, or set it loose.
 *
 * Releasing drops the ball where it currently is rather than at some default, so
 * clearing a carrier never makes the ball jump. `ballPos` must be present exactly
 * when there is no carrier, which the schema enforces.
 *
 * `carry` reaches the handover forward through the following scenes nobody meant
 * anything by — the same bargain a drag makes (D41), and for the same reason. A
 * board is built by adding scenes and then deciding what happens in them, so the
 * scenes after the one being edited are usually still the kick-off the board was
 * seeded with. Handing the ball over in scene 2 and leaving scenes 3 onward at the
 * centre spot does not mean "the ball returns to the centre"; it means nobody has
 * said anything about them yet, and the ball snapping back is the answer to a
 * question that was never asked.
 *
 * `"all"` reaches exactly as far as `"stationary"` here. There is no rigid
 * translation of a handover to preserve what the later scenes do — carrying past a
 * pass could only overwrite it — so the modes collapse to the two answers the
 * question actually has: this scene, or onward until something happens.
 */
export function setCarrier(
  doc: BoardDoc,
  index: number,
  carrier: string | null,
  carry: Carry = "scene",
): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene || scene.carrier === carrier) return doc;

  // Read before anything moves, and reused for every scene the release carries
  // into: a ball put down stays where it was put rather than following the player
  // who was holding it in each later scene.
  const held = scene.carrier;
  const dropped =
    carrier === null && held
      ? (ballAt(resolveAt(doc, sceneStartSeconds(doc, index)), doc) ?? scene.positions[held])
      : null;

  const scenes = doc.scenes.slice();
  const hand = (i: number): void => {
    if (dropped) {
      scenes[i] = { ...scenes[i], carrier: null, ballPos: dropped };
      return;
    }
    // A carrier derives the ball's position, so a scene never holds both. Drop
    // the key rather than setting it undefined, to keep the document clean.
    const rest = { ...scenes[i], carrier };
    delete rest.ballPos;
    scenes[i] = rest;
  };

  hand(index);
  if (carry !== "scene") {
    // Each scene judged against the one BEFORE it, in the document as it was, so
    // the boundary does not move as the carry writes through it.
    for (let k = index + 1; k < doc.scenes.length; k++) {
      if (!sameBall(doc.scenes[k], doc.scenes[k - 1])) break;
      hand(k);
    }
  }
  return replace(doc, scenes);
}

/**
 * Give an entity its own travel time into scene `index`, or `null` to fall back
 * to the scene's. Clamped to the same range as a scene duration.
 */
export function setTravel(
  doc: BoardDoc,
  index: number,
  entityId: string,
  ms: number | null,
): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene) return doc;

  const travel = { ...(scene.travel ?? {}) };
  if (ms === null) delete travel[entityId];
  else travel[entityId] = Math.max(0, Math.min(60_000, Math.round(ms)));

  // Drop the key entirely once empty, so a scene with no overrides serialises
  // exactly as it did before the field existed.
  const next: Scene = { ...scene };
  if (Object.keys(travel).length === 0) delete next.travel;
  else next.travel = travel;

  const scenes = doc.scenes.slice();
  scenes[index] = next;
  return replace(doc, scenes);
}

/**
 * Make an entity wait before setting off into scene `index`, or `null` to leave
 * with everyone else.
 *
 * This is what lets one scene carry a sequence — the winger goes, the full-back
 * overlaps behind them — rather than splitting into two scenes whose only job is
 * to put one before the other. See D41.
 */
export function setDelay(
  doc: BoardDoc,
  index: number,
  entityId: string,
  ms: number | null,
): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene) return doc;

  const delay = { ...(scene.delay ?? {}) };
  if (ms === null || ms <= 0) delete delay[entityId];
  else delay[entityId] = Math.max(0, Math.min(60_000, Math.round(ms)));

  // Drop the key entirely once empty, so a scene with no waits serialises exactly
  // as it did before the field existed.
  const next: Scene = { ...scene };
  if (Object.keys(delay).length === 0) delete next.delay;
  else next.delay = delay;

  const scenes = doc.scenes.slice();
  scenes[index] = next;
  return replace(doc, scenes);
}

/**
 * Show or hide the arrow drawn for an entity's run into scene `index`.
 *
 * Per scene and per entity, because a run that needs explaining in one scene is
 * clutter in the next. Movement is unaffected — this hides the indicator only.
 * `BALL_ID` suppresses the pass line.
 */
export function setRunHidden(
  doc: BoardDoc,
  index: number,
  entityId: string,
  hidden: boolean,
): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene) return doc;

  const current = scene.hiddenRuns ?? [];
  if (current.includes(entityId) === hidden) return doc;
  const list = hidden ? [...current, entityId] : current.filter((id) => id !== entityId);

  // Drop the key once empty, so a scene with nothing hidden serialises exactly
  // as it did before the field existed.
  const next: Scene = { ...scene };
  if (list.length === 0) delete next.hiddenRuns;
  else next.hiddenRuns = list;

  const scenes = doc.scenes.slice();
  scenes[index] = next;
  return replace(doc, scenes);
}

export function isRunHidden(scene: Scene | undefined, entityId: string): boolean {
  return scene?.hiddenRuns?.includes(entityId) ?? false;
}

/**
 * Glow a group of entities in scene `index`, or stop glowing them.
 *
 * Takes the whole selection rather than one id, because that is the gesture: the
 * two players who matter here are picked together and lit together. A `color` of
 * null clears them.
 *
 * NEVER CARRIES FORWARD, unlike a drag or a nudge (D41). A position is a fact that
 * stands until something changes it; attention is about one moment, and copying it
 * into the following scenes would say something the coach did not (D47).
 */
export function setHighlight(
  doc: BoardDoc,
  index: number,
  entityIds: Iterable<string>,
  color: string | null,
): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene) return doc;

  const ids = [...entityIds];
  if (ids.length === 0) return doc;

  const current = scene.highlight ?? {};
  const highlight = { ...current };
  for (const id of ids) {
    if (color === null) delete highlight[id];
    else highlight[id] = color;
  }

  const keys = Object.keys(highlight);
  const same =
    keys.length === Object.keys(current).length && keys.every((k) => current[k] === highlight[k]);
  if (same) return doc;

  // Drop the key once empty, so a scene with nothing lit serialises exactly as it
  // did before the field existed.
  const next: Scene = { ...scene };
  if (keys.length === 0) delete next.highlight;
  else next.highlight = highlight;

  const scenes = doc.scenes.slice();
  scenes[index] = next;
  return replace(doc, scenes);
}

export function isHighlighted(scene: Scene | undefined, entityId: string): boolean {
  return scene?.highlight?.[entityId] !== undefined;
}

/** The halo colour set for an entity on a scene, or null where it is not lit. */
export function highlightOf(scene: Scene | undefined, entityId: string): string | null {
  return scene?.highlight?.[entityId] ?? null;
}

/**
 * How the ball gets from one scene to the next.
 *
 * `none` covers the case that is easy to get wrong: the same player carries it
 * throughout. The ball is glued to them, so it moves — a long way, if they run
 * — but that movement is theirs. A dribble is not a pass and must not be drawn
 * as one.
 *
 * `pass` is reserved for a change of hands between team-mates, which is what
 * the dashed convention means. Everything else that genuinely travels — a
 * turnover, a release, a ball collected off the floor, a shot — is `loose`.
 */
export type BallTravel = "none" | "pass" | "loose";

export function ballTravelBetween(doc: BoardDoc, from: Scene, to: Scene): BallTravel {
  // A ball arriving on the pitch, or leaving it, has not travelled anywhere.
  if (!hasBall(from) || !hasBall(to)) return "none";
  if (from.carrier === to.carrier) {
    if (from.carrier !== null) return "none";
    const a = from.ballPos;
    const b = to.ballPos;
    return a && b && (a.x !== b.x || a.y !== b.y) ? "loose" : "none";
  }

  if (from.carrier && to.carrier) {
    const passer = teamOf(doc, from.carrier);
    const receiver = teamOf(doc, to.carrier);
    return passer && receiver && passer.id === receiver.id ? "pass" : "loose";
  }
  return "loose";
}

/**
 * Can the ball's arrival into this scene be a strike?
 *
 * Only a LOOSE travel qualifies — the ball leaving someone and ending on the
 * turf, in the net, or at an opponent's feet, a keeper's save included. A change
 * of hands between team-mates is a pass by definition (D24) and is drawn dashed,
 * so it is the one thing a shot is not; a ball that never leaves its carrier has
 * no travel to mark at all.
 *
 * This is the single source for both the toggle's enabled state and pruneBallFlags.
 * They were two rules once, and a shot flag outliving its shot is what that cost.
 */
export function canShoot(doc: BoardDoc, index: number): boolean {
  const to = doc.scenes[index];
  const from = doc.scenes[index - 1];
  return !!to && !!from && ballTravelBetween(doc, from, to) === "loose";
}

/**
 * Can the ball's arrival into this scene be lofted?
 *
 * Any travel qualifies, pass or loose: a cross, a chip and a clearance are all
 * balls that leave the ground. Only a dribble is excluded, and it is excluded for
 * the reason it has no line either — the ball never left anyone's feet.
 */
export function canLoft(doc: BoardDoc, index: number): boolean {
  const to = doc.scenes[index];
  const from = doc.scenes[index - 1];
  return !!to && !!from && ballTravelBetween(doc, from, to) !== "none";
}

/** Mark the ball's travel into scene `index` as a strike at goal. */
/**
 * Pace for the travel into scene `index`, in metres per second, or `null` to go
 * back to the board's.
 *
 * Flow mode only. Scene 0 has nothing travelling into it, so it takes no pace —
 * the panel hides the field there, the same way it hides Travel.
 */
export function setScenePace(doc: BoardDoc, index: number, speed: number | null): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene || index === 0) return doc;

  const next: Scene = { ...scene };
  if (speed === null) delete next.speed;
  else next.speed = Math.min(Math.max(speed, MIN_FLOW_SPEED), MAX_FLOW_SPEED);

  if ((next.speed ?? null) === (scene.speed ?? null)) return doc;

  const scenes = doc.scenes.slice();
  scenes[index] = next;
  return replace(doc, scenes);
}

export function setShot(doc: BoardDoc, index: number, shot: boolean): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene || (scene.shot ?? false) === shot) return doc;

  const next: Scene = { ...scene };
  if (shot) next.shot = true;
  else delete next.shot;

  const scenes = doc.scenes.slice();
  scenes[index] = next;
  return replace(doc, scenes);
}

/** Lift the ball's travel into scene `index` off the ground, or put it back. */
export function setLoft(doc: BoardDoc, index: number, loft: boolean): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene || (scene.loft ?? false) === loft) return doc;

  const next: Scene = { ...scene };
  if (loft) next.loft = true;
  else delete next.loft;

  const scenes = doc.scenes.slice();
  scenes[index] = next;
  return replace(doc, scenes);
}

/** Set or clear the curve an entity travels along into scene `index`. */
export function setPath(
  doc: BoardDoc,
  index: number,
  entityId: string,
  curve: PathCurve | null,
): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene) return doc;

  const scenes = doc.scenes.slice();
  // The ball's curve lives in its own field, because the ball has no entry in
  // `positions` to key one off — it is derived from its carrier (D4). Routing it
  // here rather than at the call sites is what keeps "straighten" and "bend"
  // agreeing about where a ball's curve is kept.
  if (entityId === BALL_ID) {
    scenes[index] = { ...scene, ballPath: curve };
    return replace(doc, scenes);
  }

  const paths = { ...scene.paths };
  if (curve) paths[entityId] = curve;
  else delete paths[entityId];

  scenes[index] = { ...scene, paths };
  return replace(doc, scenes);
}

/** The stored curve for an entity travelling into `scene`, if it has been bent. */
export function pathOf(scene: Scene, entityId: string): PathCurve | null | undefined {
  return entityId === BALL_ID ? scene.ballPath : scene.paths[entityId];
}

/** Below this the ball has barely moved, and a line would be noise. */
export const MIN_BALL_TRAVEL = 1.5;

/**
 * The ball's line into a scene, as a bezier.
 *
 * The one definition of that curve, shared by the renderer that draws it and the
 * hit-test that lets you bend it — endpoints sampled from `ballAt` at both ends of
 * the travel, so carrier glue and travel overrides are included rather than
 * reimplemented. Null when there is no line: a dribble carries the ball rather
 * than playing it, and a ball that barely moves has nothing worth drawing.
 */
export function ballCurve(doc: BoardDoc, r: Resolved): Bezier | null {
  if (ballTravelBetween(doc, r.from, r.to) === "none") return null;

  const p0 = ballAt({ ...r, u: 0 }, doc);
  const p1 = ballAt({ ...r, u: 1 }, doc);
  if (!p0 || !p1 || distance(p0, p1) < MIN_BALL_TRAVEL) return null;

  const curve = r.to.ballPath ?? straightCurve(p0, p1);
  return { p0, c1: curve.c1, c2: curve.c2, p1 };
}

/**
 * Control points for a gentle arc between two points, used as the starting shape
 * when a run is first curved. Bowed perpendicular to the straight line.
 */
export function defaultCurve(from: Vec2, to: Vec2, bow = 0.22): PathCurve {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const nx = -dy * bow;
  const ny = dx * bow;
  return {
    c1: { x: from.x + dx / 3 + nx, y: from.y + dy / 3 + ny },
    c2: { x: from.x + (dx * 2) / 3 + nx, y: from.y + (dy * 2) / 3 + ny },
  };
}
