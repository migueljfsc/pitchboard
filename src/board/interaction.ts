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

import type { Annotation, BoardDoc, Link, PathCurve, PitchHalf, Scene, Vec2 } from "./types";
import { BALL_ID } from "./types";
import { PITCH, ballRadius, tokenRadius } from "./pitch";
import {
  LOFT_APEX,
  ballLift,
  displayCurve,
  transitionInto,
  type Frame,
  type Resolved,
} from "./timeline";
import { linkGeometry } from "./links";
import { ballCurve } from "./scenes";
import {
  MARK_WIDTH,
  TEXT_BG_PAD,
  annotationHandles,
  boundsOf,
  isStanding,
  strokePoints,
  textSize,
  visibleAt,
  type AnnotationHandle,
} from "./annotations";
import { HANDLE_RADIUS, concealedPlayers } from "./render";
import { SAME_PLACE, clamp, distanceToSegment, halfRange } from "./geometry";
import { projectPitch, unbillboard, unprojectPitch, type Camera } from "./projection";

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
  ann.kind === "rect" || ann.kind === "ellipse" || ann.kind === "polygon" ? "zone" : "mark";

/** `index` names the corner or the edge, for the handles that have one. */
export type AnnotationHandleHit = {
  id: string;
  which: AnnotationHandle["which"];
  index?: number;
};

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
    if (dist(p, handle.at) <= HANDLE_RADIUS + margin) {
      return {
        id: ann.id,
        which: handle.which,
        ...(handle.index !== undefined ? { index: handle.index } : {}),
      };
    }
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
  return topmostAnnotation(doc, sceneIndex, p, margin, rotated, (a) => layerOf(a) === layer);
}

/**
 * The same test, minus text — for the 3D view.
 *
 * Under the camera a label is a BILLBOARD and everything else in its layer lies on
 * the grass, so the two are hit-tested in different spaces and cannot share a pass.
 * Text goes through `hitTestTiltedText`; this is what is left.
 */
export function hitTestGroundAnnotation(
  doc: BoardDoc,
  sceneIndex: number,
  p: Vec2,
  layer: AnnotationLayer,
  margin = 0.35,
): Annotation | null {
  return topmostAnnotation(
    doc,
    sceneIndex,
    p,
    margin,
    false,
    (a) => layerOf(a) === layer && !isStanding(a),
  );
}

function topmostAnnotation(
  doc: BoardDoc,
  sceneIndex: number,
  p: Vec2,
  margin: number,
  rotated: boolean,
  accept: (ann: Annotation) => boolean,
): Annotation | null {
  const list = visibleAt(doc, sceneIndex);
  for (let i = list.length - 1; i >= 0; i--) {
    const ann = list[i];
    if (!accept(ann)) continue;
    if (annotationCovers(ann, p, margin, rotated, ballRadius(doc))) return ann;
  }
  return null;
}

function annotationCovers(
  ann: Annotation,
  p: Vec2,
  margin: number,
  rotated: boolean,
  ballR: number,
): boolean {
  if (ann.kind === "ball") return dist(p, ann.at) <= ballR + margin;

  if (ann.kind === "rect" || ann.kind === "ellipse") {
    const { x, y, w, h } = boundsOf(ann);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const within = (grow: number): boolean => {
      if (ann.kind === "rect") {
        return Math.abs(p.x - cx) <= w / 2 + grow && Math.abs(p.y - cy) <= h / 2 + grow;
      }
      const rx = w / 2 + grow;
      const ry = h / 2 + grow;
      if (rx <= 0 || ry <= 0) return false;
      return ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 <= 1;
    };
    const edge = MARK_WIDTH / 2 + margin;
    // An outline is grabbed by its line, so a click inside it reaches the pitch —
    // the players standing in a marked area, or a marquee started there.
    if (ann.filled === false) return within(edge) && !within(-edge);
    return within(margin);
  }

  if (ann.kind === "polygon") {
    const pts = ann.points;
    const edge = MARK_WIDTH / 2 + margin;
    let onEdge = false;
    for (let i = 0; i < pts.length; i++) {
      if (distanceToSegment(p, pts[i], pts[(i + 1) % pts.length]) <= edge) onEdge = true;
    }
    // An outline is grabbed by its line, as a box's is (D95).
    if (ann.filled === false) return onEdge;
    return onEdge || insidePolygon(p, pts);
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

/** Even-odd ray cast, so a polygon that crosses itself is inside where it is shaded. */
function insidePolygon(p: Vec2, pts: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// --------------------------------------------------------------- the 3D view
//
// Under the camera the board splits in two, and so does hit-testing.
//
// Anything lying on the GRASS — markings, zones, connectors, the sweep of a
// marquee — is tested by turning the pointer back into a place on the pitch
// (`unprojectPitch`) and handing it to the flat tests above, unchanged. The ground
// map inverts exactly, so those answers are exact.
//
// Anything STANDING — a token, the ball, a text label — is not on the grass at all.
// Its pixels are a billboard drawn at the projected ground point and scaled by
// depth, so it is tested in the space it was DRAWN in (`unbillboard`). That is what
// keeps the grab area the size it looks: a metre near the camera is many more
// pixels than a metre at the far touchline, which is the objection that kept the
// 3D view read-only, and it disappears the moment the target is the pixels (D48).
// A label's grab points are part of its billboard and are tested the same way (D91).

/** How near a click has to land, in metres of the billboard's own scale. */
const TILTED_MARGIN = 0.25;

/**
 * Topmost entity under a SCREEN point, or null.
 *
 * Nearest wins, because nearest is what covers the others: `drawBillboards` sorts
 * by projected y and draws in that order, so the largest y is on top. A lofted ball
 * is tested where it is drawn — up in the air — rather than at the shadow it is
 * sorted by.
 */
export function hitTestTilted(
  doc: BoardDoc,
  frame: Frame,
  screen: Vec2,
  cam: Camera,
  margin = TILTED_MARGIN,
): HitTarget {
  const hits: { hit: NonNullable<HitTarget>; depth: number }[] = [];

  const consider = (hit: NonNullable<HitTarget>, anchor: Vec2, reach: number, up: number) => {
    const at = projectPitch(anchor, cam, up);
    if (!Number.isFinite(at.scale) || at.scale <= 0) return;
    if (dist(unbillboard(screen, at, anchor), anchor) > reach) return;
    // Sorted by where it STANDS, exactly as the draw order is.
    hits.push({ hit, depth: up === 0 ? at.y : projectPitch(anchor, cam).y });
  };

  const reach = tokenRadius(doc) + margin;
  for (const team of doc.teams) {
    if (team.hidden) continue;
    for (const player of team.players) {
      const pos = frame.positions[player.id];
      if (pos) consider({ kind: "token", id: player.id }, pos, reach, 0);
    }
  }

  if (frame.ball) {
    const lift = ballLift(frame.resolved, doc);
    consider(
      { kind: "ball", id: BALL_ID },
      frame.ball,
      ballRadius(doc) + margin,
      lift > 0 ? LOFT_APEX * lift : 0,
    );
  }

  if (hits.length === 0) return null;
  return hits.reduce((a, b) => (b.depth >= a.depth ? b : a)).hit;
}

/**
 * Topmost STANDING annotation under a SCREEN point — a text label or a drawn
 * ball — or null.
 *
 * These are the annotations that stand up off the grass: squashed type is
 * unreadable and a squashed ball is a disc, so both are billboarded like a token.
 * Unbillboarding puts the pointer back into the shape's own metre space, where the
 * flat test applies unchanged; `rotated` is false in there, because a billboard's
 * axes are the screen's however the board is turned underneath.
 */
export function hitTestTiltedText(
  doc: BoardDoc,
  sceneIndex: number,
  screen: Vec2,
  cam: Camera,
  margin = TILTED_MARGIN,
): Annotation | null {
  const list = visibleAt(doc, sceneIndex);
  for (let i = list.length - 1; i >= 0; i--) {
    const ann = list[i];
    if (ann.kind !== "text" && ann.kind !== "ball") continue;
    const at = projectPitch(ann.at, cam);
    if (!Number.isFinite(at.scale) || at.scale <= 0) continue;
    const q = unbillboard(screen, at, ann.at);
    if (annotationCovers(ann, q, margin, false, ballRadius(doc))) return ann;
  }
  return null;
}

/**
 * Grab point of the selected label under a SCREEN point, or null — for the 3D view.
 *
 * A label's handles belong to its billboard, not to the grass: they are drawn inside
 * it, around the words, so they are tested in the same unbillboarded metre space the
 * words are (D91). Unrotated in there, like the words.
 */
export function hitTestTiltedTextHandle(
  doc: BoardDoc,
  sceneIndex: number,
  selected: string | null,
  screen: Vec2,
  cam: Camera,
  margin = TILTED_MARGIN,
): AnnotationHandleHit | null {
  const ann = tiltedText(doc, sceneIndex, selected);
  if (!ann) return null;
  const at = projectPitch(ann.at, cam);
  if (!Number.isFinite(at.scale) || at.scale <= 0) return null;
  return hitTestAnnotationHandle(
    doc,
    sceneIndex,
    selected,
    unbillboard(screen, at, ann.at),
    false,
    margin,
  );
}

/**
 * A screen point in the metre space of the selected label's billboard, or null.
 *
 * What a width drag under the camera hands to `dragAnnotationHandle`, unrotated —
 * the edge moves along the line of the words, which on a billboard is screen x.
 */
export function tiltedTextPoint(
  doc: BoardDoc,
  sceneIndex: number,
  id: string,
  screen: Vec2,
  cam: Camera,
): Vec2 | null {
  const ann = tiltedText(doc, sceneIndex, id);
  if (!ann) return null;
  const at = projectPitch(ann.at, cam);
  if (!Number.isFinite(at.scale) || at.scale <= 0) return null;
  return unbillboard(screen, at, ann.at);
}

const tiltedText = (doc: BoardDoc, sceneIndex: number, id: string | null) => {
  if (!id) return undefined;
  const ann = visibleAt(doc, sceneIndex).find((a) => a.id === id);
  return ann?.kind === "text" ? ann : undefined;
};

/** The place on the grass under a screen point. NaN above the horizon, where there is none. */
export const tiltedPitchPoint = (screen: Vec2, cam: Camera): Vec2 => unprojectPitch(screen, cam);

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
    const to = id === BALL_ID ? clampBall(add(from, delta), bounds) : clampToPitch(add(from, delta), bounds);
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
      // Moving a token is saying where he is, so he is no longer a place-holder there (D87).
      if (s.unseen?.some((id) => here.has(id))) {
        const unseen = s.unseen.filter((id) => !here.has(id));
        if (unseen.length === 0) delete next.unseen;
        else next.unseen = unseen;
      }
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

/**
 * Where the ball may be put: anywhere on the pitch, and into either net — behind the
 * goal line only between the posts, and no deeper than the goal. Once it is in, it
 * stays in: dragged sideways it runs along the net rather than jumping back onto the
 * line, which is where a shot finishing on the line used to leave it.
 */
export function clampBall(p: Vec2, bounds: { length: number; width: number }): Vec2 {
  const x = clamp(p.x, -PITCH.goalDepth, bounds.length + PITCH.goalDepth);
  const inNet = x < 0 || x > bounds.length;
  const half = PITCH.goalWidth / 2;
  const mid = bounds.width / 2;
  return {
    x,
    y: inNet ? clamp(p.y, mid - half, mid + half) : clamp(p.y, 0, bounds.width),
  };
}

// ------------------------------------------------------- arranging a selection

/** An axis of the pitch: `x` along its length, `y` across its width. */
export type PitchAxis = "x" | "y";

/**
 * Put every selected player on one line: the same `x` puts them level across the
 * pitch (a back four), the same `y` puts them in one channel. The line is where
 * they are on average, so nobody travels further than he has to. Carried forward
 * as a drag is.
 */
export function alignEntities(
  doc: BoardDoc,
  sceneIndex: number,
  ids: Iterable<string>,
  axis: PitchAxis,
  carry: Carry = "scene",
): BoardDoc {
  const scene = doc.scenes[sceneIndex];
  if (!scene) return doc;
  const list = [...ids].filter((id) => id !== BALL_ID && scene.positions[id]);
  if (list.length < 2) return doc;
  const line = list.reduce((sum, id) => sum + scene.positions[id][axis], 0) / list.length;
  let next = doc;
  for (const id of list) {
    const d = line - scene.positions[id][axis];
    const delta = axis === "x" ? { x: d, y: 0 } : { x: 0, y: d };
    next = moveEntities(next, sceneIndex, [id], delta, carry);
  }
  return next;
}

/**
 * Space the selected players evenly along one axis, between the two already
 * furthest apart — who is where in the line does not change, only the gaps.
 */
export function distributeEntities(
  doc: BoardDoc,
  sceneIndex: number,
  ids: Iterable<string>,
  axis: PitchAxis,
  carry: Carry = "scene",
): BoardDoc {
  const scene = doc.scenes[sceneIndex];
  if (!scene) return doc;
  const list = [...ids]
    .filter((id) => id !== BALL_ID && scene.positions[id])
    .sort((a, b) => scene.positions[a][axis] - scene.positions[b][axis]);
  if (list.length < 3) return doc;
  const first = scene.positions[list[0]][axis];
  const step = (scene.positions[list[list.length - 1]][axis] - first) / (list.length - 1);
  let next = doc;
  list.forEach((id, i) => {
    const d = first + i * step - scene.positions[id][axis];
    const delta = axis === "x" ? { x: d, y: 0 } : { x: 0, y: d };
    next = moveEntities(next, sceneIndex, [id], delta, carry);
  });
  return next;
}

// ------------------------------------------------------------------- snapping

/** How close, in metres, a dragged player has to come to another's line to take it. */
export const SNAP_M = 0.6;

/** A line a drag snapped to: a constant `x` (across the pitch) or a constant `y`. */
export type Guide = { x: number } | { y: number };

/**
 * Where a dragged player lands once he is drawn onto the lines of the others.
 *
 * Each axis on its own: level with a team-mate across the pitch, in the same
 * channel as another, or both. The guides are those lines, for the editor to draw
 * while the drag lasts. Nothing within `tolerance` leaves the point alone.
 */
export function snapPoint(
  p: Vec2,
  others: Iterable<Vec2>,
  tolerance = SNAP_M,
): { point: Vec2; guides: Guide[] } {
  let bestX: number | null = null;
  let bestY: number | null = null;
  const nearer = (to: number, v: number, best: number | null) =>
    Math.abs(v - to) <= tolerance && (best === null || Math.abs(v - to) < Math.abs(best - to));
  for (const o of others) {
    if (nearer(p.x, o.x, bestX)) bestX = o.x;
    if (nearer(p.y, o.y, bestY)) bestY = o.y;
  }
  const guides: Guide[] = [];
  if (bestX !== null) guides.push({ x: bestX });
  if (bestY !== null) guides.push({ y: bestY });
  return { point: { x: bestX ?? p.x, y: bestY ?? p.y }, guides };
}

type TextAnnotation = Extract<Annotation, { kind: "text" }>;

/**
 * A label's box as it is drawn: the words plus the panel's padding, which is where its
 * outline and its selection box sit. Pitch axes, turned with the board.
 */
function labelBox(ann: TextAnnotation, rotated: boolean): { x0: number; x1: number; y0: number; y1: number } {
  const { x, y, w, h } = boundsOf(ann, rotated);
  const m = textSize(ann) * TEXT_BG_PAD;
  return { x0: x - m, x1: x + w + m, y0: y - m, y1: y + h + m };
}

/**
 * The lines a dragged label is drawn onto: the pitch's own markings, and the centres and
 * edges of every other label on the scene.
 *
 * Markings along x are the goal lines, the halfway line, both boxes' edges and the penalty
 * spots; along y the touchlines, the middle, and both boxes' sides. The middle of the frame
 * is a line too: on a half view it is the middle of that half, which no marking is (D105).
 */
export function labelSnapLines(
  doc: BoardDoc,
  sceneIndex: number,
  except: string,
  rotated: boolean,
  half: PitchHalf = "full",
): { xs: number[]; ys: number[] } {
  const L = doc.pitch.length;
  const W = doc.pitch.width;
  const inset = [PITCH.sixYardDepth, PITCH.penaltySpot, PITCH.penaltyDepth];
  const [x0, x1] = halfRange(half, L);
  const xs = [0, L / 2, L, ...inset, ...inset.map((d) => L - d)];
  if (half !== "full") xs.push((x0 + x1) / 2);
  const ys = [
    0,
    W / 2,
    W,
    ...[PITCH.sixYardWidth, PITCH.penaltyWidth].flatMap((w) => [W / 2 - w / 2, W / 2 + w / 2]),
  ];
  for (const ann of visibleAt(doc, sceneIndex)) {
    if (ann.kind !== "text" || ann.id === except || !ann.text.trim()) continue;
    const b = labelBox(ann, rotated);
    xs.push(b.x0, ann.at.x, b.x1);
    ys.push(b.y0, ann.at.y, b.y1);
  }
  return { xs, ys };
}

/**
 * Where a dragged label lands once its centre or an edge is drawn onto a line.
 *
 * Each axis on its own, like `snapPoint`: of the label's left edge, centre and right edge,
 * whichever is nearest a line within `tolerance` takes it, and the whole box moves with it.
 * The guide is the line taken, so the editor can draw it across the pitch while it holds.
 */
export function snapLabel(
  doc: BoardDoc,
  sceneIndex: number,
  ann: TextAnnotation,
  at: Vec2,
  rotated: boolean,
  half: PitchHalf = "full",
  tolerance = SNAP_M,
): { at: Vec2; guides: Guide[] } {
  const { xs, ys } = labelSnapLines(doc, sceneIndex, ann.id, rotated, half);
  const b = labelBox({ ...ann, at }, rotated);
  const best = (features: number[], lines: number[]) => {
    let hit: { shift: number; line: number } | null = null;
    for (const f of features) {
      for (const line of lines) {
        const shift = line - f;
        if (Math.abs(shift) <= tolerance && (hit === null || Math.abs(shift) < Math.abs(hit.shift))) {
          hit = { shift, line };
        }
      }
    }
    return hit;
  };
  const x = best([b.x0, at.x, b.x1], xs);
  const y = best([b.y0, at.y, b.y1], ys);
  const guides: Guide[] = [];
  if (x) guides.push({ x: x.line });
  if (y) guides.push({ y: y.line });
  return { at: { x: at.x + (x?.shift ?? 0), y: at.y + (y?.shift ?? 0) }, guides };
}

// ------------------------------------------------------------------- swapping

/**
 * The other player a dragged one has been dropped onto, if any: another token
 * whose centre is within half a token of where he landed.
 */
export function swapTarget(doc: BoardDoc, sceneIndex: number, id: string, at: Vec2): string | null {
  const scene = doc.scenes[sceneIndex];
  if (!scene) return null;
  const reach = tokenRadius(doc) * 0.5;
  let best: string | null = null;
  let bestD = Infinity;
  for (const team of doc.teams) {
    if (team.hidden) continue;
    for (const player of team.players) {
      if (player.id === id) continue;
      const p = scene.positions[player.id];
      if (!p) continue;
      const d = dist(p, at);
      if (d <= reach && d < bestD) {
        best = player.id;
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * Swap two players' places in a scene: `a`, who was dragged and now stands on `b`,
 * takes `b`'s place exactly, and `b` goes to where `a` started. Carried forward as
 * a drag is.
 */
export function swapPlayers(
  doc: BoardDoc,
  sceneIndex: number,
  a: string,
  b: string,
  aStarted: Vec2,
  carry: Carry = "scene",
): BoardDoc {
  const scene = doc.scenes[sceneIndex];
  const pa = scene?.positions[a];
  const pb = scene?.positions[b];
  if (!pa || !pb) return doc;
  let next = moveEntities(doc, sceneIndex, [b], { x: aStarted.x - pb.x, y: aStarted.y - pb.y }, carry);
  next = moveEntities(next, sceneIndex, [a], { x: pb.x - pa.x, y: pb.y - pa.y }, carry);
  return next;
}

/**
 * The axis a group of players is spread along — the one with the larger span.
 * A back four across the pitch is spread along `y`; a striker and the runners
 * behind him, along `x`.
 */
export function spreadAxis(doc: BoardDoc, sceneIndex: number, ids: Iterable<string>): PitchAxis {
  const scene = doc.scenes[sceneIndex];
  const points = [...ids].map((id) => scene?.positions[id]).filter((p): p is Vec2 => !!p);
  const range = (axis: PitchAxis) =>
    points.length ? Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis])) : 0;
  return range("x") >= range("y") ? "x" : "y";
}

/**
 * Straighten a group into a line along the way it is already spread: only the
 * other coordinate is evened out, so nobody is pulled onto anybody else. Asking
 * for a fixed direction instead stacked a line that ran the other way onto one
 * spot.
 */
export function lineUp(
  doc: BoardDoc,
  sceneIndex: number,
  ids: Iterable<string>,
  carry: Carry = "scene",
): BoardDoc {
  const list = [...ids];
  const along = spreadAxis(doc, sceneIndex, list);
  return alignEntities(doc, sceneIndex, list, along === "x" ? "y" : "x", carry);
}

/** Even out the gaps along the way a group is already spread. */
export function spaceEvenly(
  doc: BoardDoc,
  sceneIndex: number,
  ids: Iterable<string>,
  carry: Carry = "scene",
): BoardDoc {
  const list = [...ids];
  return distributeEntities(doc, sceneIndex, list, spreadAxis(doc, sceneIndex, list), carry);
}
