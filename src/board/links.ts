/**
 * Links — the connector drawn between a group of players.
 *
 * A link is recomputed every frame from its members' INTERPOLATED positions, so
 * the shape deforms as they move independently. That is the whole point: you
 * watch a midfield three stretch when the left eight jumps to press, and see the
 * gap open behind them. Nothing here is stored between frames.
 */

import type { BoardDoc, Link, LinkStyle, Vec2 } from "./types";
import { positionAt, type Resolved } from "./timeline";

export type LinkEdge = { a: Vec2; b: Vec2; mid: Vec2; metres: number };

export type LinkGeometry = {
  /** Member positions, in member order. */
  points: Vec2[];
  closed: boolean;
  edges: LinkEdge[];
};

/**
 * Resolve a link at an instant.
 *
 * Returns null for a link with fewer than two live members — there is nothing to
 * connect. A polygon of two points is treated as a chain, because closing it
 * would draw the same segment twice.
 */
export function linkGeometry(link: Link, r: Resolved, doc: BoardDoc): LinkGeometry | null {
  const points: Vec2[] = [];
  for (const id of link.members) {
    if (r.to.positions[id] || r.from.positions[id]) points.push(positionAt(id, r, doc));
  }
  if (points.length < 2) return null;

  const closed = link.style !== "chain" && points.length >= 3;

  const edges: LinkEdge[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    edges.push({
      a,
      b,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      metres: Math.hypot(b.x - a.x, b.y - a.y),
    });
  }

  return { points, closed, edges };
}

/** Total length of the connector, in metres. */
export function perimeter(g: LinkGeometry): number {
  return g.edges.reduce((n, e) => n + e.metres, 0);
}

/**
 * Enclosed area in square metres, by the shoelace formula. Zero for an open
 * chain, which encloses nothing.
 */
export function area(g: LinkGeometry): number {
  if (!g.closed) return 0;
  let sum = 0;
  for (let i = 0; i < g.points.length; i++) {
    const a = g.points[i];
    const b = g.points[(i + 1) % g.points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Colour a link is drawn in.
 *
 * A link is a property of a unit, not a decoration with a life of its own, so by
 * default it takes its members' kit colour and follows it when that kit changes.
 * `link.color` overrides that permanently. A link spanning both teams belongs to
 * neither and falls back to neutral.
 */
export function linkColor(doc: BoardDoc, link: Link): string {
  if (link.color) return link.color;

  let owner: string | undefined;
  for (const team of doc.teams) {
    if (!team.players.some((p) => link.members.includes(p.id))) continue;
    if (owner !== undefined) return NEUTRAL_LINK_COLOR;
    owner = team.color;
  }
  return owner ?? NEUTRAL_LINK_COLOR;
}

/** For a link with no team of its own. White reads on grass at any kit colour. */
export const NEUTRAL_LINK_COLOR = "#ffffff";

// ---------------------------------------------------------------- editing

const withLinks = (doc: BoardDoc, links: Link[]): BoardDoc => ({ ...doc, links });

function freshId(doc: BoardDoc): string {
  let n = doc.links.length + 1;
  const taken = new Set(doc.links.map((l) => l.id));
  while (taken.has(`link-${n}`)) n++;
  return `link-${n}`;
}

/**
 * Build a link from a selection.
 *
 * Members are ordered by the document's own player order rather than by the order
 * they happened to be clicked, so a back four selected right-to-left still draws
 * as a sensible line.
 */
export function createLink(
  doc: BoardDoc,
  members: Iterable<string>,
  options: { name?: string; style?: LinkStyle; color?: string } = {},
): BoardDoc {
  const wanted = new Set(members);
  const ordered: string[] = [];
  const names: string[] = [];

  for (const team of doc.teams) {
    for (const player of team.players) {
      if (!wanted.has(player.id)) continue;
      ordered.push(player.id);
      // Same rule as players.displayName, inlined to keep this module free of a
      // cycle: players.ts needs pruneLinks from here.
      names.push(player.label.trim() || String(player.number));
    }
  }
  if (ordered.length < 2) return doc;

  // Chain whatever the size. A closed shape draws an edge back across the unit,
  // which is a claim about the group that a link should not make on its own.
  const style: LinkStyle = options.style ?? "chain";
  const link: Link = {
    id: freshId(doc),
    // Named after its members, in link order — far more use than "Link 3".
    // Players fall back to their shirt number until they are given a name.
    name: options.name ?? names.join(", "),
    members: ordered,
    style,
    // Left unset unless asked for: the link tracks its members' kit colour.
    color: options.color,
    showDistances: false,
  };
  return withLinks(doc, [...doc.links, link]);
}

export function updateLink(doc: BoardDoc, id: string, patch: Partial<Omit<Link, "id">>): BoardDoc {
  const i = doc.links.findIndex((l) => l.id === id);
  if (i < 0) return doc;
  const links = doc.links.slice();
  links[i] = { ...links[i], ...patch };
  return withLinks(doc, links);
}

export function deleteLink(doc: BoardDoc, id: string): BoardDoc {
  const links = doc.links.filter((l) => l.id !== id);
  return links.length === doc.links.length ? doc : withLinks(doc, links);
}

/**
 * Drop every link on the board.
 *
 * Both sides at once: the panel lists them as one stack, so clearing "the links"
 * that are on screen is what the button appears to offer.
 */
export function clearLinks(doc: BoardDoc): BoardDoc {
  return doc.links.length === 0 ? doc : withLinks(doc, []);
}

/**
 * Reorder the link list itself.
 *
 * Document order is draw order, so this is also the z-order: a filled link moved
 * down the list stops shading the ones above it.
 */
export function moveLink(doc: BoardDoc, from: number, to: number): BoardDoc {
  const n = doc.links.length;
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return doc;

  const links = doc.links.slice();
  const [moved] = links.splice(from, 1);
  links.splice(to, 0, moved);
  return withLinks(doc, links);
}

/**
 * The most players one link may hold. Matches the schema, and an eleven.
 */
export const MAX_MEMBERS = 11;
/** Below this a link has no geometry to draw, and the schema rejects it. */
export const MIN_MEMBERS = 2;

/**
 * Add players to an existing link.
 *
 * Appended rather than re-sorted into document order: member order is the chain
 * sequence, and someone who has arranged a back four by hand should not have that
 * undone by adding a fifth. The new ones arrive in document order among
 * themselves, which is the same rule `createLink` uses when there is no existing
 * order to respect.
 *
 * Walking the teams is also what keeps a non-player out — the ball is selectable
 * on the board, and a link may only name players.
 */
export function addMembers(doc: BoardDoc, id: string, members: Iterable<string>): BoardDoc {
  const link = doc.links.find((l) => l.id === id);
  if (!link) return doc;

  const wanted = new Set(members);
  const held = new Set(link.members);
  const added: string[] = [];

  for (const team of doc.teams) {
    for (const player of team.players) {
      if (!wanted.has(player.id) || held.has(player.id)) continue;
      if (link.members.length + added.length >= MAX_MEMBERS) break;
      added.push(player.id);
    }
  }
  if (added.length === 0) return doc;
  return updateLink(doc, id, { members: [...link.members, ...added] });
}

/**
 * Drop one player from a link.
 *
 * Refused at two members: a link of one has no geometry, and silently deleting
 * the whole link because its last edge was removed is not what an × on a chip
 * offers. Removing the link itself is its own button.
 */
export function removeMember(doc: BoardDoc, id: string, member: string): BoardDoc {
  const link = doc.links.find((l) => l.id === id);
  if (!link || link.members.length <= MIN_MEMBERS) return doc;
  const members = link.members.filter((m) => m !== member);
  return members.length === link.members.length ? doc : updateLink(doc, id, { members });
}

/** Member order defines the chain sequence and the polygon perimeter. */
export function moveMember(doc: BoardDoc, id: string, from: number, to: number): BoardDoc {
  const link = doc.links.find((l) => l.id === id);
  if (!link) return doc;
  const n = link.members.length;
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return doc;

  const members = link.members.slice();
  const [moved] = members.splice(from, 1);
  members.splice(to, 0, moved);
  return updateLink(doc, id, { members });
}

/**
 * Drop players from every link that references them, and discard links left with
 * fewer than two members. Keeps the document valid when a squad changes.
 */
/**
 * Splice one side's links in where that side's links already sat.
 *
 * Ownership is by membership rather than by id, which survives any future change
 * to how ids are minted. Slotting them in place rather than appending means a
 * team replacing its own units does not jump to the end of the draw order — and
 * document order is draw order.
 */
export function replaceTeamLinks(doc: BoardDoc, index: 0 | 1, resolved: Link[]): Link[] {
  const ids = new Set(doc.teams[index].players.map((p) => p.id));
  const owns = (l: Link) => l.members.some((m) => ids.has(m));
  const firstAt = doc.links.findIndex(owns);
  const kept = doc.links.filter((l) => !owns(l));
  const at = firstAt < 0 ? kept.length : firstAt;
  return [...kept.slice(0, at), ...resolved, ...kept.slice(at)];
}

export function pruneLinks(doc: BoardDoc): BoardDoc {
  const live = new Set(doc.teams.flatMap((t) => t.players.map((p) => p.id)));
  let changed = false;

  const links: Link[] = [];
  for (const link of doc.links) {
    const members = link.members.filter((m) => live.has(m));
    if (members.length !== link.members.length) changed = true;
    if (members.length < 2) continue;
    links.push(members.length === link.members.length ? link : { ...link, members });
  }

  return changed || links.length !== doc.links.length ? withLinks(doc, links) : doc;
}
