/**
 * Scene list operations. Every function returns a new document; none mutate.
 *
 * Paths live on the scene being travelled INTO, so deleting a scene takes its
 * paths with it and cannot orphan anything.
 */

import type { BoardDoc, PathCurve, Scene, Vec2 } from "./types";
import {
  MAX_FLOW_SPEED,
  MIN_FLOW_SPEED,
  ballAt,
  resolveAt,
  sceneTimings,
  totalDurationMs,
} from "./timeline";
import { pruneAnnotations } from "./annotations";
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
const replace = (doc: BoardDoc, scenes: Scene[]): BoardDoc => pruneShots({ ...doc, scenes });

/**
 * Clear `shot` wherever the ball does not travel into the scene.
 *
 * Scene 0 included: there is nothing for the ball to arrive from.
 */
export function pruneShots(doc: BoardDoc): BoardDoc {
  let changed = false;

  const scenes = doc.scenes.map((scene, i) => {
    if (scene.shot !== true || canShoot(doc, i)) return scene;
    changed = true;
    const next = { ...scene };
    delete next.shot;
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
export function addSceneAfter(doc: BoardDoc, index: number): BoardDoc {
  const base = doc.scenes[index];
  if (!base) return doc;

  const scene: Scene = {
    id: freshId(doc),
    name: `Scene ${doc.scenes.length + 1}`,
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
export function duplicateScene(doc: BoardDoc, index: number): BoardDoc {
  const base = doc.scenes[index];
  if (!base) return doc;

  const scene: Scene = {
    ...structuredClone(base),
    id: freshId(doc),
    name: `${base.name} copy`,
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
  // Annotations reference scenes by id, so one just deleted leaves a dangling
  // range. Pruning pulls it back rather than discarding the drawing.
  return pruneAnnotations(replace(doc, scenes));
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
 * Give the ball to a player, or set it loose.
 *
 * Releasing drops the ball where it currently is rather than at some default, so
 * clearing a carrier never makes the ball jump. `ballPos` must be present exactly
 * when there is no carrier, which the schema enforces.
 */
export function setCarrier(doc: BoardDoc, index: number, carrier: string | null): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene || scene.carrier === carrier) return doc;

  const scenes = doc.scenes.slice();
  if (carrier === null) {
    const at = ballAt(resolveAt(doc, sceneStartSeconds(doc, index)), doc);
    scenes[index] = { ...scene, carrier: null, ballPos: at };
  } else {
    // ballPos must be absent while a carrier holds the ball, so drop the key
    // rather than setting it undefined — the schema checks presence.
    const rest = { ...scene, carrier };
    delete rest.ballPos;
    scenes[index] = rest;
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
 * This is the single source for both the toggle's enabled state and pruneShots.
 * They were two rules once, and a shot flag outliving its shot is what that cost.
 */
export function canShoot(doc: BoardDoc, index: number): boolean {
  const to = doc.scenes[index];
  const from = doc.scenes[index - 1];
  return !!to && !!from && ballTravelBetween(doc, from, to) === "loose";
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

/** Set or clear the curve an entity travels along into scene `index`. */
export function setPath(
  doc: BoardDoc,
  index: number,
  entityId: string,
  curve: PathCurve | null,
): BoardDoc {
  const scene = doc.scenes[index];
  if (!scene) return doc;

  const paths = { ...scene.paths };
  if (curve) paths[entityId] = curve;
  else delete paths[entityId];

  const scenes = doc.scenes.slice();
  scenes[index] = { ...scene, paths };
  return replace(doc, scenes);
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
