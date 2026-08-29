import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, initialStack, pushChange, redoStack, undoStack } from "./history";

const start = () => initialStack("a");

/** Apply a run of changes, each `[value, merge?]`. */
const run = (entries: [string, string?][]) =>
  entries.reduce((s, [value, merge]) => pushChange(s, value, merge), start());

describe("pushChange", () => {
  it("stacks unkeyed changes one per edit", () => {
    const s = run([["b"], ["c"]]);
    expect(s.past).toEqual(["a", "b"]);
    expect(s.present).toBe("c");
  });

  it("collapses consecutive changes sharing a key into one entry", () => {
    // What a drag looks like: one gesture, a document per pointermove.
    const s = run([["b", "drag-1"], ["c", "drag-1"], ["d", "drag-1"]]);
    expect(s.past).toEqual(["a"]);
    expect(s.present).toBe("d");
  });

  it("starts a new entry when the key changes", () => {
    const s = run([["b", "drag-1"], ["c", "drag-2"]]);
    expect(s.past).toEqual(["a", "b"]);
  });

  it("never merges two unkeyed changes, which are both undefined", () => {
    const s = run([["b"], ["c"]]);
    expect(s.past).toHaveLength(2);
  });

  it("does not merge an unkeyed change into a keyed one", () => {
    const s = run([["b", "drag-1"], ["c"]]);
    expect(s.past).toEqual(["a", "b"]);
  });

  it("ignores a change that alters nothing", () => {
    const s = start();
    expect(pushChange(s, "a")).toBe(s);
  });

  it("drops the redo branch — editing after an undo forks the history", () => {
    const undone = undoStack(run([["b"], ["c"]]));
    expect(undone.future).toEqual(["c"]);
    expect(pushChange(undone, "d").future).toEqual([]);
  });

  it("keeps at most HISTORY_LIMIT steps, discarding the oldest", () => {
    let s = start();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) s = pushChange(s, `v${i}`);
    expect(s.past).toHaveLength(HISTORY_LIMIT);
    expect(s.past[0]).toBe(`v${HISTORY_LIMIT + 20 - 1 - HISTORY_LIMIT}`);
  });
});

describe("undoStack / redoStack", () => {
  it("walks back and forward over the same values", () => {
    const s = run([["b"], ["c"]]);
    const once = undoStack(s);
    expect(once.present).toBe("b");
    expect(undoStack(once).present).toBe("a");
    expect(redoStack(once).present).toBe("c");
  });

  it("round-trips to exactly where it started", () => {
    const s = run([["b"], ["c"]]);
    expect(redoStack(redoStack(undoStack(undoStack(s))))).toEqual(s);
  });

  it("undoes a merged gesture in one step, not one per move", () => {
    const s = run([["b", "drag-1"], ["c", "drag-1"], ["d", "drag-1"]]);
    expect(undoStack(s).present).toBe("a");
  });

  it("is a no-op at either end", () => {
    const s = start();
    expect(undoStack(s)).toBe(s);
    expect(redoStack(s)).toBe(s);
  });

  it("clears the merge key, so the next edit cannot join the one undone", () => {
    const s = undoStack(run([["b", "drag-1"]]));
    expect(pushChange(s, "c", "drag-1").past).toEqual(["a"]);
  });
});
