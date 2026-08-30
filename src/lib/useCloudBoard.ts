/**
 * The saved board this editor is currently editing.
 *
 * THE ADDRESS IS THE LINK. A saved board lives at `/board/<id>`, and that path — not a hidden
 * entry in `localStorage` — is what says which board is open. It is bookmarkable, it is
 * shareable with someone who has access, the back button walks between boards, and there is
 * no invisible state to get out of step with what the address claims.
 *
 * SAVING IS AN UPDATE, NOT AN INSERT. A board is created exactly once, on the first save into
 * a project; every save after that is a `PUT` against the same row and bumps its version.
 * Editing and saving repeatedly leaves one board, not a pile of them.
 *
 * THE LOCAL COPY IS STILL THE PRIMARY. `localStorage` autosaves at 700 ms and keeps working
 * with the API down; this is a slower, coarser write on top of it (D39). A drag emits a
 * document per `pointermove` — the trap that already forced a merge key into `useHistory`
 * (D26) — and pointed at a network that is forty requests per gesture.
 */

import { useCallback, useEffect, useState } from "react";

import type { BoardDoc } from "@/board/types";
import { useAutosave } from "@/lib/useAutosave";
import { ApiError, createBoard, fetchBoard, saveBoard as saveRemote } from "@/share/api";
import { parseStoredDoc, serialiseDoc } from "@/share/cloud";
import { goToBoard, readBoardId } from "@/share/routes";

/**
 * Four seconds of quiet, against localStorage's 700 ms.
 *
 * Long enough that a paragraph of dragging is one request rather than a stream of them, short
 * enough that closing the tab rarely loses more than the last gesture — which the local copy
 * still holds anyway.
 */
export const CLOUD_AUTOSAVE_MS = 4000;

export interface LinkedBoard {
  id: string;
  projectId: string;
  version: number;
  name: string;
}

export type SyncStatus =
  | { kind: "off" }
  | { kind: "loading" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  /** Another tab saved first. `version` is what the server actually holds. */
  | { kind: "conflict"; version: number }
  | { kind: "error"; code: string };

export interface CloudBoard {
  board: LinkedBoard | null;
  status: SyncStatus;
  open: (boardId: string) => Promise<void>;
  /** First save only — creates the row, then the address points at it. */
  saveInto: (projectId: string, name: string) => Promise<boolean>;
  /** True when the server took it. A caller that says "Saved" has to know it did. */
  saveNow: () => Promise<boolean>;
  /** The open board moved projects. Bookkeeping only — the move already happened. */
  relocate: (projectId: string) => void;
  acceptRemote: () => Promise<void>;
  overwriteRemote: () => Promise<void>;
}

export function useCloudBoard(
  doc: BoardDoc,
  setDoc: (next: BoardDoc) => void,
  signedIn: boolean,
): CloudBoard {
  const [board, setBoard] = useState<LinkedBoard | null>(null);
  const [status, setStatus] = useState<SyncStatus>({ kind: "off" });

  /**
   * Read once at mount. A path only changes by navigation, and every navigation this app
   * makes goes through `goToBoard`, which also sets the state — so re-reading it on every
   * render would be answering a question nobody asked.
   */
  const [wanted] = useState(() => readBoardId());

  // Opening what the address asks for, once there is an account to ask with. Written as an
  // inline promise rather than a call to a loader, because setState may not happen
  // synchronously inside an effect — only in the callbacks it schedules.
  useEffect(() => {
    if (!signedIn || !wanted) return;
    let live = true;
    void fetchBoard(wanted)
      .then((row) => {
        if (!live) return;
        const parsed = parseStoredDoc(row.doc);
        if (!parsed) {
          setStatus({ kind: "error", code: "invalid_document" });
          return;
        }
        setDoc(parsed);
        setBoard({
          id: row.id,
          projectId: row.project_id,
          version: row.version,
          name: row.name,
        });
        setStatus({ kind: "saved", at: Date.now() });
      })
      .catch((error: unknown) => {
        if (live) {
          setStatus({ kind: "error", code: error instanceof ApiError ? error.code : "offline" });
        }
      });
    return () => {
      live = false;
    };
  }, [signedIn, wanted, setDoc]);

  const push = useCallback(
    async (value: BoardDoc, force?: number): Promise<boolean> => {
      if (!board || !signedIn) return false;
      setStatus({ kind: "saving" });
      try {
        const version = await saveRemote(
          board.id,
          force ?? board.version,
          serialiseDoc(value),
          value.name,
        );
        setBoard({ ...board, version, name: value.name });
        setStatus({ kind: "saved", at: Date.now() });
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          // The server says which version it holds, so the choice offered is a real one
          // rather than a guess about who is ahead.
          setStatus({ kind: "conflict", version: error.version ?? board.version });
          return false;
        }
        setStatus({ kind: "error", code: error instanceof ApiError ? error.code : "offline" });
        return false;
      }
    },
    [board, signedIn],
  );

  // Skips its first value, which is whatever was just restored or just loaded — pushing that
  // straight back would spend a request re-sending a document nobody has touched.
  //
  // The inline callback is new on every render and that is fine: useAutosave holds `save` in a
  // ref precisely so a fresh function does not restart the countdown.
  useAutosave(doc, (value) => void push(value), CLOUD_AUTOSAVE_MS);

  const open = useCallback(
    async (boardId: string) => {
      setStatus({ kind: "loading" });
      try {
        const row = await fetchBoard(boardId);
        const parsed = parseStoredDoc(row.doc);
        if (!parsed) {
          setStatus({ kind: "error", code: "invalid_document" });
          return;
        }
        setDoc(parsed);
        setBoard({ id: row.id, projectId: row.project_id, version: row.version, name: row.name });
        goToBoard(row.id);
        setStatus({ kind: "saved", at: Date.now() });
      } catch (error) {
        setStatus({ kind: "error", code: error instanceof ApiError ? error.code : "offline" });
      }
    },
    [setDoc],
  );

  /** The only thing that ever creates a row. Everything after it is an update. */
  const saveInto = useCallback(
    async (projectId: string, name: string): Promise<boolean> => {
      setStatus({ kind: "saving" });
      try {
        const row = await createBoard(projectId, name, serialiseDoc(doc));
        setBoard({ id: row.id, projectId, version: row.version, name: row.name });
        goToBoard(row.id);
        setStatus({ kind: "saved", at: Date.now() });
        return true;
      } catch (error) {
        setStatus({ kind: "error", code: error instanceof ApiError ? error.code : "offline" });
        return false;
      }
    },
    [doc],
  );

  const saveNow = useCallback(() => push(doc), [push, doc]);

  /**
   * Follow a move that has already landed on the server.
   *
   * Local state only. Re-fetching to pick up the new project would replace the document under
   * the editor — and with it whatever has not been autosaved yet — to learn one field that the
   * caller already knows, since it is the one that asked for the move.
   */
  const relocate = useCallback((projectId: string) => {
    setBoard((current) => (current ? { ...current, projectId } : current));
  }, []);

  const acceptRemote = useCallback(async () => {
    if (board) await open(board.id);
  }, [open, board]);

  /** Takes the server's version number, which is what makes the next write land. */
  const overwriteRemote = useCallback(async () => {
    if (status.kind === "conflict") await push(doc, status.version);
  }, [push, doc, status]);

  return { board, status, open, saveInto, saveNow, relocate, acceptRemote, overwriteRemote };
}
