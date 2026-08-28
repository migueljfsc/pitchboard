/**
 * Editing the squads themselves. Every function returns a new document.
 *
 * Player identity is the `id`; the number and label are presentation, so either
 * can change freely without touching positions, paths or links.
 */

import type { BoardDoc, Player, Team } from "./types";

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

/** Shirt number, clamped to the range the schema accepts. */
export function setPlayerNumber(doc: BoardDoc, id: string, number: number): BoardDoc {
  if (!Number.isFinite(number)) return doc;
  return patchPlayer(doc, id, { number: Math.max(0, Math.min(99, Math.round(number))) });
}
