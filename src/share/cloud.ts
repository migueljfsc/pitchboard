/**
 * Turning a stored document string back into a board.
 *
 * The server stores the document opaquely and validates only its size and well-formedness —
 * `src/board/schema.ts` is the one validator and it runs here, in the browser, where it has to
 * run regardless because a board can arrive from `localStorage` or a share link with no server
 * involved. So a document from an account is treated exactly like one from anywhere else:
 * migrated first, then validated, then discarded if it fails (D31).
 */

import { boardDocSchema } from "@/board/schema";
import { migrate } from "@/board/migrate";
import type { BoardDoc } from "@/board/types";

export function parseStoredDoc(raw: string): BoardDoc | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const migrated = migrate(value);
  if (!migrated.ok) return null;
  const parsed = boardDocSchema.safeParse(migrated.doc);
  return parsed.success ? (parsed.data as BoardDoc) : null;
}

export const serialiseDoc = (doc: BoardDoc): string => JSON.stringify(doc);
