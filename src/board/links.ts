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
  let color = options.color;

  for (const team of doc.teams) {
    for (const player of team.players) {
      if (!wanted.has(player.id)) continue;
      ordered.push(player.id);
      // Same rule as players.displayName, inlined to keep this module free of a
      // cycle: players.ts needs pruneLinks from here.
      names.push(player.label.trim() || String(player.number));
      color ??= team.color;
    }
  }
  if (ordered.length < 2) return doc;

  const style: LinkStyle = options.style ?? (ordered.length === 3 ? "polygon" : "chain");
  const link: Link = {
    id: freshId(doc),
    // Named after its members, in link order — far more use than "Link 3".
    // Players fall back to their shirt number until they are given a name.
    name: options.name ?? names.join(", "),
    members: ordered,
    style,
    color: color ?? "#ffffff",
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
