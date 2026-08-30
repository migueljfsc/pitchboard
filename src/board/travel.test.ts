import { describe, expect, it } from "vitest";
import {
  entityDelayMs,
  entityTravelMs,
  positionAt,
  progressOf,
  resolveAt,
  sceneTravelMs,
  totalDurationMs,
} from "./timeline";
import { addSceneAfter, setDelay, setSceneTiming, setTravel } from "./scenes";
import { createBoardDoc } from "@/formations";
import { boardDocSchema } from "./schema";
import type { BoardDoc } from "./types";

const FAST = "home-7";
const SLOW = "home-11";

/** Two scenes, 1 s hold then 2 s travel, with both wingers running the same line. */
function runners(): BoardDoc {
  let doc = createBoardDoc();
  doc = setSceneTiming(doc, 0, { holdMs: 1000 });
  doc = addSceneAfter(doc, 0);
  doc = setSceneTiming(doc, 1, { transitionMs: 2000, holdMs: 0 });
  for (const id of [FAST, SLOW]) {
    doc.scenes[0].positions[id] = { x: 10, y: 34 };
    doc.scenes[1].positions[id] = { x: 90, y: 34 };
  }
  return doc;
}

describe("scene travel window", () => {
  it("is the baseline when nobody overrides it", () => {
    const doc = runners();
    expect(sceneTravelMs(doc.scenes[1])).toBe(2000);
    expect(entityTravelMs(doc.scenes[1], FAST)).toBe(2000);
  });

  it("stretches to fit the slowest mover", () => {
    const doc = setTravel(runners(), 1, SLOW, 5000);
    expect(sceneTravelMs(doc.scenes[1])).toBe(5000);
    // The scene's own baseline is untouched; only the window grows.
    expect(doc.scenes[1].transitionMs).toBe(2000);
    expect(totalDurationMs(doc)).toBe(1000 + 5000);
  });

  it("does not shrink below the baseline for a faster runner", () => {
    const doc = setTravel(runners(), 1, FAST, 500);
    expect(sceneTravelMs(doc.scenes[1])).toBe(2000);
  });
});

describe("progressOf", () => {
  it("matches the scene for an entity with no override", () => {
    const doc = runners();
    const r = resolveAt(doc, 2);
    expect(progressOf(FAST, r)).toBeCloseTo(r.u);
  });

  it("runs ahead for a faster entity, and pins at 1 once arrived", () => {
    const doc = setTravel(runners(), 1, FAST, 1000);
    // Half the 2 s window gone: the quick one is done, the other is halfway.
    const r = resolveAt(doc, 2);
    expect(progressOf(FAST, r)).toBe(1);
    expect(progressOf(SLOW, r)).toBeCloseTo(0.5);
  });

  it("runs behind for a slower entity", () => {
    const doc = setTravel(runners(), 1, SLOW, 4000);
    // Window is now 4 s. At 2 s in, the baseline runner has finished.
    const r = resolveAt(doc, 3);
    expect(progressOf(FAST, r)).toBe(1);
    expect(progressOf(SLOW, r)).toBeCloseTo(0.5);
  });

  it("never exceeds 1 or divides by zero", () => {
    const doc = setTravel(runners(), 1, FAST, 0);
    for (const t of [1, 1.5, 2, 3]) {
      const p = progressOf(FAST, resolveAt(doc, t));
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe("positions honour per-entity travel", () => {
  it("puts a faster runner further along at the same instant", () => {
    const doc = setTravel(runners(), 1, FAST, 1000);
    const r = resolveAt(doc, 1.8);
    expect(positionAt(FAST, r, doc).x).toBeGreaterThan(positionAt(SLOW, r, doc).x);
  });

  it("has the faster runner waiting at the destination while the other arrives", () => {
    const doc = setTravel(runners(), 1, FAST, 1000);
    const early = resolveAt(doc, 2.2);
    expect(positionAt(FAST, early, doc)).toEqual({ x: 90, y: 34 });
    expect(positionAt(SLOW, early, doc).x).toBeLessThan(90);

    const end = resolveAt(doc, 3);
    expect(positionAt(SLOW, end, doc)).toEqual({ x: 90, y: 34 });
  });

  it("both still land exactly on their scene positions", () => {
    const doc = setTravel(setTravel(runners(), 1, FAST, 700), 1, SLOW, 4000);
    const end = resolveAt(doc, totalDurationMs(doc) / 1000);
    for (const id of [FAST, SLOW]) {
      expect(positionAt(id, end, doc)).toEqual({ x: 90, y: 34 });
    }
  });
});

describe("a per-entity wait", () => {
  it("is nothing until one is set", () => {
    expect(entityDelayMs(runners().scenes[1], FAST)).toBe(0);
  });

  it("stretches the window by when the last arrival lands, not by the longest run", () => {
    const doc = setDelay(runners(), 1, SLOW, 1500);
    // SLOW still runs for the scene's 2 s, but only from 1.5 s in.
    expect(sceneTravelMs(doc.scenes[1])).toBe(3500);
    expect(doc.scenes[1].transitionMs).toBe(2000);
    expect(totalDurationMs(doc)).toBe(1000 + 3500);
  });

  it("holds an entity at its start until the wait is up", () => {
    const doc = setDelay(runners(), 1, SLOW, 1500);
    const r = resolveAt(doc, 1 + 1.5);

    // FAST is well into its run by then; SLOW has not set off.
    expect(progressOf(SLOW, r, doc)).toBe(0);
    expect(positionAt(SLOW, r, doc)).toEqual({ x: 10, y: 34 });
    expect(progressOf(FAST, r, doc)).toBeGreaterThan(0.5);
  });

  it("still lands everyone at the end of the window", () => {
    const doc = setDelay(runners(), 1, SLOW, 1500);
    const r = resolveAt(doc, 1 + 3.5);
    for (const id of [FAST, SLOW]) {
      expect(positionAt(id, r, doc)).toEqual({ x: 90, y: 34 });
    }
  });

  it("combines with a travel time of its own", () => {
    let doc = setDelay(runners(), 1, SLOW, 1000);
    doc = setTravel(doc, 1, SLOW, 500);
    // Away at 1 s, done at 1.5 s — well inside the scene's own 2 s.
    expect(sceneTravelMs(doc.scenes[1])).toBe(2000);

    const r = resolveAt(doc, 1 + 1.5);
    expect(progressOf(SLOW, r, doc)).toBe(1);
  });

  it("is ignored in flow mode, where the board keeps step", () => {
    const doc = { ...setDelay(runners(), 1, SLOW, 1500), flow: { speed: 10, endHoldMs: 0 } };
    const r = resolveAt(doc, totalDurationMs(doc) / 2000);
    expect(progressOf(SLOW, r, doc)).toBe(r.u);
  });

  it("drops the key when cleared, so an untouched scene serialises as it always did", () => {
    const doc = setDelay(setDelay(runners(), 1, SLOW, 1500), 1, SLOW, null);
    expect(doc.scenes[1].delay).toBeUndefined();
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  it("survives a round trip through the schema", () => {
    const doc = setDelay(runners(), 1, SLOW, 1500);
    const parsed = boardDocSchema.parse(JSON.parse(JSON.stringify(doc)));
    expect(parsed.scenes[1].delay).toEqual({ [SLOW]: 1500 });
  });
});

describe("setTravel", () => {
  it("clears an override and removes the key entirely", () => {
    let doc = setTravel(runners(), 1, FAST, 900);
    expect(doc.scenes[1].travel).toEqual({ [FAST]: 900 });
    doc = setTravel(doc, 1, FAST, null);
    // Absent, not empty — a scene with no overrides serialises as it always did.
    expect("travel" in doc.scenes[1]).toBe(false);
  });

  it("clamps and rounds", () => {
    expect(setTravel(runners(), 1, FAST, -100).scenes[1].travel![FAST]).toBe(0);
    expect(setTravel(runners(), 1, FAST, 1e9).scenes[1].travel![FAST]).toBe(60_000);
    expect(setTravel(runners(), 1, FAST, 1234.6).scenes[1].travel![FAST]).toBe(1235);
  });

  it("keeps the document valid", () => {
    const doc = setTravel(runners(), 1, FAST, 900);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });

  it("is a no-op for a scene that does not exist", () => {
    const doc = runners();
    expect(setTravel(doc, 9, FAST, 900)).toBe(doc);
  });
});
