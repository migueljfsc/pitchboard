import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOLD_MS,
  addSceneAfter,
  defaultCurve,
  deleteScene,
  duplicateScene,
  moveScene,
  renameScene,
  sceneStartSeconds,
  setCarrier,
  setPath,
  setSceneTiming,
  totalSeconds,
} from "./scenes";
import { boardDocSchema } from "./schema";
import { createBoardDoc } from "@/formations";
import { distanceToSegment } from "./geometry";
import type { BoardDoc } from "./types";

const base = () => createBoardDoc();
const HOME_9 = "home-9";
const HOME_10 = "home-10";
const valid = (doc: BoardDoc) => boardDocSchema.safeParse(doc).success;

describe("addSceneAfter", () => {
  it("inserts a scene carrying the previous positions forward", () => {
    const doc = base();
    const next = addSceneAfter(doc, 0);
    expect(next.scenes).toHaveLength(2);
    expect(next.scenes[1].positions).toEqual(doc.scenes[0].positions);
    expect(next.scenes[1].holdMs).toBe(DEFAULT_HOLD_MS);
    expect(valid(next)).toBe(true);
  });

  it("clears paths — the new scene is where the old one already was", () => {
    let doc = base();
    doc = addSceneAfter(doc, 0);
    doc = setPath(doc, 1, HOME_9, { c1: { x: 10, y: 10 }, c2: { x: 20, y: 20 } });
    const next = addSceneAfter(doc, 1);
    expect(next.scenes[2].paths).toEqual({});
  });

  it("gives every scene a distinct id", () => {
    let doc = base();
    for (let i = 0; i < 5; i++) doc = addSceneAfter(doc, doc.scenes.length - 1);
    expect(new Set(doc.scenes.map((s) => s.id)).size).toBe(doc.scenes.length);
  });

  it("is a no-op for an index that does not exist", () => {
    const doc = base();
    expect(addSceneAfter(doc, 9)).toBe(doc);
  });
});

describe("duplicateScene", () => {
  it("copies paths as well as positions", () => {
    let doc = addSceneAfter(base(), 0);
    doc = setPath(doc, 1, HOME_9, { c1: { x: 10, y: 10 }, c2: { x: 20, y: 20 } });
    const next = duplicateScene(doc, 1);
    expect(next.scenes[2].paths[HOME_9]).toEqual(doc.scenes[1].paths[HOME_9]);
    expect(valid(next)).toBe(true);
  });

  it("deep-copies, so editing the copy leaves the original alone", () => {
    let doc = addSceneAfter(base(), 0);
    doc = duplicateScene(doc, 1);
    const before = doc.scenes[1].positions[HOME_9].x;
    doc.scenes[2].positions[HOME_9].x = 99;
    expect(doc.scenes[1].positions[HOME_9].x).toBe(before);
  });
});

describe("deleteScene", () => {
  it("removes the scene and its paths together", () => {
    let doc = addSceneAfter(base(), 0);
    doc = setPath(doc, 1, HOME_9, { c1: { x: 1, y: 1 }, c2: { x: 2, y: 2 } });
    const next = deleteScene(doc, 1);
    expect(next.scenes).toHaveLength(1);
    expect(valid(next)).toBe(true);
  });

  it("refuses to delete the last remaining scene", () => {
    const doc = base();
    expect(deleteScene(doc, 0)).toBe(doc);
  });

  it("leaves a valid document when scene 0 goes", () => {
    const doc = addSceneAfter(base(), 0);
    const next = deleteScene(doc, 0);
    expect(next.scenes).toHaveLength(1);
    expect(valid(next)).toBe(true);
  });
});

describe("moveScene", () => {
  it("reorders", () => {
    let doc = addSceneAfter(base(), 0);
    doc = renameScene(doc, 1, "second");
    const next = moveScene(doc, 1, 0);
    expect(next.scenes[0].name).toBe("second");
    expect(valid(next)).toBe(true);
  });

  it("is a no-op for out-of-range or identical indices", () => {
    const doc = addSceneAfter(base(), 0);
    expect(moveScene(doc, 0, 0)).toBe(doc);
    expect(moveScene(doc, 0, 5)).toBe(doc);
    expect(moveScene(doc, -1, 0)).toBe(doc);
  });
});

describe("setSceneTiming", () => {
  it("sets each duration independently", () => {
    const doc = setSceneTiming(addSceneAfter(base(), 0), 1, { transitionMs: 2500 });
    expect(doc.scenes[1].transitionMs).toBe(2500);
    expect(doc.scenes[1].holdMs).toBe(DEFAULT_HOLD_MS);
  });

  it("clamps to a sane range and rounds to whole milliseconds", () => {
    const doc = addSceneAfter(base(), 0);
    expect(setSceneTiming(doc, 1, { holdMs: -400 }).scenes[1].holdMs).toBe(0);
    expect(setSceneTiming(doc, 1, { holdMs: 1e9 }).scenes[1].holdMs).toBe(60_000);
    expect(setSceneTiming(doc, 1, { holdMs: 1234.6 }).scenes[1].holdMs).toBe(1235);
  });
});

describe("timings", () => {
  it("puts a scene's rest point after every preceding hold and travel", () => {
    let doc = base();
    doc = setSceneTiming(doc, 0, { holdMs: 1000 });
    doc = addSceneAfter(doc, 0);
    doc = setSceneTiming(doc, 1, { transitionMs: 2000, holdMs: 500 });

    expect(sceneStartSeconds(doc, 0)).toBe(0);
    expect(sceneStartSeconds(doc, 1)).toBeCloseTo(3);
    expect(totalSeconds(doc)).toBeCloseTo(3.5);
  });
});

describe("setCarrier", () => {
  it("drops ballPos when a player takes the ball", () => {
    const doc = setCarrier(base(), 0, HOME_9);
    expect(doc.scenes[0].carrier).toBe(HOME_9);
    expect("ballPos" in doc.scenes[0]).toBe(false);
    expect(valid(doc)).toBe(true);
  });

  it("releases the ball where it currently is, not at some default", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    const carried = doc.scenes[0].positions[HOME_9];
    doc = setCarrier(doc, 0, null);

    expect(doc.scenes[0].carrier).toBeNull();
    const dropped = doc.scenes[0].ballPos!;
    // Beside the player it left, so releasing never teleports the ball.
    expect(Math.hypot(dropped.x - carried.x, dropped.y - carried.y)).toBeLessThan(2.5);
    expect(valid(doc)).toBe(true);
  });

  it("stays valid handing the ball straight from one player to another", () => {
    let doc = setCarrier(base(), 0, HOME_9);
    doc = setCarrier(doc, 0, HOME_10);
    expect(doc.scenes[0].carrier).toBe(HOME_10);
    expect(valid(doc)).toBe(true);
  });

  it("is a no-op when nothing changes", () => {
    const doc = setCarrier(base(), 0, HOME_9);
    expect(setCarrier(doc, 0, HOME_9)).toBe(doc);
  });
});

describe("setPath", () => {
  it("sets and clears a curve", () => {
    let doc = addSceneAfter(base(), 0);
    const curve = { c1: { x: 10, y: 10 }, c2: { x: 20, y: 20 } };
    doc = setPath(doc, 1, HOME_9, curve);
    expect(doc.scenes[1].paths[HOME_9]).toEqual(curve);

    doc = setPath(doc, 1, HOME_9, null);
    expect(HOME_9 in doc.scenes[1].paths).toBe(false);
    expect(valid(doc)).toBe(true);
  });
});

describe("defaultCurve", () => {
  it("bows off the straight line between the two points", () => {
    const from = { x: 0, y: 34 };
    const to = { x: 40, y: 34 };
    const { c1, c2 } = defaultCurve(from, to);
    expect(distanceToSegment(c1, from, to)).toBeGreaterThan(1);
    expect(distanceToSegment(c2, from, to)).toBeGreaterThan(1);
  });
});

describe("every operation leaves a valid document", () => {
  it("survives a long editing session", () => {
    let doc = base();
    doc = addSceneAfter(doc, 0);
    doc = setCarrier(doc, 0, HOME_9);
    doc = setCarrier(doc, 1, HOME_10);
    doc = setPath(doc, 1, HOME_9, { c1: { x: 20, y: 20 }, c2: { x: 30, y: 30 } });
    doc = duplicateScene(doc, 1);
    doc = addSceneAfter(doc, 2);
    doc = moveScene(doc, 3, 1);
    doc = setSceneTiming(doc, 2, { transitionMs: 800, holdMs: 200 });
    doc = renameScene(doc, 0, "Kickoff");
    doc = deleteScene(doc, 1);
    doc = setCarrier(doc, 1, null);

    const result = boardDocSchema.safeParse(doc);
    expect(result.success ? null : result.error.issues).toBeNull();
  });
});
