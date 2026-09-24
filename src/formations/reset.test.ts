import { describe, expect, it } from "vitest";
import {
  canResetMove,
  createBoardDoc,
  formationMarks,
  hasMovement,
  removeAllMovement,
  resetMove,
} from "./index";
import { moveEntities } from "@/board/interaction";
import { addSceneAfter, setDelay, setPath, setRunStyle, setTravel } from "@/board/scenes";
import type { BoardDoc } from "@/board/types";

/** Four scenes of the same shape — nobody moves until a test moves them. */
function board(): BoardDoc {
  let doc = createBoardDoc();
  for (let i = 0; i < 3; i++) doc = addSceneAfter(doc, i);
  return doc;
}

const ID = createBoardDoc().teams[0].players[4].id;
const at = (doc: BoardDoc, k: number) => doc.scenes[k].positions[ID];

describe("resetMove", () => {
  it("puts him back where he was in the scene before, and takes his run with it", () => {
    let doc = moveEntities(board(), 2, [ID], { x: 10, y: 5 }, "scene");
    doc = setPath(doc, 2, ID, { c1: { x: 1, y: 1 }, c2: { x: 2, y: 2 } });
    doc = setTravel(setDelay(setRunStyle(doc, 2, ID, { end: "sharp" }), 2, ID, 400), 2, ID, 900);

    const back = resetMove(doc, 2, [ID], "scene");
    expect(at(back, 2)).toEqual(at(back, 1));
    expect(back.scenes[2].paths[ID]).toBeUndefined();
    expect(back.scenes[2].travel?.[ID]).toBeUndefined();
    expect(back.scenes[2].delay?.[ID]).toBeUndefined();
    expect(back.scenes[2].run?.[ID]).toBeUndefined();
  });

  it("carries the reset forward as a drag would", () => {
    // Moved on scene 1 while "While still" was on: scenes 2 and 3 came with it.
    const moved = moveEntities(board(), 1, [ID], { x: 8, y: 0 }, "stationary");
    expect(at(moved, 3)).toEqual(at(moved, 1));

    const stillBack = resetMove(moved, 1, [ID], "stationary");
    for (const k of [1, 2, 3]) expect(at(stillBack, k)).toEqual(at(stillBack, 0));

    const sceneOnly = resetMove(moved, 1, [ID], "scene");
    expect(at(sceneOnly, 1)).toEqual(at(sceneOnly, 0));
    expect(at(sceneOnly, 2)).toEqual(at(moved, 2));
  });

  it("stops at a run he already had, as 'While still' does", () => {
    let doc = moveEntities(board(), 3, [ID], { x: 0, y: 10 }, "scene");
    doc = moveEntities(doc, 1, [ID], { x: 6, y: 0 }, "stationary");
    const back = resetMove(doc, 1, [ID], "stationary");
    expect(at(back, 2)).toEqual(at(back, 0));
    expect(at(back, 3)).toEqual(at(doc, 3));
  });

  it("on the first scene, puts him back on his formation mark", () => {
    const doc = moveEntities(board(), 0, [ID], { x: -7, y: 3 }, "all");
    const back = resetMove(doc, 0, [ID], "all");
    const mark = formationMarks(doc)[ID];
    for (const k of [0, 1, 2, 3]) {
      expect(at(back, k).x).toBeCloseTo(mark.x, 9);
      expect(at(back, k).y).toBeCloseTo(mark.y, 9);
    }
  });

  it("says when there is nothing to take back", () => {
    const doc = board();
    expect(canResetMove(doc, 2, [ID])).toBe(false);
    expect(canResetMove(moveEntities(doc, 2, [ID], { x: 3, y: 0 }), 2, [ID])).toBe(true);
    expect(canResetMove(setTravel(doc, 2, ID, 900), 2, [ID])).toBe(true);
  });
});

describe("removeAllMovement", () => {
  it("keeps him where he starts, in every scene, with nothing left of any run", () => {
    let doc = moveEntities(board(), 1, [ID], { x: 5, y: 0 }, "scene");
    doc = moveEntities(doc, 3, [ID], { x: 0, y: -6 }, "scene");
    doc = setRunStyle(setTravel(doc, 3, ID, 700), 1, ID, { end: "through" });
    expect(hasMovement(doc, [ID])).toBe(true);

    const still = removeAllMovement(doc, [ID]);
    for (const k of [1, 2, 3]) expect(at(still, k)).toEqual(at(still, 0));
    expect(still.scenes.some((s) => s.travel?.[ID] !== undefined || s.run?.[ID])).toBe(false);
    expect(hasMovement(still, [ID])).toBe(false);
  });

  it("leaves everyone else alone", () => {
    const other = createBoardDoc().teams[0].players[5].id;
    const doc = moveEntities(board(), 2, [ID, other], { x: 4, y: 4 }, "scene");
    const still = removeAllMovement(doc, [ID]);
    expect(still.scenes[2].positions[other]).toEqual(doc.scenes[2].positions[other]);
  });
});
