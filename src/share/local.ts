/**
 * Autosave of the board in progress.
 *
 * The board is written back to `localStorage` as it is edited and restored on
 * load, so closing the tab is not the same as throwing the work away. It is a
 * scratchpad, not a document store: there is exactly one slot, it is overwritten
 * constantly, and anything worth keeping belongs in a preset, a `.json` export
 * or a share link.
 *
 * A restored board goes through `boardDocSchema` first. It has been sitting in a
 * browser across app versions and can be edited by hand, so it is no more
 * trusted than an imported file.
 */

import { z } from "zod";

import type { BoardDoc } from "@/board/types";
import { boardDocSchema } from "@/board/schema";
import { migrate } from "@/board/migrate";
import { browserStore, keyFor, read, remove, write, type Store } from "./storage";

export const BOARD_KEY = keyFor("board");
export const LINK_KEY = keyFor("link");

/**
 * How long editing has to stop before the board is written.
 *
 * A drag emits a document per pointermove, and localStorage writes are
 * synchronous on the main thread — serialising a whole board forty times a
 * second is exactly the sort of thing that makes a canvas feel sticky.
 */
export const AUTOSAVE_MS = 700;

export function loadBoard(store: Store | null = browserStore()): BoardDoc | null {
  return read(store, BOARD_KEY, (raw) => {
    // An autosave outlives the build that wrote it, so it migrates like any
    // other document arriving from outside this session.
    const migrated = migrate(raw);
    if (!migrated.ok) return null;
    const parsed = boardDocSchema.safeParse(migrated.doc);
    return parsed.success ? (parsed.data as BoardDoc) : null;
  });
}

export function saveBoard(doc: BoardDoc, store: Store | null = browserStore()): boolean {
  return write(store, BOARD_KEY, doc);
}

export function clearBoard(store: Store | null = browserStore()): void {
  remove(store, BOARD_KEY);
}

/**
 * Which saved board the scratchpad currently corresponds to, if any.
 *
 * Kept beside the board rather than inside it: a `BoardDoc` is the same document whether it
 * came from a file, a share link or an account, and putting an account's row id into the
 * schema would put it into every export and every `#d=` link (D35's reasoning, one level up).
 *
 * Like everything else in browser storage this is untrusted on the way back in (D31) — it
 * survives app versions and can be hand-edited — so it is validated and discarded rather than
 * repaired. A wrong link costs a re-open, never a lost board: the worst case is a 404 from the
 * server and a scratchpad that has simply stopped syncing.
 */
const linkSchema = z.object({
  boardId: z.string().min(1),
  projectId: z.string().min(1),
  version: z.number().int().nonnegative(),
  name: z.string(),
});

export type CloudLink = z.infer<typeof linkSchema>;

export function loadLink(store: Store | null = browserStore()): CloudLink | null {
  return read(store, LINK_KEY, (raw) => {
    const parsed = linkSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  });
}

export function saveLink(link: CloudLink, store: Store | null = browserStore()): boolean {
  return write(store, LINK_KEY, link);
}

export function clearLink(store: Store | null = browserStore()): void {
  remove(store, LINK_KEY);
}
