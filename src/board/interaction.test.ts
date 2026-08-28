import { describe, expect, it } from "vitest";
import { applySelection, entitiesInRect, hitTest, moveEntities, nudgeEntities } from "./interaction";
import { TOKEN_RADIUS } from "./render";
import { frameAt } from "./timeline";
import { createBoardDoc } from "@/formations";
import { BALL_ID } from "./types";

const doc = createBoardDoc();
const frame = frameAt(doc, 0);
const first = doc.teams[0].players[0].id;

describe("hitTest", () => {
  it("finds a token under the pointer", () => {
    const at = frame.positions[first];
    expect(hitTest(doc, frame, at)).toEqual({ kind: "token", id: first });
  });

  it("misses just outside the token plus grab margin", () => {
    const at = frame.positions[first];
    expect(hitTest(doc, frame, { x: at.x + TOKEN_RADIUS + 1, y: at.y })).toBeNull();
  });

  it("finds the ball", () => {
    expect(hitTest(doc, frame, frame.ball)).toEqual({ kind: "ball", id: BALL_ID });
  });

  it("prefers the ball over a token beneath it — it renders on top", () => {
    const carried = createBoardDoc();
    const carrier = carried.teams[0].players[9].id;
    carried.scenes[0].carrier = carrier;
    delete carried.scenes[0].ballPos;

    const f = frameAt(carried, 0);
    expect(hitTest(carried, f, f.ball)?.kind).toBe("ball");
  });
});

describe("entitiesInRect", () => {
  it("collects every token inside, regardless of corner order", () => {
    const all = entitiesInRect(doc, frame, { x: 0, y: 0 }, { x: 105, y: 68 });
    expect(all).toHaveLength(doc.teams[0].players.length + doc.teams[1].players.length);

    const reversed = entitiesInRect(doc, frame, { x: 105, y: 68 }, { x: 0, y: 0 });
    expect(reversed.sort()).toEqual(all.sort());
  });

  it("returns nothing for an empty region", () => {
    expect(entitiesInRect(doc, frame, { x: 52, y: 0 }, { x: 53, y: 1 })).toEqual([]);
  });
});

describe("moveEntities", () => {
  it("translates a selection preserving relative spacing", () => {
    const [a, b] = doc.teams[0].players.slice(1, 3).map((p) => p.id);
    const before = { x: doc.scenes[0].positions[a].x - doc.scenes[0].positions[b].x, y: doc.scenes[0].positions[a].y - doc.scenes[0].positions[b].y };

    const next = moveEntities(doc, 0, [a, b], { x: 4, y: -2 });
    const after = { x: next.scenes[0].positions[a].x - next.scenes[0].positions[b].x, y: next.scenes[0].positions[a].y - next.scenes[0].positions[b].y };

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.scenes[0].positions[a].x).toBeCloseTo(doc.scenes[0].positions[a].x + 4);
  });

  it("does not mutate the input document", () => {
    const before = structuredClone(doc);
    moveEntities(doc, 0, [first], { x: 5, y: 5 });
    expect(doc).toEqual(before);
  });

  it("clamps to the pitch surface", () => {
    const next = moveEntities(doc, 0, [first], { x: -500, y: -500 });
    expect(next.scenes[0].positions[first]).toEqual({ x: 0, y: 0 });

    const far = moveEntities(doc, 0, [first], { x: 500, y: 500 });
    expect(far.scenes[0].positions[first]).toEqual({ x: doc.pitch.length, y: doc.pitch.width });
  });

  it("moves a loose ball", () => {
    const next = moveEntities(doc, 0, [BALL_ID], { x: 10, y: 0 });
    expect(next.scenes[0].ballPos!.x).toBeCloseTo(doc.scenes[0].ballPos!.x + 10);
  });

  it("ignores a carried ball — it is derived from its carrier", () => {
    const carried = createBoardDoc();
    carried.scenes[0].carrier = carried.teams[0].players[3].id;
    delete carried.scenes[0].ballPos;

    expect(moveEntities(carried, 0, [BALL_ID], { x: 10, y: 10 })).toBe(carried);
  });

  it("returns the same document when nothing matches", () => {
    expect(moveEntities(doc, 0, ["ghost"], { x: 1, y: 1 })).toBe(doc);
  });

  it("only touches the addressed scene", () => {
    const two = structuredClone(doc);
    two.scenes.push({ ...structuredClone(doc.scenes[0]), id: "scene-2", name: "Scene 2" });

    const next = moveEntities(two, 0, [first], { x: 6, y: 0 });
    expect(next.scenes[1].positions[first]).toEqual(two.scenes[1].positions[first]);
  });
});

describe("nudgeEntities", () => {
  it("shifts a line downfield without touching the cross-pitch axis", () => {
    const back4 = doc.links[0].members;
    const next = nudgeEntities(doc, 0, back4, 5, "x");
    for (const id of back4) {
      expect(next.scenes[0].positions[id].x).toBeCloseTo(doc.scenes[0].positions[id].x + 5);
      expect(next.scenes[0].positions[id].y).toBeCloseTo(doc.scenes[0].positions[id].y);
    }
  });
});

describe("applySelection", () => {
  const hit = { kind: "token", id: "a" } as const;

  it("replaces on a plain click", () => {
    expect([...applySelection(new Set(["b", "c"]), hit, false)]).toEqual(["a"]);
  });

  it("toggles on shift-click", () => {
    expect([...applySelection(new Set(["b"]), hit, true)].sort()).toEqual(["a", "b"]);
    expect([...applySelection(new Set(["a", "b"]), hit, true)]).toEqual(["b"]);
  });

  it("clears on an empty plain click, and preserves on an empty shift-click", () => {
    expect(applySelection(new Set(["a"]), null, false).size).toBe(0);
    expect([...applySelection(new Set(["a"]), null, true)]).toEqual(["a"]);
  });
});
