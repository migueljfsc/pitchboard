import { useCallback, useMemo, useState } from "react";

/**
 * Undo/redo over a single value.
 *
 * Snapshots rather than inverse operations: every editing function in
 * `src/board/` already returns a new document sharing everything it did not
 * touch, so a stack of them costs a pointer per entry and needs no per-operation
 * undo logic to keep in step with the operations themselves.
 *
 * The one thing snapshots need is a sense of where one edit ends and the next
 * begins. A drag emits a document per pointermove, and stepping back through
 * those one at a time is not undo, it is rewind. Hence `merge`: consecutive
 * changes carrying the same key replace the top of the stack instead of pushing
 * onto it, so a whole drag or a typed name collapses into one entry. A change
 * with no key always pushes.
 *
 * The stack maths is kept out of the hook so it can be tested as the pure thing
 * it is — this project has no component tests.
 */
export const HISTORY_LIMIT = 60;

/** A setter that can mark a change as a continuation of the one before it. */
export type Change<T> = (next: T, merge?: string) => void;

export type Stack<T> = {
  past: T[];
  present: T;
  future: T[];
  /** Key of the entry on top, when it was a mergeable one. */
  merge: string | undefined;
};

export const initialStack = <T,>(present: T): Stack<T> => ({
  past: [],
  present,
  future: [],
  merge: undefined,
});

/**
 * Record a new value. Redo is dropped: editing after undoing forks the history,
 * and the branch you walked away from is gone.
 */
export function pushChange<T>(s: Stack<T>, next: T, merge?: string): Stack<T> {
  if (next === s.present) return s;

  // Continuing the edit already on top: overwrite it rather than stack another.
  // An undefined key never continues anything, including another undefined one.
  if (merge !== undefined && merge === s.merge) {
    return s.future.length === 0 && next === s.present ? s : { ...s, present: next, future: [] };
  }

  return {
    past: [...s.past, s.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    merge,
  };
}

export function undoStack<T>(s: Stack<T>): Stack<T> {
  const previous = s.past[s.past.length - 1];
  if (previous === undefined) return s;
  return {
    past: s.past.slice(0, -1),
    present: previous,
    future: [s.present, ...s.future],
    // Cleared, so the next edit cannot merge into the one just undone.
    merge: undefined,
  };
}

export function redoStack<T>(s: Stack<T>): Stack<T> {
  const [next, ...rest] = s.future;
  if (next === undefined) return s;
  return {
    past: [...s.past, s.present].slice(-HISTORY_LIMIT),
    present: next,
    future: rest,
    merge: undefined,
  };
}

export type History<T> = {
  state: T;
  set: Change<T>;
  /** Both return the value now current, so a caller can react to it at once. */
  undo: () => T;
  redo: () => T;
  canUndo: boolean;
  canRedo: boolean;
};

export function useHistory<T>(initial: T | (() => T)): History<T> {
  const [stack, setStack] = useState<Stack<T>>(() =>
    initialStack(typeof initial === "function" ? (initial as () => T)() : initial),
  );

  const set = useCallback<Change<T>>((next, merge) => {
    setStack((s) => pushChange(s, next, merge));
  }, []);

  // Computed from the current stack rather than inside the updater, so the
  // resulting value can be returned: callers need it in the same tick.
  const undo = useCallback(() => {
    const next = undoStack(stack);
    setStack(next);
    return next.present;
  }, [stack]);

  const redo = useCallback(() => {
    const next = redoStack(stack);
    setStack(next);
    return next.present;
  }, [stack]);

  return useMemo(
    () => ({
      state: stack.present,
      set,
      undo,
      redo,
      canUndo: stack.past.length > 0,
      canRedo: stack.future.length > 0,
    }),
    [stack, set, undo, redo],
  );
}
