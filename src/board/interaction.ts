/**
 * Hit-testing and editing operations, all in pitch metres.
 *
 * Hand-rolled rather than delegated to a canvas library — see D2 in
 * docs/decisions.md. For the ~25 objects a board holds, a distance check per
 * token is cheaper than a scene graph and keeps the renderer the only thing that
 * knows how the board looks.
 *
 * Every edit returns a new document. Editing only ever touches the current scene;
 * dragging a player never retroactively changes an earlier one.
 */

import type { Annotation, BoardDoc, Link, PathCurve, Scene, Vec2 } from "./types";
import { BALL_ID } from "./types";
import { ballRadius, tokenRadius } from "./pitch";
import { displayCurve, transitionInto, type Frame, type Resolved } from "./timeline";
import { linkGeometry } from "./links";
import {
  MARK_WIDTH,
  TEXT_SIZE,
  annotationHandles,
  boundsOf,
  strokePoints,
  visibleAt,
  type AnnotationHandle,
} from "./annotations";
import { HANDLE_RADIUS, concealedPlayers } from "./render";
import { clamp, distanceToSegment } from "./geometry";

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
    const b = displayCurve(id, edit);
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
  const b = displayCurve(hit.id, edit);
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
  if (dist(p, frame.ball) <= ballRadius(doc) + margin) {
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
  margin = 0.35,
): AnnotationHandleHit | null {
  if (!selected) return null;
  const ann = visibleAt(doc, sceneIndex).find((a) => a.id === selected);
  if (!ann) return null;

  for (const handle of annotationHandles(ann)) {
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
  margin = 0.35,
): Annotation | null {
  const list = visibleAt(doc, sceneIndex);
  for (let i = list.length - 1; i >= 0; i--) {
    const ann = list[i];
    if (layerOf(ann) !== layer) continue;
    if (annotationCovers(ann, p, margin)) return ann;
  }
  return null;
}

function annotationCovers(ann: Annotation, p: Vec2, margin: number): boolean {
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
    // Text is drawn upright, so its box is not axis-aligned on a rotated board
    // and a rectangle in pitch space would be wrong there. A radius covering the
    // longer side is orientation-independent and over-grabs only the corners.
    const reach = Math.max(TEXT_SIZE * 0.7, ann.text.length * TEXT_SIZE * 0.3);
    return dist(p, ann.at) <= reach + margin;
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
): BoardDoc {
  const scene = doc.scenes[sceneIndex];
  if (!scene) return doc;

  const idSet = new Set(ids);
  const bounds = { length: doc.pitch.length, width: doc.pitch.width };

  let positions = scene.positions;
  let touched = false;
  for (const id of idSet) {
    if (id === BALL_ID) continue;
    const p = positions[id];
    if (!p) continue;
    if (!touched) {
      positions = { ...positions };
      touched = true;
    }
    positions[id] = clampToPitch(add(p, delta), bounds);
  }

  let ballPos = scene.ballPos;
  if (idSet.has(BALL_ID) && scene.carrier === null && ballPos) {
    ballPos = clampToPitch(add(ballPos, delta), bounds);
    touched = true;
  }

  if (!touched) return doc;
  return replaceScene(doc, sceneIndex, { ...scene, positions, ballPos });
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
): BoardDoc {
  const delta = axis === "x" ? { x: metres, y: 0 } : { x: 0, y: metres };
  return moveEntities(doc, sceneIndex, ids, delta);
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

function replaceScene(doc: BoardDoc, index: number, scene: Scene): BoardDoc {
  const scenes = doc.scenes.slice();
  scenes[index] = scene;
  return { ...doc, scenes };
}
