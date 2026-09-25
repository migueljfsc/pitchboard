import { describe, expect, it } from "vitest";
import {
  alignEntities,
  distributeEntities,
  lineUp,
  moveEntities,
  spaceEvenly,
  snapPoint,
  swapPlayers,
  swapTarget,
} from "./interaction";
import { describeChange } from "./describe";
import { addSceneAfter, setCarrier } from "./scenes";
import { boardDocSchema } from "./schema";
import { createBoardDoc } from "@/formations";
import { TEMPLATE_IDS, buildTemplate } from "@/formations/templates";

const doc = createBoardDoc();
const BACK = ["home-2", "home-5", "home-6", "home-3"];
const pos = (d: typeof doc, id: string, k = 0) => d.scenes[k].positions[id];

describe("alignEntities", () => {
  it("puts a line level at its average depth", () => {
    const ragged = moveEntities(doc, 0, ["home-5"], { x: 4, y: 0 });
    const level = alignEntities(ragged, 0, BACK, "x");
    const xs = BACK.map((id) => pos(level, id).x);
    expect(new Set(xs.map((x) => x.toFixed(6))).size).toBe(1);
    const mean = BACK.reduce((n, id) => n + pos(ragged, id).x, 0) / BACK.length;
    expect(xs[0]).toBeCloseTo(mean, 6);
    // Across the pitch they stay where they were.
    for (const id of BACK) expect(pos(level, id).y).toBe(pos(ragged, id).y);
  });

  it("does nothing for fewer than two", () => {
    expect(alignEntities(doc, 0, ["home-5"], "x")).toBe(doc);
  });
});

describe("distributeEntities", () => {
  it("evens the gaps between the two outermost, keeping the order", () => {
    const bunched = moveEntities(doc, 0, ["home-5"], { x: 0, y: 12 });
    const spread = distributeEntities(bunched, 0, BACK, "y");
    const ys = BACK.map((id) => pos(spread, id).y).sort((a, b) => a - b);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6);
    const before = BACK.map((id) => pos(bunched, id).y);
    expect(ys[0]).toBeCloseTo(Math.min(...before), 6);
    expect(ys[3]).toBeCloseTo(Math.max(...before), 6);
  });
});

describe("snapPoint", () => {
  it("takes the nearest line on each axis within reach, and says which", () => {
    const { point, guides } = snapPoint({ x: 20.4, y: 33 }, [
      { x: 20, y: 10 },
      { x: 50, y: 33.3 },
    ]);
    expect(point).toEqual({ x: 20, y: 33.3 });
    expect(guides).toEqual([{ x: 20 }, { y: 33.3 }]);
  });

  it("leaves a point alone with nothing near", () => {
    expect(snapPoint({ x: 1, y: 1 }, [{ x: 30, y: 30 }])).toEqual({
      point: { x: 1, y: 1 },
      guides: [],
    });
  });
});

describe("swapping two players", () => {
  it("finds the player dropped onto, and only close enough", () => {
    expect(swapTarget(doc, 0, "home-9", pos(doc, "home-8"))).toBe("home-8");
    const near = { x: pos(doc, "home-8").x + 5, y: pos(doc, "home-8").y };
    expect(swapTarget(doc, 0, "home-9", near)).toBeNull();
  });

  it("puts the dropped player on the other's place, and the other where he started", () => {
    const started = pos(doc, "home-9");
    const dragged = moveEntities(doc, 0, ["home-9"], {
      x: pos(doc, "home-8").x - started.x + 0.2,
      y: pos(doc, "home-8").y - started.y,
    });
    const swapped = swapPlayers(dragged, 0, "home-9", "home-8", started);
    expect(pos(swapped, "home-9")).toEqual(pos(doc, "home-8"));
    expect(pos(swapped, "home-8")).toEqual(started);
  });
});

describe("describeChange", () => {
  it("names what an edit did", () => {
    const two = addSceneAfter(doc, 0);
    expect(describeChange(doc, two).key).toBe("history.sceneAdded");
    expect(describeChange(two, doc).key).toBe("history.sceneDeleted");

    const one = moveEntities(doc, 0, ["home-9"], { x: 2, y: 0 });
    expect(describeChange(doc, one)).toEqual({ key: "history.moved", vars: { who: "Home 9" } });

    const many = moveEntities(doc, 0, ["home-9", "home-8"], { x: 2, y: 0 });
    expect(describeChange(doc, many)).toEqual({ key: "history.movedMany", vars: { count: 2 } });

    expect(describeChange(doc, setCarrier(doc, 0, "home-9")).key).toBe("history.ball");
    expect(describeChange(doc, { ...doc, name: "Press" }).key).toBe("history.renamed");
  });
});

describe("templates", () => {
  const labels = { board: "Board", scene: (n: number) => `Scene ${n}` };

  it.each(TEMPLATE_IDS)("%s is a valid board with a ball and more than one scene", (id) => {
    const board = buildTemplate(id, labels);
    expect(boardDocSchema.safeParse(board).success).toBe(true);
    expect(board.scenes.length).toBeGreaterThan(2);
    expect(board.scenes.every((s) => s.carrier !== null || s.ballPos !== undefined)).toBe(true);
  });

  it("names its scenes in the caller's words", () => {
    const board = buildTemplate("corner", { board: "Canto", scene: (n) => `Cena ${n}` });
    expect(board.name).toBe("Canto");
    expect(board.scenes[1].name).toBe("Cena 2");
  });

  it("starts with no links — the formation's shape has been pulled apart", () => {
    for (const id of TEMPLATE_IDS) expect(buildTemplate(id, labels).links).toEqual([]);
  });

  it("keeps the shot and loft it asks for", () => {
    const corner = buildTemplate("corner", labels);
    expect(corner.scenes[1].loft).toBe(true);
    expect(corner.scenes[2].shot).toBe(true);
  });
});

describe("lineUp and spaceEvenly", () => {
  it("straighten a back four across the pitch without stacking anyone", () => {
    const ragged = moveEntities(doc, 0, ["home-5"], { x: 3, y: 0 });
    const line = lineUp(ragged, 0, BACK);
    const xs = BACK.map((id) => pos(line, id).x.toFixed(6));
    expect(new Set(xs).size).toBe(1);
    const ys = BACK.map((id) => pos(line, id).y);
    expect(new Set(ys).size).toBe(4);
  });

  it("straighten a line that runs up the pitch along its own direction", () => {
    const column = ["home-1", "home-8", "home-9"];
    const line = lineUp(moveEntities(doc, 0, ["home-8"], { x: 0, y: 2 }), 0, column);
    const ys = column.map((id) => pos(line, id).y.toFixed(6));
    expect(new Set(ys).size).toBe(1);
    expect(new Set(column.map((id) => pos(line, id).x)).size).toBe(3);
  });

  it("space a line evenly along the way it runs", () => {
    const bunched = moveEntities(doc, 0, ["home-5"], { x: 0, y: 10 });
    const even = spaceEvenly(bunched, 0, BACK);
    const ys = BACK.map((id) => pos(even, id).y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeCloseTo(ys[3] - ys[2], 6);
  });
});
