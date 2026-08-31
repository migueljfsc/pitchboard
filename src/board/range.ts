/**
 * A scene range — when something is on screen, and nothing else.
 *
 * Shared by annotations and links, which are otherwise nothing alike: an annotation
 * is fixed geometry that depends on nobody, a link has no geometry at all and is
 * recomputed every frame from its members. Do not let this file talk you into
 * merging them. The one question they genuinely share is which scenes they belong
 * to, and this is the whole of that answer.
 *
 * It lives on its own rather than inside either module because putting it in one
 * makes the other import it, and `links.ts` importing `annotations.ts` is the first
 * step toward exactly that merge. `scenes.ts` cannot hold it either — it already
 * imports `annotations.ts`, so it would close a cycle.
 *
 * STORED AS SCENE IDS, never indices. Reordering scenes then carries the thing with
 * them instead of leaving it pinned to a slot that now holds something else.
 */

import type { BoardDoc } from "./types";

/**
 * Both ends are optional, and both open ends mean the same thing they mean when a
 * scene id has gone missing: run to the end of the timeline. That is what lets a
 * link written before ranges existed — with neither end set — go on being drawn on
 * every scene, with no migration owed.
 */
export type SceneRange = {
  /** Scene id it first appears on. Absent means the first scene. */
  from?: string;
  /** Last scene id it appears on. Null or absent runs to the last scene. */
  to?: string | null;
  hidden?: boolean;
};

/**
 * The scene index range covered, inclusive.
 *
 * An id that no longer exists falls back to the open end rather than to nothing,
 * which keeps a document renderable even if pruning has not run yet.
 */
export function sceneSpan(doc: BoardDoc, range: SceneRange): [number, number] {
  const last = doc.scenes.length - 1;
  const fromIndex = doc.scenes.findIndex((s) => s.id === range.from);
  const toIndex =
    range.to === null || range.to === undefined
      ? last
      : doc.scenes.findIndex((s) => s.id === range.to);
  const start = fromIndex < 0 ? 0 : fromIndex;
  const end = toIndex < 0 ? last : toIndex;
  // A range stored backwards still describes the scenes between its ends.
  return start <= end ? [start, end] : [end, start];
}

export function isVisibleIn(doc: BoardDoc, range: SceneRange, sceneIndex: number): boolean {
  if (range.hidden) return false;
  const [start, end] = sceneSpan(doc, range);
  return sceneIndex >= start && sceneIndex <= end;
}

/**
 * Pull both ends back onto scenes that exist.
 *
 * What a scene deletion owes anything holding a range: the thing itself is kept and
 * its range repaired, rather than the thing being dropped because one end of it
 * pointed at a scene that has gone.
 */
export function repairRange<T extends SceneRange>(doc: BoardDoc, range: T): T {
  const first = doc.scenes[0]?.id;
  if (first === undefined) return range;

  const live = new Set(doc.scenes.map((s) => s.id));
  const from = range.from === undefined || live.has(range.from) ? range.from : first;
  const to = range.to === null || range.to === undefined || live.has(range.to) ? range.to : null;
  return from === range.from && to === range.to ? range : { ...range, from, to };
}
