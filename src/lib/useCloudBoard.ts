/**
 * Syncing the board in progress to the signed-in account.
 *
 * THE LOCAL COPY IS STILL THE PRIMARY. `localStorage` autosaves at 700 ms and keeps working
 * with the API down; this is a slower, coarser write on top of it (D39). A drag emits a
 * document per `pointermove` — the trap that already forced a merge key into `useHistory`
 * (D26) — and pointed at a network that is forty requests per gesture, which is both a
 * free-tier failure and a worse editor.
 *
 * A LINK, NOT AN OWNER. The editor does not know about accounts; it holds a `BoardDoc` and
 * this holds the row that document currently corresponds to. Detaching leaves the board
 * exactly where it is, still autosaving locally, simply no longer pushed.
 */

import { useCallback, useState } from "react";

import type { BoardDoc } from "@/board/types";
import { useAutosave } from "@/lib/useAutosave";
import { ApiError, createBoard, fetchBoard, saveBoard as saveRemote } from "@/share/api";
import { parseStoredDoc, serialiseDoc } from "@/share/cloud";
import { type CloudLink, clearLink, loadLink, saveLink } from "@/share/local";

/**
 * Four seconds of quiet, against localStorage's 700 ms.
 *
 * Long enough that a paragraph of dragging is one request rather than a stream of them, short
 * enough that closing the tab rarely loses more than the last gesture — which the local copy
 * still holds anyway.
 */
export const CLOUD_AUTOSAVE_MS = 4000;

export type SyncStatus =
  | { kind: "off" }
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  /** Another tab saved first. `version` is what the server actually holds. */
  | { kind: "conflict"; version: number }
  | { kind: "error"; code: string };

export interface CloudBoard {
  link: CloudLink | null;
  status: SyncStatus;
  /** Replace the editor's document with a saved board and follow it from then on. */
  open: (boardId: string) => Promise<void>;
  /** Create a new row from the current document, in `projectId`. */
  saveAs: (projectId: string, name: string) => Promise<void>;
  saveNow: () => Promise<void>;
  detach: () => void;
  /** Conflict resolution: take the server's copy, or overwrite it with this one. */
  acceptRemote: () => Promise<void>;
  overwriteRemote: () => Promise<void>;
}

export function useCloudBoard(
  doc: BoardDoc,
  setDoc: (next: BoardDoc) => void,
  signedIn: boolean,
): CloudBoard {
  const [link, setLink] = useState<CloudLink | null>(() => loadLink());
  const [status, setStatus] = useState<SyncStatus>({ kind: "off" });

  const remember = useCallback((next: CloudLink | null) => {
    setLink(next);
    if (next) saveLink(next);
    else clearLink();
  }, []);

  const push = useCallback(
    async (value: BoardDoc, force?: number) => {
      const current = link;
      if (!current || !signedIn) return;
      setStatus({ kind: "saving" });
      try {
        const version = await saveRemote(
          current.boardId,
          force ?? current.version,
          serialiseDoc(value),
          value.name,
        );
        remember({ ...current, version, name: value.name });
        setStatus({ kind: "saved", at: Date.now() });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          // The server tells us which version it holds, so the choice offered to the user is
          // a real one rather than a guess about who is ahead.
          setStatus({ kind: "conflict", version: error.version ?? current.version });
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          // Deleted elsewhere. Detaching is the honest outcome — the local board is intact
          // and there is no longer anything to push it to.
          remember(null);
          setStatus({ kind: "error", code: "not_found" });
          return;
        }
        setStatus({ kind: "error", code: error instanceof ApiError ? error.code : "offline" });
      }
    },
    [link, signedIn, remember],
  );

  // Skips its first value, which is whatever was just restored — pushing that straight back
  // would spend a request re-sending a document nobody has touched.
  //
  // The inline callback is new on every render and that is fine: useAutosave holds `save` in
  // a ref precisely so a fresh function does not restart the countdown. Closing over `doc`
  // and `link` directly, rather than reading them from refs, keeps this honest under the
  // React Compiler — a ref written during render is not a legal way to smuggle in the
  // current value.
  useAutosave(doc, (value) => void push(value), CLOUD_AUTOSAVE_MS);

  const open = useCallback(
    async (boardId: string) => {
      setStatus({ kind: "saving" });
      try {
        const board = await fetchBoard(boardId);
        const parsed = parseStoredDoc(board.doc);
        if (!parsed) {
          setStatus({ kind: "error", code: "invalid_document" });
          return;
        }
        setDoc(parsed);
        remember({
          boardId: board.id,
          projectId: board.project_id,
          version: board.version,
          name: board.name,
        });
        setStatus({ kind: "saved", at: Date.now() });
      } catch (error) {
        setStatus({ kind: "error", code: error instanceof ApiError ? error.code : "offline" });
      }
    },
    [setDoc, remember],
  );

  const saveAs = useCallback(
    async (projectId: string, name: string) => {
      setStatus({ kind: "saving" });
      try {
        const board = await createBoard(projectId, name, serialiseDoc(doc));
        remember({ boardId: board.id, projectId, version: board.version, name: board.name });
        setStatus({ kind: "saved", at: Date.now() });
      } catch (error) {
        setStatus({ kind: "error", code: error instanceof ApiError ? error.code : "offline" });
      }
    },
    [doc, remember],
  );

  const saveNow = useCallback(() => push(doc), [push, doc]);

  const detach = useCallback(() => {
    remember(null);
    setStatus({ kind: "off" });
  }, [remember]);

  const acceptRemote = useCallback(async () => {
    if (link) await open(link.boardId);
  }, [open, link]);

  /** Takes the server's version number, which is what makes the next write land. */
  const overwriteRemote = useCallback(async () => {
    if (status.kind === "conflict") await push(doc, status.version);
  }, [push, doc, status]);

  return { link, status, open, saveAs, saveNow, detach, acceptRemote, overwriteRemote };
}
