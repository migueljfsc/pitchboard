/**
 * What a scene's highlight names, and tidying it when something named leaves the board.
 *
 * `Scene.highlight` is keyed by id, and since drawings and links can be lit as well as
 * players and the ball, a key can outlive what it names: a drawing deleted, a formation
 * change dropping its side's links. A scene with any key goes dark (D100), so a stale one
 * would leave it dark around nothing. Both halves live here, importing nothing but types,
 * because `annotations.ts` and `links.ts` must reach them without importing `scenes.ts`.
 */

import type { BoardDoc, Scene } from "./types";
import { BALL_ID } from "./types";

/** Drop `gone` from every scene's highlight, and the field itself where it empties. */
export function forgetHighlights(doc: BoardDoc, gone: Iterable<string>): BoardDoc {
  const ids = new Set(gone);
  if (ids.size === 0) return doc;
  let changed = false;
  const scenes = doc.scenes.map((scene) => {
    if (!scene.highlight || !Object.keys(scene.highlight).some((k) => ids.has(k))) return scene;
    changed = true;
    const highlight = { ...scene.highlight };
    for (const id of ids) delete highlight[id];
    const next: Scene = { ...scene };
    if (Object.keys(highlight).length === 0) delete next.highlight;
    else next.highlight = highlight;
    return next;
  });
  return changed ? { ...doc, scenes } : doc;
}

/** Ids that were in `before` and are not in `after`. */
export function droppedIds(before: { id: string }[], after: { id: string }[]): string[] {
  const kept = new Set(after.map((x) => x.id));
  return before.filter((x) => !kept.has(x.id)).map((x) => x.id);
}

/**
 * Whether a scene lights anything that is still on the board. Read by the spotlight rather
 * than the bare key count, so a key a formation change or an import left behind cannot
 * darken a scene with nothing in it.
 */
export function lightsAnything(doc: BoardDoc, scene: Scene): boolean {
  const keys = Object.keys(scene.highlight ?? {});
  if (keys.length === 0) return false;
  const known = new Set<string>([BALL_ID]);
  for (const team of doc.teams) for (const p of team.players) known.add(p.id);
  for (const ann of doc.annotations ?? []) known.add(ann.id);
  for (const link of doc.links) known.add(link.id);
  return keys.some((k) => known.has(k));
}
