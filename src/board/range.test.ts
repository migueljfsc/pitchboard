import { describe, expect, it } from "vitest";
import { isVisibleIn, repairRange, sceneSpan } from "./range";
import { addSceneAfter } from "./scenes";
import { createBoardDoc } from "@/formations";
import type { BoardDoc } from "./types";

/** A board with four scenes, so a range has somewhere to start and stop. */
function fourScenes(): BoardDoc {
  let doc = createBoardDoc();
  for (let i = 0; i < 3; i++) doc = addSceneAfter(doc, doc.scenes.length - 1);
  return doc;
}

describe("sceneSpan", () => {
  const doc = fourScenes();
  const id = (i: number) => doc.scenes[i].id;

  it("resolves ids to indices", () => {
    expect(sceneSpan(doc, { from: id(1), to: id(2) })).toEqual([1, 2]);
  });

  // The case a link written before ranges existed lands in: neither end set, and
  // that has to keep meaning every scene or old boards change under their authors.
  it("treats both ends absent as the whole timeline", () => {
    expect(sceneSpan(doc, {})).toEqual([0, 3]);
  });

  it("treats a null or absent end as running to the last scene", () => {
    expect(sceneSpan(doc, { from: id(2), to: null })).toEqual([2, 3]);
    expect(sceneSpan(doc, { from: id(2) })).toEqual([2, 3]);
  });

  it("falls back to the open end for an id that no longer exists", () => {
    expect(sceneSpan(doc, { from: "gone", to: "also-gone" })).toEqual([0, 3]);
  });

  it("reads a range stored backwards as the scenes between its ends", () => {
    expect(sceneSpan(doc, { from: id(3), to: id(1) })).toEqual([1, 3]);
  });

  it("is a single scene when both ends name it", () => {
    expect(sceneSpan(doc, { from: id(2), to: id(2) })).toEqual([2, 2]);
  });
});

describe("isVisibleIn", () => {
  const doc = fourScenes();
  const id = (i: number) => doc.scenes[i].id;
  const range = { from: id(1), to: id(2) };

  it("covers its span inclusively and nothing outside it", () => {
    expect([0, 1, 2, 3].map((i) => isVisibleIn(doc, range, i))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it("is never visible while hidden, whatever the span says", () => {
    expect(isVisibleIn(doc, { ...range, hidden: true }, 1)).toBe(false);
  });
});

describe("repairRange", () => {
  const doc = fourScenes();
  const id = (i: number) => doc.scenes[i].id;

  it("returns the same object when both ends are live", () => {
    const range = { from: id(1), to: id(2) };
    expect(repairRange(doc, range)).toBe(range);
  });

  // Identity matters: the callers use it to decide whether the document changed at
  // all, and a fresh object every time would make every prune look like an edit.
  it("returns the same object when both ends are already open", () => {
    const range = { from: undefined, to: null };
    expect(repairRange(doc, range)).toBe(range);
  });

  it("pulls a dangling start back to the first scene", () => {
    expect(repairRange(doc, { from: "gone", to: id(2) })).toEqual({
      from: id(0),
      to: id(2),
    });
  });

  it("opens a dangling end rather than dropping the range", () => {
    expect(repairRange(doc, { from: id(1), to: "gone" })).toEqual({ from: id(1), to: null });
  });

  it("keeps everything else on the object it repairs", () => {
    expect(repairRange(doc, { from: "gone", to: null, hidden: true })).toMatchObject({
      hidden: true,
    });
  });
});
