import { useCallback, useEffect, useRef, useState } from "react";

/** A short notice at the foot of the board, with at most one thing to do about it. */
export type Toast = {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
};

/** How long a notice stays up, in milliseconds. Long enough to reach its Undo. */
export const TOAST_MS = 5000;

/**
 * Notices for the edits that otherwise happen silently — a scene deleted, a board
 * replaced — each offering its own undo.
 *
 * Editor state, never the document: a notice is about something that just
 * happened to the board, not part of it. The newest replaces an older one with the
 * same text, so repeating an action does not stack identical rows.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (text: string, action?: Toast["action"]) => {
      const id = ++next.current;
      setToasts((list) => [...list.filter((t) => t.text !== text).slice(-2), { id, text, action }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), TOAST_MS));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
    };
  }, []);

  return { toasts, push, dismiss };
}
