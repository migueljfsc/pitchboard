import { useEffect, useRef } from "react";

/**
 * Write `value` out once editing has been quiet for `delayMs`.
 *
 * `save` is held in a ref so an inline callback does not restart the timer on
 * every render — with the function itself in the dependency list, a board being
 * dragged would reset the countdown faster than it could ever elapse and nothing
 * would be written at all.
 *
 * The first value is skipped: it is whatever was just restored from storage, and
 * writing it straight back serialises a document nobody has touched.
 */
export function useAutosave<T>(value: T, save: (value: T) => void, delayMs: number): void {
  const saveRef = useRef(save);
  const first = useRef(true);

  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = window.setTimeout(() => saveRef.current(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
}
