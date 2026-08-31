/**
 * Editing the squads themselves. Every function returns a new document.
 *
 * Player identity is the `id`; the number and label are presentation, so either
 * can change freely without touching positions, paths or links.
 */

import type { BoardDoc, Player, Scene, Team, Vec2 } from "./types";
import { pruneLinks } from "./links";

/** The name to show for a player: their label if given, otherwise their number. */
export function displayName(doc: BoardDoc, id: string): string {
  for (const team of doc.teams) {
    const p = team.players.find((x) => x.id === id);
    if (p) return p.label.trim() || String(p.number);
  }
  return id;
}

/** Team a player belongs to, or null. */
export function teamOf(doc: BoardDoc, id: string): Team | null {
  return doc.teams.find((t) => t.players.some((p) => p.id === id)) ?? null;
}

function patchPlayer(doc: BoardDoc, id: string, fields: Partial<Omit<Player, "id">>): BoardDoc {
  let touched = false;

  const teams = doc.teams.map((team) => {
    const i = team.players.findIndex((p) => p.id === id);
    if (i < 0) return team;
    const players = team.players.slice();
    players[i] = { ...players[i], ...fields };
    touched = true;
    return { ...team, players };
  }) as [Team, Team];

  return touched ? { ...doc, teams } : doc;
}

/** Free text under the token. Trimmed of nothing — people type as they type. */
export function setPlayerLabel(doc: BoardDoc, id: string, label: string): BoardDoc {
  return patchPlayer(doc, id, { label: label.slice(0, 40) });
}

/**
 * The other player in this one's team already wearing `number`, if any.
 *
 * Same team only — the two sides number independently, and a 10 on each is how
 * football works.
 */
export function shirtClash(doc: BoardDoc, id: string, number: number): Player | null {
  return teamOf(doc, id)?.players.find((p) => p.id !== id && p.number === number) ?? null;
}

/**
 * Shirt number, clamped to the range the schema accepts.
 *
 * A number already worn in the same team is refused outright rather than
 * clamped to something else: the caller asked for a specific shirt, and quietly
 * granting a different one is worse than not moving. Anywhere a build derives an
 * id from the number, two players on one shirt would also collide on the id.
 */
export function setPlayerNumber(doc: BoardDoc, id: string, number: number): BoardDoc {
  if (!Number.isFinite(number)) return doc;
  const wanted = Math.max(0, Math.min(99, Math.round(number)));
  return shirtClash(doc, id, wanted) ? doc : patchPlayer(doc, id, { number: wanted });
}

// ---------------------------------------------------------------- squad size

/** Matches the schema's cap. */
export const MAX_SQUAD = 30;

const allIds = (doc: BoardDoc): Set<string> =>
  new Set(doc.teams.flatMap((t) => t.players.map((p) => p.id)));

/** Lowest shirt number not already worn in this team. */
function freshNumber(team: Team): number {
  const worn = new Set(team.players.map((p) => p.number));
  for (let n = 1; n <= 99; n++) if (!worn.has(n)) return n;
  return 99;
}

/**
 * Ids are independent of shirt numbers, which can be edited freely, so this
 * checks every id in the document rather than deriving one from the number.
 */
function freshId(doc: BoardDoc, teamId: string): string {
  const taken = allIds(doc);
  for (let n = 1; ; n++) {
    const id = `${teamId}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Somewhere to stand that is not on top of anybody.
 *
 * Walks up the touchline nearest the team's own goal until it finds a gap. Falls
 * back to the first candidate if the whole line is busy, which only happens on a
 * board far more crowded than eleven a side.
 */
function freeSpot(doc: BoardDoc, teamIndex: 0 | 1): Vec2 {
  const scene = doc.scenes[0];
  const x = teamIndex === 0 ? 6 : doc.pitch.length - 6;
  const occupied = Object.values(scene.positions);

  for (let y = 5; y <= doc.pitch.width - 5; y += 3.5) {
    const clear = occupied.every((p) => Math.hypot(p.x - x, p.y - y) > 3);
    if (clear) return { x, y };
  }
  return { x, y: doc.pitch.width / 2 };
}

/**
 * Add a player to a team.
 *
 * A position goes into EVERY scene, not just the current one — the schema
 * requires it, and a player missing from a later scene would vanish mid-animation.
 */
export function addPlayer(doc: BoardDoc, teamIndex: 0 | 1): BoardDoc {
  const team = doc.teams[teamIndex];
  if (team.players.length >= MAX_SQUAD) return doc;

  const player: Player = {
    id: freshId(doc, team.id),
    number: freshNumber(team),
    label: "",
  };
  const at = freeSpot(doc, teamIndex);

  const teams = doc.teams.slice() as [Team, Team];
  teams[teamIndex] = { ...team, players: [...team.players, player] };

  return {
    ...doc,
    teams,
    scenes: doc.scenes.map((scene) => ({
      ...scene,
      positions: { ...scene.positions, [player.id]: { ...at } },
    })),
  };
}

/**
 * Remove a player, and every trace of them.
 *
 * Positions, runs, travel overrides and waits go from all scenes; links lose them and
 * are dropped if fewer than two members remain. A scene where they were carrying
 * the ball gets it back as a loose one, where they were standing.
 */
export function removePlayer(doc: BoardDoc, id: string): BoardDoc {
  if (!allIds(doc).has(id)) return doc;

  const teams = doc.teams.map((team) => ({
    ...team,
    players: team.players.filter((p) => p.id !== id),
  })) as [Team, Team];

  const scenes = doc.scenes.map((scene): Scene => {
    const positions = { ...scene.positions };
    const dropped = positions[id];
    delete positions[id];

    const paths = { ...scene.paths };
    delete paths[id];

    const next: Scene = { ...scene, positions, paths };

    if (scene.travel) {
      const travel = { ...scene.travel };
      delete travel[id];
      if (Object.keys(travel).length === 0) delete next.travel;
      else next.travel = travel;
    }

    if (scene.delay) {
      const delay = { ...scene.delay };
      delete delay[id];
      if (Object.keys(delay).length === 0) delete next.delay;
      else next.delay = delay;
    }

    if (scene.highlight) {
      const highlight = { ...scene.highlight };
      delete highlight[id];
      if (Object.keys(highlight).length === 0) delete next.highlight;
      else next.highlight = highlight;
    }

    if (scene.carrier === id) {
      next.carrier = null;
      // The ball drops where they stood. With no position to drop it at, the
      // scene simply has no ball — the board is allowed to be without one (D44).
      if (dropped) next.ballPos = dropped;
      else delete next.ballPos;
    }

    return next;
  });

  return pruneLinks({ ...doc, teams, scenes });
}
