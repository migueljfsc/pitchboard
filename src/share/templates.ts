/**
 * Templates the coach saves: a setup to start new boards from.
 *
 * Kept on the account as ordinary saved boards in a project called "Templates", so
 * nothing new is stored and the boards library can already rename, move and delete
 * them. What is saved is the SETUP — the first scene, what is drawn on it and the
 * links that show on it — not the move that follows: a template is where a board
 * starts, and the rest is what that board is for.
 */

import type { BoardDoc } from "@/board/types";
import { visibleAt } from "@/board/annotations";
import { linksOn } from "@/board/links";
import {
  createBoard,
  createProject,
  fetchBoard,
  listAllBoards,
  listProjects,
  type StoredBoardSummary,
} from "./api";
import { parseStoredDoc, serialiseDoc } from "./cloud";

/** The project templates live in, at the root of the library. Found by this name. */
export const TEMPLATES_PROJECT = "Templates";

/**
 * A board cut down to its setup: the first scene alone, with only the drawing and
 * links that show on it, each now showing on every scene of whatever board is made
 * from it.
 */
export function setupOf(doc: BoardDoc): BoardDoc {
  const first = doc.scenes[0];
  const scene = { ...first, transitionMs: 0 };
  const annotations = visibleAt(doc, 0).map((a) => ({ ...a, from: first.id, to: null }));
  const links = linksOn(doc, 0).map((link) => {
    const open = { ...link };
    delete open.from;
    delete open.to;
    return open;
  });
  const next: BoardDoc = { ...doc, scenes: [scene], links };
  if (annotations.length > 0) next.annotations = annotations;
  else delete next.annotations;
  return next;
}

/** The templates project, made the first time it is needed. */
async function templatesProject(): Promise<string> {
  const projects = await listProjects();
  const found = projects.find((p) => p.parent_id === null && p.name === TEMPLATES_PROJECT);
  if (found) return found.id;
  return (await createProject(TEMPLATES_PROJECT)).id;
}

/** Save a board's setup as a template, under its own name. */
export async function saveTemplate(doc: BoardDoc): Promise<void> {
  const setup = setupOf(doc);
  await createBoard(await templatesProject(), setup.name, serialiseDoc(setup));
}

/** The account's templates, newest first. None when there is no templates project yet. */
export async function listTemplates(): Promise<StoredBoardSummary[]> {
  const [projects, boards] = await Promise.all([listProjects(), listAllBoards()]);
  const home = projects.find((p) => p.parent_id === null && p.name === TEMPLATES_PROJECT);
  if (!home) return [];
  return boards
    .filter((b) => b.project_id === home.id)
    .sort((a, b) => b.updated_at - a.updated_at);
}

/** A template's board, validated as any stored board is; null if it no longer is one. */
export async function loadTemplate(id: string): Promise<BoardDoc | null> {
  return parseStoredDoc((await fetchBoard(id)).doc);
}
