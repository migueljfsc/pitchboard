/**
 * The project tree — folders, and what is under them (D51).
 *
 * PURE, and derived from the one flat list the library already fetches. There is no second
 * request and no tree held in state: the rail is rebuilt from `Project[]` on every render,
 * which is the same discipline that keeps the board list from going stale.
 *
 * NOTHING HERE TRUSTS THE SHAPE. The rows arrive over the network and the guards that keep
 * them acyclic live in the Worker, so a parent that names a folder nobody has, or a chain
 * that eats its own tail, has to render as *something* rather than hang the tab. An orphan
 * is treated as a root; a cycle is broken by visiting each folder once.
 */

import type { Project } from "@/share/api";

export type ProjectNode = {
  project: Project;
  depth: number;
  children: ProjectNode[];
};

/** One row of the rail: a folder, how far to indent it, and whether it opens. */
export type ProjectRow = {
  project: Project;
  depth: number;
  hasChildren: boolean;
};

/**
 * The forest, in the order the list arrived — which is `updated_at` descending, so a folder
 * touched most recently sits at the top of whichever level it belongs to.
 */
export function buildTree(projects: Project[]): ProjectNode[] {
  const known = new Set(projects.map((p) => p.id));
  const childrenOf = new Map<string, Project[]>();
  const roots: Project[] = [];

  for (const project of projects) {
    // A parent nobody has is not a parent. Filing the orphan at the root keeps it reachable
    // rather than dropping a folder — and its boards with it — out of the view entirely.
    const parent = project.parent_id !== null && known.has(project.parent_id) ? project.parent_id : null;
    if (parent === null) {
      roots.push(project);
      continue;
    }
    const siblings = childrenOf.get(parent);
    if (siblings) siblings.push(project);
    else childrenOf.set(parent, [project]);
  }

  // Visited, not depth-limited: a cycle among folders that never reaches a root would
  // otherwise recurse until the stack goes, and the tab with it.
  const seen = new Set<string>();
  const grow = (project: Project, depth: number): ProjectNode => {
    seen.add(project.id);
    const children = (childrenOf.get(project.id) ?? [])
      .filter((child) => !seen.has(child.id))
      .map((child) => grow(child, depth + 1));
    return { project, depth, children };
  };

  return roots.map((root) => grow(root, 0));
}

/**
 * The tree as a list of rows, skipping what is collapsed.
 *
 * A flat list rather than nested markup: the rail is one `<ul>` so keyboard order, drag
 * targets and the drop ring all behave the way they did before folders nested.
 */
export function visibleRows(nodes: ProjectNode[], expanded: ReadonlySet<string>): ProjectRow[] {
  const out: ProjectRow[] = [];

  const walk = (node: ProjectNode) => {
    out.push({
      project: node.project,
      depth: node.depth,
      hasChildren: node.children.length > 0,
    });
    if (node.children.length > 0 && expanded.has(node.project.id)) node.children.forEach(walk);
  };

  nodes.forEach(walk);
  return out;
}

/** Every row of the tree, however it is folded. What a picker offers. */
export const allRows = (nodes: ProjectNode[]): ProjectRow[] =>
  visibleRows(nodes, new Set(nodes.flatMap(idsIn)));

function idsIn(node: ProjectNode): string[] {
  return [node.project.id, ...node.children.flatMap(idsIn)];
}

/**
 * A folder and everything filed under it.
 *
 * What "show me this project" means once folders nest: selecting one shows its boards and
 * the boards of everything beneath it, because a folder holding only subfolders would
 * otherwise open onto nothing. It is also what a delete has to count before it asks.
 */
export function subtreeIds(projects: Project[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const project of projects) {
    if (project.parent_id === null) continue;
    const siblings = childrenOf.get(project.parent_id);
    if (siblings) siblings.push(project.id);
    else childrenOf.set(project.parent_id, [project.id]);
  }

  const out = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined) break;
    for (const child of childrenOf.get(next) ?? []) {
      // Breaks a cycle for the same reason `buildTree` does, and keeps this terminating.
      if (out.has(child)) continue;
      out.add(child);
      queue.push(child);
    }
  }
  return out;
}

/** Ancestors of a folder, nearest first. What has to be open for it to be on screen. */
export function ancestorIds(projects: Project[], id: string): string[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const out: string[] = [];
  const seen = new Set<string>([id]);

  let current = byId.get(id)?.parent_id ?? null;
  while (current !== null && !seen.has(current)) {
    out.push(current);
    seen.add(current);
    current = byId.get(current)?.parent_id ?? null;
  }
  return out;
}
