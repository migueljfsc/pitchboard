import { describe, expect, it } from "vitest";
import { applySelection, entitiesInRect, hitTest, moveEntities, nudgeEntities } from "./interaction";
import { addSceneAfter } from "./scenes";
import { TOKEN_RADIUS } from "./render";
import { frameAt } from "./timeline";
import { createBoardDoc } from "@/formations";
import { BALL_ID, type BoardDoc, type Vec2 } from "./types";

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

  it("finds a loose ball", () => {
    const loose = createBoardDoc();
    loose.scenes[0].ballPos = { x: 52.5, y: 34 };
    const f = frameAt(loose, 0);
    expect(hitTest(loose, f, f.ball!)).toEqual({ kind: "ball", id: BALL_ID });
  });

  it("finds nothing where the ball would be before anyone has it", () => {
    expect(frame.ball).toBeNull();
    expect(hitTest(doc, frame, { x: 52.5, y: 34 })).toBeNull();
  });

  it("prefers the ball over a token beneath it — it renders on top", () => {
    const carried = createBoardDoc();
    const carrier = carried.teams[0].players[9].id;
    carried.scenes[0].carrier = carrier;
    delete carried.scenes[0].ballPos;

    const f = frameAt(carried, 0);
    expect(hitTest(carried, f, f.ball!)?.kind).toBe("ball");
  });
});

describe("hidden teams", () => {
  const hiddenAway = (() => {
    const d = createBoardDoc();
    d.teams[1].hidden = true;
    return d;
  })();
  const hf = frameAt(hiddenAway, 0);

  it("are not hit-testable", () => {
    const awayPlayer = hiddenAway.teams[1].players[0];
    const at = hf.positions[awayPlayer.id];
    expect(hitTest(hiddenAway, hf, at)).toBeNull();
  });

  it("are excluded from a marquee, so a select-all cannot move them invisibly", () => {
    const all = entitiesInRect(hiddenAway, hf, { x: 0, y: 0 }, { x: 105, y: 68 });
    expect(all).toHaveLength(hiddenAway.teams[0].players.length);
    for (const id of all) expect(id.startsWith("home-")).toBe(true);
  });

  it("still hit-test normally once shown again", () => {
    const shown = structuredClone(hiddenAway);
    shown.teams[1].hidden = false;
    const f = frameAt(shown, 0);
    const awayPlayer = shown.teams[1].players[0];
    expect(hitTest(shown, f, f.positions[awayPlayer.id])?.id).toBe(awayPlayer.id);
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
    const loose = createBoardDoc();
    loose.scenes[0].ballPos = { x: 52.5, y: 34 };
    const next = moveEntities(loose, 0, [BALL_ID], { x: 10, y: 0 });
    expect(next.scenes[0].ballPos!.x).toBeCloseTo(62.5);
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

describe("carrying an edit forward", () => {
  /** `n` scenes, every one copied from the last, so nobody moves anywhere. */
  const still = (n: number): BoardDoc => {
    let d = createBoardDoc();
    for (let i = 1; i < n; i++) d = addSceneAfter(d, i - 1);
    // A ball on the grass in every scene, since a fresh board has none.
    return { ...d, scenes: d.scenes.map((s) => ({ ...s, ballPos: { x: 52.5, y: 34 } })) };
  };

  /** Where `id` stands in each scene. */
  const track = (d: BoardDoc, id: string): Vec2[] => d.scenes.map((s) => s.positions[id]);

  const shove = { x: 0, y: -8 };

  it("carries into every later scene the entity stood still in", () => {
    const d = still(4);
    const before = track(d, first);
    const next = moveEntities(d, 1, [first], shove, "stationary");

    expect(next.scenes[0].positions[first]).toEqual(before[0]);
    for (const i of [1, 2, 3]) {
      expect(next.scenes[i].positions[first].y).toBeCloseTo(before[i].y - 8);
    }
  });

  it("stops at the first scene the entity was already moved in", () => {
    const d = still(4);
    d.scenes[2].positions[first] = { x: 60, y: 40 };
    const before = track(d, first);

    const next = moveEntities(d, 0, [first], shove, "stationary");

    expect(next.scenes[0].positions[first].y).toBeCloseTo(before[0].y - 8);
    expect(next.scenes[1].positions[first].y).toBeCloseTo(before[1].y - 8);
    // Scene 2 holds a placement of its own, and the run into it is the point.
    expect(next.scenes[2].positions[first]).toEqual({ x: 60, y: 40 });
    expect(next.scenes[3].positions[first]).toEqual(before[3]);
  });

  it("carries rigidly through a move when asked for all", () => {
    const d = still(3);
    d.scenes[2].positions[first] = { x: 60, y: 40 };

    const next = moveEntities(d, 0, [first], shove, "all");

    expect(next.scenes[2].positions[first]).toEqual({ x: 60, y: 32 });
  });

  it("leaves later scenes alone by default", () => {
    const d = still(3);
    const next = moveEntities(d, 0, [first], shove);

    expect(next.scenes[1]).toBe(d.scenes[1]);
    expect(next.scenes[2]).toBe(d.scenes[2]);
  });

  it("keeps the identity of scenes it did not change", () => {
    const d = still(3);
    const next = moveEntities(d, 1, [first], shove, "stationary");

    expect(next.scenes[0]).toBe(d.scenes[0]);
  });

  it("translates a curve whose run is carried at both ends", () => {
    const d = still(3);
    d.scenes[2].paths[first] = { c1: { x: 20, y: 30 }, c2: { x: 30, y: 30 } };

    const next = moveEntities(d, 1, [first], shove, "stationary");
    // Both ends of the run into scene 2 moved, so the whole curve moves with it.
    expect(next.scenes[2].paths[first]).toEqual({ c1: { x: 20, y: 22 }, c2: { x: 30, y: 22 } });
  });

  it("moves only the leading control where a carry ends", () => {
    const d = still(3);
    d.scenes[2].positions[first] = { x: 60, y: 40 };
    d.scenes[2].paths[first] = { c1: { x: 20, y: 30 }, c2: { x: 30, y: 30 } };

    const next = moveEntities(d, 0, [first], shove, "stationary");
    // The run into scene 2 now starts 8 m away; its destination never moved.
    expect(next.scenes[2].paths[first]).toEqual({ c1: { x: 20, y: 22 }, c2: { x: 30, y: 30 } });
  });

  it("bends a curve by what the clamp allowed, not by what was asked", () => {
    const d = still(2);
    d.scenes[0].positions[first] = { x: 40, y: 2 };
    d.scenes[1].positions[first] = { x: 40, y: 2 };
    d.scenes[1].paths[first] = { c1: { x: 20, y: 30 }, c2: { x: 30, y: 30 } };

    const next = moveEntities(d, 0, [first], { x: 0, y: -8 }, "stationary");

    // The token stops at the touchline 2 m away, so the curve follows 2 m.
    expect(next.scenes[1].positions[first]).toEqual({ x: 40, y: 0 });
    expect(next.scenes[1].paths[first]).toEqual({ c1: { x: 20, y: 28 }, c2: { x: 30, y: 28 } });
  });

  it("judges each scene against the one before it, so a second nudge behaves like the first", () => {
    // The player is parked through scenes 0-2 and has a run into scene 3. Two
    // nudges of 5 m: the first must stop at scene 2, and the second must not
    // suddenly capture scene 3 because the gap happens to have closed.
    const d = still(4);
    const y = d.scenes[0].positions[first].y;
    d.scenes[3].positions[first] = { x: d.scenes[3].positions[first].x, y: y + 5 };

    const once = nudgeEntities(d, 0, [first], 5, "y", "stationary");
    expect(once.scenes[2].positions[first].y).toBeCloseTo(y + 5);
    expect(once.scenes[3].positions[first].y).toBeCloseTo(y + 5);

    // Scene 3 is now where the player already stands, so the run into it is gone
    // and it travels with the rest — the same answer either nudge arrives at.
    const twice = nudgeEntities(once, 0, [first], 5, "y", "stationary");
    expect(twice.scenes[2].positions[first].y).toBeCloseTo(y + 10);
    expect(twice.scenes[3].positions[first].y).toBeCloseTo(y + 10);
  });

  it("bends the pass line when the player who releases it moves", () => {
    const d = still(2);
    const passer = d.teams[0].players[9].id;
    const receiver = d.teams[0].players[8].id;
    d.scenes[0].carrier = passer;
    delete d.scenes[0].ballPos;
    d.scenes[1].carrier = receiver;
    delete d.scenes[1].ballPos;
    d.scenes[1].ballPath = { c1: { x: 20, y: 30 }, c2: { x: 30, y: 30 } };

    // The passer is the only end of the line that moves — the ball has no stored
    // position of its own at either scene, so nothing names it in the shifts.
    const next = moveEntities(d, 0, [passer], { x: 0, y: -8 }, "scene");

    expect(next.scenes[1].ballPath).toEqual({ c1: { x: 20, y: 22 }, c2: { x: 30, y: 30 } });
  });

  it("leaves the pass line alone when neither end of it moved", () => {
    const d = still(2);
    const passer = d.teams[0].players[9].id;
    const bystander = d.teams[0].players[2].id;
    d.scenes[0].carrier = passer;
    delete d.scenes[0].ballPos;
    d.scenes[1].carrier = passer;
    delete d.scenes[1].ballPos;
    d.scenes[1].ballPath = { c1: { x: 20, y: 30 }, c2: { x: 30, y: 30 } };

    const next = moveEntities(d, 0, [bystander], { x: 0, y: -8 }, "scene");
    expect(next.scenes[1].ballPath).toBe(d.scenes[1].ballPath);
  });

  it("carries a loose ball, and stops where it is picked up", () => {
    const d = still(4);
    const holder = d.teams[0].players[9].id;
    d.scenes[3].carrier = holder;
    delete d.scenes[3].ballPos;
    const before = d.scenes[0].ballPos!;

    const next = moveEntities(d, 0, [BALL_ID], { x: 5, y: 0 }, "stationary");

    for (const i of [0, 1, 2]) {
      expect(next.scenes[i].ballPos!.x).toBeCloseTo(before.x + 5);
    }
    expect(next.scenes[3].carrier).toBe(holder);
    expect(next.scenes[3].ballPos).toBeUndefined();
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

  it("carries forward like a drag does", () => {
    let d = createBoardDoc();
    d = addSceneAfter(d, 0);
    const back4 = d.links[0].members;

    const next = nudgeEntities(d, 0, back4, 5, "x", "stationary");
    for (const id of back4) {
      expect(next.scenes[1].positions[id].x).toBeCloseTo(d.scenes[1].positions[id].x + 5);
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
