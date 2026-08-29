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

import type { BoardDoc } from "@/board/types";
import { boardDocSchema } from "@/board/schema";
import { browserStore, keyFor, read, remove, write, type Store } from "./storage";

export const BOARD_KEY = keyFor("board");

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
    const parsed = boardDocSchema.safeParse(raw);
    return parsed.success ? (parsed.data as BoardDoc) : null;
  });
}

export function saveBoard(doc: BoardDoc, store: Store | null = browserStore()): boolean {
  return write(store, BOARD_KEY, doc);
}

export function clearBoard(store: Store | null = browserStore()): void {
  remove(store, BOARD_KEY);
}
