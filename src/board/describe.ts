/**
 * What an edit did, in a few words — for the undo history list.
 *
 * Worked out by comparing the document before and after, not recorded at each call
 * site: there are dozens of places that change a board, and a label threaded
 * through every one of them would be forgotten at the next. The documents share
 * everything an edit did not touch, so most of these comparisons are identity
 * checks and the whole thing is cheap.
 *
 * Returns a `Message`, never prose — the engine speaks no language (D38).
 */

import type { BoardDoc, Scene } from "./types";
import { BALL_ID } from "./types";
import { displayName } from "./players";
import { msg, type Message } from "@/i18n/core";

/** "Home 9", or "Home Silva" where the player has a name. */
function who(doc: BoardDoc, id: string): string {
  if (id === BALL_ID) return "⚽";
  const team = doc.teams.find((t) => t.players.some((p) => p.id === id));
  return team ? `${team.name} ${displayName(doc, id)}` : id;
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Every entity whose stored position differs anywhere between the two. */
function moved(prev: BoardDoc, next: BoardDoc): string[] {
  const ids = new Set<string>();
  next.scenes.forEach((scene, k) => {
    const before = prev.scenes.find((s) => s.id === scene.id) ?? prev.scenes[k];
    if (!before || before.positions === scene.positions) return;
    for (const [id, p] of Object.entries(scene.positions)) {
      const q = before.positions[id];
      if (!q || q.x !== p.x || q.y !== p.y) ids.add(id);
    }
    const a = before.ballPos;
    const b = scene.ballPos;
    if (a && b && (a.x !== b.x || a.y !== b.y)) ids.add(BALL_ID);
  });
  return [...ids];
}

/** Does any scene differ in one of these fields? */
function sceneFieldChanged(prev: BoardDoc, next: BoardDoc, fields: (keyof Scene)[]): boolean {
  return next.scenes.some((scene, k) => {
    const before = prev.scenes.find((s) => s.id === scene.id) ?? prev.scenes[k];
    return !!before && fields.some((f) => !same(before[f], scene[f]));
  });
}

export function describeChange(prev: BoardDoc, next: BoardDoc): Message {
  if (prev === next) return msg("history.edit");

  if (next.scenes.length > prev.scenes.length) return msg("history.sceneAdded");
  if (next.scenes.length < prev.scenes.length) return msg("history.sceneDeleted");
  if (next.scenes.some((s, i) => s.id !== prev.scenes[i].id)) return msg("history.scenesReordered");

  const players = (d: BoardDoc) => d.teams.reduce((n, t) => n + t.players.length, 0);
  if (players(next) > players(prev)) return msg("history.playerAdded");
  if (players(next) < players(prev)) return msg("history.playerRemoved");
  if (next.teams.some((t, i) => t.formation !== prev.teams[i].formation)) {
    return msg("history.formation");
  }

  const shapes = (d: BoardDoc) => d.annotations?.length ?? 0;
  if (shapes(next) > shapes(prev)) return msg("history.shapeAdded");
  if (shapes(next) < shapes(prev)) return msg("history.shapeDeleted");

  const ids = moved(prev, next);
  if (ids.length === 1) return msg("history.moved", { who: who(next, ids[0]) });
  if (ids.length > 1) return msg("history.movedMany", { count: ids.length });

  if (next.annotations !== prev.annotations) return msg("history.shapeEdited");
  if (next.links !== prev.links) return msg("history.links");
  if (sceneFieldChanged(prev, next, ["carrier", "ballPos", "shot", "loft"])) {
    return msg("history.ball");
  }
  if (
    next.flow !== prev.flow ||
    sceneFieldChanged(prev, next, ["transitionMs", "holdMs", "travel", "delay", "run", "speed"])
  ) {
    return msg("history.timing");
  }
  if (sceneFieldChanged(prev, next, ["paths", "ballPath"])) return msg("history.curve");
  if (sceneFieldChanged(prev, next, ["highlight"])) return msg("history.highlight");
  if (sceneFieldChanged(prev, next, ["hiddenRuns"])) return msg("history.arrows");
  if (next.name !== prev.name || sceneFieldChanged(prev, next, ["name"])) {
    return msg("history.renamed");
  }
  if (next.teams !== prev.teams) return msg("history.teams");
  if (next.grass !== prev.grass || next.tokenScale !== prev.tokenScale) return msg("history.look");
  return msg("history.edit");
}
