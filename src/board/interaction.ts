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

import type { BoardDoc, PathCurve, Scene, Vec2 } from "./types";
import { BALL_ID } from "./types";
import { BALL_RADIUS, TOKEN_RADIUS } from "./pitch";
import { displayCurve, transitionInto, type Frame } from "./timeline";
import { HANDLE_RADIUS } from "./render";
import { clamp } from "./geometry";

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
  if (dist(p, frame.ball) <= BALL_RADIUS + margin) {
    return { kind: "ball", id: BALL_ID };
  }

  for (const team of doc.teams) {
    for (const player of team.players) {
      const pos = frame.positions[player.id];
      if (pos && dist(p, pos) <= TOKEN_RADIUS + margin) {
        return { kind: "token", id: player.id };
      }
    }
  }

  return null;
}

/** Player ids whose token centre falls inside the rectangle spanned by `a` and `b`. */
export function entitiesInRect(doc: BoardDoc, frame: Frame, a: Vec2, b: Vec2): string[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);

  const hits: string[] = [];
  for (const team of doc.teams) {
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
