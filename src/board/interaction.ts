/**
 * Hit-testing and editing operations, all in pitch metres.
 *
 * Hand-rolled rather than delegated to a canvas library — see D2 in
 * docs/decisions.md. For the ~25 objects a board holds, a distance check per
 * token is cheaper than a scene graph and keeps the renderer the only thing that
 * knows how the board looks.
 *
 * Every edit returns a new document. An edit never reaches backwards: dragging a
 * player cannot change a scene before the one addressed. It may reach FORWARD —
 * see `Carry`.
 */

import type { Annotation, BoardDoc, Link, PathCurve, Scene, Vec2 } from "./types";
import { BALL_ID } from "./types";
import { ballRadius, tokenRadius } from "./pitch";
import { displayCurve, transitionInto, type Frame, type Resolved } from "./timeline";
import { linkGeometry } from "./links";
import { ballCurve } from "./scenes";
import {
  MARK_WIDTH,
  annotationHandles,
  boundsOf,
  strokePoints,
  visibleAt,
  type AnnotationHandle,
} from "./annotations";
import { HANDLE_RADIUS, concealedPlayers } from "./render";
import { SAME_PLACE, clamp, distanceToSegment } from "./geometry";

export type HitTarget = { kind: "token" | "ball"; id: string } | null;

/** A bezier control point, addressed by the entity whose run it shapes. */
export type HandleHit = { id: string; which: "c1" | "c2" };

/**
 * Topmost control handle under `p`, or null.
 *
 * Handles are only drawn for selected entities on the scene being edited, so
 * hit-testing follows the same rule. They are tested BEFORE tokens: a handle can
 * overlap a token, and it is the smaller, more deliberate target.
 */
export function hitTestHandle(
  doc: BoardDoc,
  editScene: number,
  selection: ReadonlySet<string>,
  p: Vec2,
  margin = 0.3,
): HandleHit | null {
  const edit = transitionInto(doc, editScene);
  if (!edit) return null;

  for (const id of selection) {
    // The ball is derived, so it has no run to read a curve from — its line into
    // the scene is the pass, and that is where its handles are.
    const b = id === BALL_ID ? ballCurve(doc, edit) : displayCurve(id, edit);
    if (!b) continue;
    for (const which of ["c2", "c1"] as const) {
      if (dist(p, b[which]) <= HANDLE_RADIUS + margin) return { id, which };
    }
  }
  return null;
}

/**
 * Move one control point, materialising a real curve from the synthesised straight
 * one if this is the first time the run has been bent.
 */
export function dragHandle(
  doc: BoardDoc,
  editScene: number,
  hit: HandleHit,
  to: Vec2,
): PathCurve | null {
  const edit = transitionInto(doc, editScene);
  if (!edit) return null;
  const b = hit.id === BALL_ID ? ballCurve(doc, edit) : displayCurve(hit.id, edit);
  if (!b) return null;
  return hit.which === "c1" ? { c1: to, c2: b.c2 } : { c1: b.c1, c2: to };
}

/**
 * Topmost entity under `p`, or null.
 *
 * Walks the draw order in reverse: the ball renders above players, so it wins a
 * tie. A small grab margin makes tokens easier to catch than their visual radius.
 */
export function hitTest(doc: BoardDoc, frame: Frame, p: Vec2, margin = 0.25): HitTarget {
  if (frame.ball && dist(p, frame.ball) <= ballRadius(doc) + margin) {
    return { kind: "ball", id: BALL_ID };
  }

  const reach = tokenRadius(doc) + margin;

  for (const team of doc.teams) {
    if (team.hidden) continue;
    for (const player of team.players) {
      const pos = frame.positions[player.id];
      if (pos && dist(p, pos) <= reach) {
        return { kind: "token", id: player.id };
      }
    }
  }

  return null;
}

/**
 * Link whose connector passes under `p`, or null.
 *
 * Tested AFTER tokens: a connector runs beneath the players it joins, so clicking
 * a player must select the player, not the line through them.
 */
export function hitTestLink(
  doc: BoardDoc,
  r: Resolved,
  p: Vec2,
  threshold = 0.7,
): Link | null {
  const concealed = concealedPlayers(doc);
  for (let i = doc.links.length - 1; i >= 0; i--) {
    const link = doc.links[i];
    if (link.hidden) continue;
    if (link.members.every((m) => concealed.has(m))) continue;
    const g = linkGeometry(link, r, doc);
    if (!g) continue;
    for (const edge of g.edges) {
      if (distanceToSegment(p, edge.a, edge.b) <= threshold) return link;
    }
  }
  return null;
}

// ------------------------------------------------------------- annotations

/** Which layer of the stack an annotation was drawn in. */
export type AnnotationLayer = "mark" | "zone";

export const layerOf = (ann: Annotation): AnnotationLayer =>
  ann.kind === "rect" || ann.kind === "ellipse" ? "zone" : "mark";

export type AnnotationHandleHit = { id: string; which: AnnotationHandle["which"] };

/**
 * Grab point of the selected annotation under `p`, or null.
 *
 * Tested before the shape itself for the same reason run handles beat tokens:
 * a handle sits on top of what it edits, and is the smaller target.
 */
export function hitTestAnnotationHandle(
  doc: BoardDoc,
  sceneIndex: number,
  selected: string | null,
  p: Vec2,
  rotated = false,
  margin = 0.35,
): AnnotationHandleHit | null {
  if (!selected) return null;
  const ann = visibleAt(doc, sceneIndex).find((a) => a.id === selected);
  if (!ann) return null;

  for (const handle of annotationHandles(ann, rotated)) {
    if (dist(p, handle.at) <= HANDLE_RADIUS + margin) return { id: ann.id, which: handle.which };
  }
  return null;
}

/**
 * Topmost annotation of one layer under `p`, or null.
 *
 * Split by layer because annotations are split by layer when drawn: a zone lies
 * under the players and must lose a click to them, while an arrow lies over the
 * top and must win one. Walks each layer back to front, so the last drawn wins.
 */
export function hitTestAnnotation(
  doc: BoardDoc,
  sceneIndex: number,
  p: Vec2,
  layer: AnnotationLayer,
  rotated = false,
  margin = 0.35,
): Annotation | null {
  const list = visibleAt(doc, sceneIndex);
  for (let i = list.length - 1; i >= 0; i--) {
    const ann = list[i];
    if (layerOf(ann) !== layer) continue;
    if (annotationCovers(ann, p, margin, rotated)) return ann;
  }
  return null;
}

function annotationCovers(ann: Annotation, p: Vec2, margin: number, rotated: boolean): boolean {
  if (ann.kind === "rect" || ann.kind === "ellipse") {
    const { x, y, w, h } = boundsOf(ann);
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (ann.kind === "rect") {
      return Math.abs(p.x - cx) <= w / 2 + margin && Math.abs(p.y - cy) <= h / 2 + margin;
    }
    const rx = w / 2 + margin;
    const ry = h / 2 + margin;
    if (rx <= 0 || ry <= 0) return false;
    return ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 <= 1;
  }

  if (ann.kind === "text") {
    // The box the words are actually in, turned with the board. It used to be a
    // radius over the whole string, which grabbed empty grass under a short label
    // and was wildly wrong once a label could wrap: length stopped predicting
    // width the moment a second line existed.
    const { w, h } = boundsOf(ann, rotated);
    return Math.abs(p.x - ann.at.x) <= w / 2 + margin && Math.abs(p.y - ann.at.y) <= h / 2 + margin;
  }

  const points = strokePoints(ann);
  const reach = MARK_WIDTH / 2 + margin;
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(p, points[i - 1], points[i]) <= reach) return true;
  }
  return false;
}

/** Player ids whose token centre falls inside the rectangle spanned by `a` and `b`. */
export function entitiesInRect(doc: BoardDoc, frame: Frame, a: Vec2, b: Vec2): string[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);

  const hits: string[] = [];
  for (const team of doc.teams) {
    if (team.hidden) continue;
    for (const player of team.players) {
      const p = frame.positions[player.id];
      if (p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) hits.push(player.id);
    }
  }
  return hits;
}

/**
 * How far forward a positional edit carries.
 *
 * Every scene stores a position for every player, so an edit at scene 4 leaves
 * scenes 5 onwards holding the old one and the player snaps back the instant the
 * scene changes. Carrying the delta forward is what makes "I forgot to move him"
 * one drag rather than six.
 *
 * - `"scene"` — the addressed scene alone.
 * - `"stationary"` — and every following scene the entity does not TRAVEL INTO,
 *   stopping at the first run it already has. Those are exactly the scenes
 *   holding no intent of their own to disturb.
 *
 *   Each scene is judged against the one before it rather than against the scene
 *   being edited, which is what makes the boundary stable: inside a carried range
 *   every position shifts together, so a run that existed still exists and one
 *   that did not still does not. Measuring from the edited scene instead would
 *   let a second nudge in the same direction capture a scene the first stopped at.
 * - `"all"` — and every following scene, rigidly. Everything the entity does
 *   afterwards survives, translated.
 */
export type Carry = "scene" | "stationary" | "all";

/**
 * Translate entities by `delta`, clamped so a token cannot be dragged off the
 * surface. Ids with no position in this scene are ignored.
 *
 * A carried ball is derived from its carrier, so dragging it is a no-op — free it
 * first by clearing the carrier.
 */
export function moveEntities(
  doc: BoardDoc,
  sceneIndex: number,
  ids: Iterable<string>,
  delta: Vec2,
  carry: Carry = "scene",
): BoardDoc {
  const scene = doc.scenes[sceneIndex];
  if (!scene) return doc;

  const last = doc.scenes.length - 1;
  const idSet = new Set(ids);
  const bounds = { length: doc.pitch.length, width: doc.pitch.width };

  // Scene index -> entity -> the delta that actually landed there. What landed is
  // not always what was asked: a token against the touchline clamps, and the curve
  // controls have to follow what happened rather than what was requested.
  const shifts = new Map<number, Map<string, Vec2>>();

  const shift = (index: number, id: string, from: Vec2): void => {
    const to = clampToPitch(add(from, delta), bounds);
    let row = shifts.get(index);
    if (!row) shifts.set(index, (row = new Map()));
    row.set(id, { x: to.x - from.x, y: to.y - from.y });
  };

  for (const id of idSet) {
    if (id === BALL_ID) continue;
    const at = scene.positions[id];
    if (!at) continue;
    shift(sceneIndex, id, at);
    if (carry === "scene") continue;

    let prev = at;
    for (let k = sceneIndex + 1; k <= last; k++) {
      const there = doc.scenes[k].positions[id];
      if (!there) break;
      if (carry === "stationary" && dist(there, prev) > SAME_PLACE) break;
      shift(k, id, there);
      prev = there;
    }
  }

  if (idSet.has(BALL_ID) && scene.carrier === null && scene.ballPos) {
    const at = scene.ballPos;
    shift(sceneIndex, BALL_ID, at);

    if (carry !== "scene") {
      let prev = at;
      for (let k = sceneIndex + 1; k <= last; k++) {
        // A carried ball has no stored position to move, and nothing past it can
        // be reasoned about from here.
        const there = doc.scenes[k].carrier === null ? doc.scenes[k].ballPos : undefined;
        if (!there) break;
        if (carry === "stationary" && dist(there, prev) > SAME_PLACE) break;
        shift(k, BALL_ID, there);
        prev = there;
      }
    }
  }

  if (shifts.size === 0) return doc;

  /**
   * How far the ball's resting place in a scene moved.
   *
   * Its own shift when it is loose, its CARRIER'S when it is glued — a carried
   * ball has no stored position, so dragging the player holding it moves the ball
   * without anything in `shifts` ever naming the ball. The pass line into the next
   * scene is drawn from those resting places, so its controls follow them.
   */
  const ballShiftIn = (index: number): Vec2 | undefined => {
    const row = shifts.get(index);
    if (!row) return undefined;
    const carrier = doc.scenes[index]?.carrier;
    return carrier ? row.get(carrier) : row.get(BALL_ID);
  };

  // A scene's own paths need fixing when either end of a run moved, so the scene
  // after the last one carried is in play too even though nothing in it moves.
  const touched = new Set<number>();
  for (const k of shifts.keys()) {
    touched.add(k);
    if (k + 1 <= last) touched.add(k + 1);
  }

  const scenes = doc.scenes.slice();
  for (const k of touched) {
    const s = doc.scenes[k];
    const here = shifts.get(k);
    const before = k >= 1 ? shifts.get(k - 1) : undefined;
    const next: Scene = { ...s };
    let dirty = false;

    if (here) {
      const positions = { ...s.positions };
      for (const [id, d] of here) if (id !== BALL_ID) positions[id] = add(positions[id], d);
      next.positions = positions;
      const ball = here.get(BALL_ID);
      if (ball && s.ballPos) next.ballPos = add(s.ballPos, ball);
      dirty = true;
    }

    // Scene 0 has nothing travelling into it, so any curve on it describes
    // nothing and is left alone.
    if (k >= 1 && (here || before)) {
      const paths = { ...s.paths };
      let bent = false;
      for (const id of new Set([...(before?.keys() ?? []), ...(here?.keys() ?? [])])) {
        if (id === BALL_ID) continue;
        const moved = shiftCurve(paths[id], before?.get(id), here?.get(id));
        if (!moved || moved === paths[id]) continue;
        paths[id] = moved;
        bent = true;
      }
      if (bent) {
        next.paths = paths;
        dirty = true;
      }

      const ballPath = shiftCurve(s.ballPath, ballShiftIn(k - 1), ballShiftIn(k));
      if (ballPath && ballPath !== s.ballPath) {
        next.ballPath = ballPath;
        dirty = true;
      }
    }

    // Leaving an untouched scene identical keeps document identity meaningful —
    // anything memoising per scene reads it, and a fresh object for no change is
    // a redraw for no change.
    if (dirty) scenes[k] = next;
  }

  return { ...doc, scenes };
}

/**
 * A run's controls follow the endpoint each belongs to.
 *
 * `paths[id]` is the curve travelled INTO a scene, held in ABSOLUTE pitch
 * coordinates: `c1` sits near the start, `c2` near the end. Move an endpoint and
 * leave the controls and the run warps — a curve drawn to bend around someone
 * stops bending around them. Inside a carried range both ends move and the whole
 * curve translates; at the far edge of one only the start does, which is exactly
 * the tangent that should change.
 */
function shiftCurve(
  curve: PathCurve | null | undefined,
  atStart: Vec2 | undefined,
  atEnd: Vec2 | undefined,
): PathCurve | null | undefined {
  if (!curve || (!atStart && !atEnd)) return curve;
  return {
    c1: atStart ? add(curve.c1, atStart) : curve.c1,
    c2: atEnd ? add(curve.c2, atEnd) : curve.c2,
  };
}

/**
 * Shift a unit up- or downfield in one action — the most common edit when setting
 * up consecutive scenes, and painful one player at a time.
 */
export function nudgeEntities(
  doc: BoardDoc,
  sceneIndex: number,
  ids: Iterable<string>,
  metres: number,
  axis: "x" | "y" = "x",
  carry: Carry = "scene",
): BoardDoc {
  const delta = axis === "x" ? { x: metres, y: 0 } : { x: 0, y: metres };
  return moveEntities(doc, sceneIndex, ids, delta, carry);
}

/** Standard shift-click behaviour: toggle within a selection, or replace it. */
export function applySelection(
  current: ReadonlySet<string>,
  hit: HitTarget,
  additive: boolean,
): Set<string> {
  if (!hit) return additive ? new Set(current) : new Set();
  if (!additive) return new Set([hit.id]);

  const next = new Set(current);
  if (next.has(hit.id)) next.delete(hit.id);
  else next.add(hit.id);
  return next;
}

// ---------------------------------------------------------------- helpers

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

function clampToPitch(p: Vec2, bounds: { length: number; width: number }): Vec2 {
  return {
    x: clamp(p.x, 0, bounds.length),
    y: clamp(p.y, 0, bounds.width),
  };
}
