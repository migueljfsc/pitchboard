import { describe, expect, it } from "vitest";
import {
  MARK_WIDTH,
  addAnnotation,
  annotationHandles,
  boundsOf,
  deleteAnnotation,
  draftAnnotation,
  dragAnnotationHandle,
  isVisibleAt,
  moveAnnotation,
  polylineLength,
  pruneAnnotations,
  sceneRange,
  simplify,
  straightCurve,
  strokePoints,
  updateAnnotation,
  visibleAt,
  wavy,
} from "./annotations";
import { hitTestAnnotation, hitTestAnnotationHandle, layerOf } from "./interaction";
import { addSceneAfter, deleteScene, moveScene } from "./scenes";
import { boardDocSchema } from "./schema";
import { createBoardDoc } from "@/formations";
import type { Annotation, BoardDoc, Vec2 } from "./types";

const at = (x: number, y: number): Vec2 => ({ x, y });

/** A board with the given annotations and enough scenes to range across. */
function board(scenes = 1): BoardDoc {
  let doc = createBoardDoc();
  for (let i = 1; i < scenes; i++) doc = addSceneAfter(doc, i - 1);
  return doc;
}

const arrow = (doc: BoardDoc, from = doc.scenes[0].id, to: string | null = null): Annotation => ({
  ...draftAnnotation(doc, "arrow", from, at(20, 20), at(40, 20), { color: "#fff" }),
  to,
});

describe("scene range", () => {
  it("covers a single scene when both ends name it", () => {
    const doc = board(3);
    const ann = arrow(doc, doc.scenes[1].id, doc.scenes[1].id);
    expect(sceneRange(doc, ann)).toEqual([1, 1]);
    expect(isVisibleAt(doc, ann, 0)).toBe(false);
    expect(isVisibleAt(doc, ann, 1)).toBe(true);
    expect(isVisibleAt(doc, ann, 2)).toBe(false);
  });

  it("runs to the end of the timeline when `to` is null", () => {
    const doc = board(3);
    const ann = arrow(doc, doc.scenes[1].id, null);
    expect(sceneRange(doc, ann)).toEqual([1, 2]);
    expect([0, 1, 2].map((i) => isVisibleAt(doc, ann, i))).toEqual([false, true, true]);
  });

  it("reads a backwards range as the scenes between its ends", () => {
    const doc = board(3);
    const ann = arrow(doc, doc.scenes[2].id, doc.scenes[0].id);
    expect(sceneRange(doc, ann)).toEqual([0, 2]);
  });

  it("hides a hidden annotation on every scene", () => {
    const doc = board(2);
    const ann = { ...arrow(doc), hidden: true };
    expect([0, 1].every((i) => !isVisibleAt(doc, ann, i))).toBe(true);
  });

  it("travels with a scene that is reordered, because it stores an id", () => {
    let doc = board(3);
    doc = addAnnotation(doc, arrow(doc, doc.scenes[2].id, doc.scenes[2].id));
    expect(sceneRange(doc, doc.annotations![0])).toEqual([2, 2]);

    doc = moveScene(doc, 2, 0);
    // Same scene, now first. An index would have left the drawing behind.
    expect(sceneRange(doc, doc.annotations![0])).toEqual([0, 0]);
  });

  it("only lists what is visible on the scene asked for", () => {
    let doc = board(2);
    doc = addAnnotation(doc, arrow(doc, doc.scenes[0].id, doc.scenes[0].id));
    doc = addAnnotation(doc, arrow(doc, doc.scenes[1].id, doc.scenes[1].id));
    expect(visibleAt(doc, 0)).toHaveLength(1);
    expect(visibleAt(doc, 1)).toHaveLength(1);
    expect(visibleAt(doc, 0)[0].id).not.toBe(visibleAt(doc, 1)[0].id);
  });
});

describe("pruning", () => {
  it("keeps the drawing when its scene is deleted, pulling the range back", () => {
    let doc = board(3);
    const doomed = doc.scenes[1].id;
    doc = addAnnotation(doc, arrow(doc, doomed, doomed));
    doc = deleteScene(doc, 1);

    // Losing a drawing because a scene went would be the worse trade.
    expect(doc.annotations).toHaveLength(1);
    expect(doc.annotations![0].from).toBe(doc.scenes[0].id);
    expect(doc.annotations![0].to).toBeNull();
    expect(() => boardDocSchema.parse(JSON.parse(JSON.stringify(doc)))).not.toThrow();
  });

  it("leaves an intact document untouched", () => {
    let doc = board(2);
    doc = addAnnotation(doc, arrow(doc));
    expect(pruneAnnotations(doc)).toBe(doc);
  });

  it("is a no-op on a board with no annotations", () => {
    const doc = board(2);
    expect(pruneAnnotations(doc)).toBe(doc);
  });
});

describe("geometry", () => {
  it("strokes an unbent arrow as its two endpoints", () => {
    const doc = board();
    expect(strokePoints(arrow(doc))).toEqual([at(20, 20), at(40, 20)]);
  });

  it("samples a bent arrow along its curve", () => {
    const doc = board();
    const bent: Annotation = { ...arrow(doc), curve: { c1: at(25, 10), c2: at(35, 10) } } as Annotation;
    const points = strokePoints(bent, 16);
    expect(points).toHaveLength(17);
    expect(points[0]).toEqual(at(20, 20));
    expect(points[16].x).toBeCloseTo(40);
    // The control points pull it off the straight line between the ends.
    expect(Math.min(...points.map((p) => p.y))).toBeLessThan(19);
  });

  it("synthesises control points that trace a straight line", () => {
    const c = straightCurve(at(0, 0), at(30, 0));
    expect(c.c1).toEqual(at(10, 0));
    expect(c.c2).toEqual(at(20, 0));
  });

  it("normalises bounds however the box was dragged", () => {
    const doc = board();
    const forwards = draftAnnotation(doc, "rect", doc.scenes[0].id, at(10, 10), at(30, 25), {
      color: "#fff",
    });
    const backwards = draftAnnotation(doc, "rect", doc.scenes[0].id, at(30, 25), at(10, 10), {
      color: "#fff",
    });
    expect(boundsOf(forwards)).toEqual({ x: 10, y: 10, w: 20, h: 15 });
    expect(boundsOf(backwards)).toEqual(boundsOf(forwards));
  });

  it("bounds a pen stroke around every point", () => {
    const doc = board();
    const pen = draftAnnotation(doc, "pen", doc.scenes[0].id, at(0, 0), at(0, 0), {
      color: "#fff",
      points: [at(10, 10), at(4, 30), at(22, 12)],
    });
    expect(boundsOf(pen)).toEqual({ x: 4, y: 10, w: 18, h: 20 });
  });
});

describe("wavy", () => {
  const line = [at(0, 34), at(30, 34)];

  it("returns to the centreline at both ends", () => {
    const w = wavy(line);
    expect(w[0].x).toBeCloseTo(0);
    expect(w[0].y).toBeCloseTo(34);
    expect(w[w.length - 1].x).toBeCloseTo(30);
    expect(w[w.length - 1].y).toBeCloseTo(34);
  });

  it("actually departs from the line in between", () => {
    const w = wavy(line);
    const swing = Math.max(...w.map((p) => Math.abs(p.y - 34)));
    expect(swing).toBeGreaterThan(0.2);
  });

  it("is longer than the line it squiggles along", () => {
    expect(polylineLength(wavy(line))).toBeGreaterThan(polylineLength(line));
  });

  it("leaves a line shorter than one wavelength alone", () => {
    const stub = [at(0, 34), at(1, 34)];
    expect(wavy(stub)).toBe(stub);
  });
});

describe("simplify", () => {
  it("reduces a straight run of samples to its endpoints", () => {
    const points = Array.from({ length: 50 }, (_, i) => at(i, 34));
    expect(simplify(points)).toEqual([at(0, 34), at(49, 34)]);
  });

  it("keeps a corner", () => {
    const points = [at(0, 0), at(5, 0), at(10, 0), at(10, 5), at(10, 10)];
    expect(simplify(points)).toEqual([at(0, 0), at(10, 0), at(10, 10)]);
  });

  it("never moves the ends", () => {
    const points = Array.from({ length: 40 }, (_, i) => at(i, 34 + Math.sin(i) * 0.05));
    const out = simplify(points);
    expect(out[0]).toEqual(points[0]);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
    expect(out.length).toBeLessThan(points.length);
  });
});

describe("editing", () => {
  it("adds, updates and deletes", () => {
    let doc = board();
    const ann = arrow(doc);
    doc = addAnnotation(doc, ann);
    expect(doc.annotations).toHaveLength(1);

    doc = updateAnnotation(doc, ann.id, { color: "#ff0000" });
    expect(doc.annotations![0].color).toBe("#ff0000");

    doc = deleteAnnotation(doc, ann.id);
    expect(doc.annotations).toHaveLength(0);
  });

  it("ignores an update or delete for an id that is not there", () => {
    const doc = addAnnotation(board(), arrow(board()));
    expect(updateAnnotation(doc, "nope", { color: "#000" })).toBe(doc);
    expect(deleteAnnotation(doc, "nope")).toBe(doc);
  });

  it("gives every annotation a distinct id", () => {
    let doc = board();
    for (let i = 0; i < 5; i++) doc = addAnnotation(doc, arrow(doc));
    expect(new Set(doc.annotations!.map((a) => a.id)).size).toBe(5);
  });

  it("moves every point of a shape by the same delta, curve included", () => {
    let doc = board();
    const bent = { ...arrow(doc), curve: { c1: at(25, 10), c2: at(35, 10) } } as Annotation;
    doc = moveAnnotation(addAnnotation(doc, bent), bent.id, at(5, -3));

    const moved = doc.annotations![0] as Extract<Annotation, { kind: "arrow" }>;
    expect(moved.a).toEqual(at(25, 17));
    expect(moved.b).toEqual(at(45, 17));
    expect(moved.curve).toEqual({ c1: at(30, 7), c2: at(40, 7) });
  });

  it("moves a pen stroke point by point", () => {
    let doc = board();
    const pen = draftAnnotation(doc, "pen", doc.scenes[0].id, at(0, 0), at(0, 0), {
      color: "#fff",
      points: [at(10, 10), at(20, 20)],
    });
    doc = moveAnnotation(addAnnotation(doc, pen), pen.id, at(1, 1));
    expect((doc.annotations![0] as Extract<Annotation, { kind: "pen" }>).points).toEqual([
      at(11, 11),
      at(21, 21),
    ]);
  });
});

describe("handles", () => {
  it("offers both ends and two control points on an arrow", () => {
    const doc = board();
    expect(annotationHandles(arrow(doc)).map((h) => h.which)).toEqual(["a", "b", "c1", "c2"]);
  });

  it("offers only the corners on a zone", () => {
    const doc = board();
    const rect = draftAnnotation(doc, "rect", doc.scenes[0].id, at(10, 10), at(20, 20), {
      color: "#fff",
    });
    expect(annotationHandles(rect).map((h) => h.which)).toEqual(["a", "b"]);
  });

  it("offers none on a pen stroke — redrawing beats vertex surgery", () => {
    const doc = board();
    const pen = draftAnnotation(doc, "pen", doc.scenes[0].id, at(0, 0), at(1, 1), {
      color: "#fff",
      points: [at(0, 0), at(1, 1)],
    });
    expect(annotationHandles(pen)).toEqual([]);
  });

  it("materialises a real curve the first time a control point is dragged", () => {
    const doc = board();
    const straight = arrow(doc) as Extract<Annotation, { kind: "arrow" }>;
    expect(straight.curve).toBeNull();

    const patch = dragAnnotationHandle(straight, "c1", at(26, 12));
    expect(patch).toEqual({ curve: { c1: at(26, 12), c2: at(100 / 3, 20) } });
  });

  it("moves an endpoint without touching the other", () => {
    const doc = board();
    expect(dragAnnotationHandle(arrow(doc), "b", at(50, 50))).toEqual({ b: at(50, 50) });
  });
});

describe("hit-testing", () => {
  const scene = 0;

  it("catches a click on the line of an arrow, and misses one beside it", () => {
    let doc = board();
    const ann = arrow(doc);
    doc = addAnnotation(doc, ann);

    expect(hitTestAnnotation(doc, scene, at(30, 20), "mark")?.id).toBe(ann.id);
    // Just off the stroke still counts: the grab margin makes a 0.42 m line
    // catchable without pixel-hunting.
    expect(hitTestAnnotation(doc, scene, at(30, 20 + MARK_WIDTH), "mark")?.id).toBe(ann.id);
    expect(hitTestAnnotation(doc, scene, at(30, 25), "mark")).toBeNull();
  });

  it("catches a click anywhere inside a zone", () => {
    let doc = board();
    const rect = draftAnnotation(doc, "rect", doc.scenes[0].id, at(10, 10), at(30, 30), {
      color: "#fff",
    });
    doc = addAnnotation(doc, rect);

    expect(hitTestAnnotation(doc, scene, at(20, 20), "zone")?.id).toBe(rect.id);
    expect(hitTestAnnotation(doc, scene, at(40, 20), "zone")).toBeNull();
  });

  it("respects an ellipse's corners, which a rectangle would claim", () => {
    let doc = board();
    const ell = draftAnnotation(doc, "ellipse", doc.scenes[0].id, at(10, 10), at(30, 30), {
      color: "#fff",
    });
    doc = addAnnotation(doc, ell);

    expect(hitTestAnnotation(doc, scene, at(20, 20), "zone")?.id).toBe(ell.id);
    // Inside the bounding box, outside the ellipse.
    expect(hitTestAnnotation(doc, scene, at(11, 11), "zone")).toBeNull();
  });

  it("keeps the layers apart, so a zone never steals a click from a mark", () => {
    let doc = board();
    const rect = draftAnnotation(doc, "rect", doc.scenes[0].id, at(10, 10), at(50, 50), {
      color: "#fff",
    });
    doc = addAnnotation(doc, rect);

    expect(hitTestAnnotation(doc, scene, at(30, 20), "mark")).toBeNull();
    expect(hitTestAnnotation(doc, scene, at(30, 20), "zone")?.id).toBe(rect.id);
    expect(layerOf(rect)).toBe("zone");
  });

  it("returns the topmost of two overlapping shapes", () => {
    let doc = board();
    const under = arrow(doc);
    doc = addAnnotation(doc, under);
    const over = arrow(doc);
    doc = addAnnotation(doc, over);

    expect(hitTestAnnotation(doc, scene, at(30, 20), "mark")?.id).toBe(over.id);
  });

  it("ignores an annotation that is not visible on this scene", () => {
    let doc = board(2);
    const ann = arrow(doc, doc.scenes[1].id, doc.scenes[1].id);
    doc = addAnnotation(doc, ann);

    expect(hitTestAnnotation(doc, 0, at(30, 20), "mark")).toBeNull();
    expect(hitTestAnnotation(doc, 1, at(30, 20), "mark")?.id).toBe(ann.id);
  });

  it("finds a handle only on the selected annotation", () => {
    let doc = board();
    const ann = arrow(doc);
    doc = addAnnotation(doc, ann);

    expect(hitTestAnnotationHandle(doc, scene, null, at(20, 20))).toBeNull();
    expect(hitTestAnnotationHandle(doc, scene, ann.id, at(20, 20))).toEqual({
      id: ann.id,
      which: "a",
    });
  });
});

describe("schema", () => {
  it("round-trips every shape", () => {
    let doc = board(2);
    const sceneId = doc.scenes[0].id;
    doc = addAnnotation(doc, draftAnnotation(doc, "arrow", sceneId, at(1, 1), at(9, 9), { color: "#fff", dash: "dashed" }));
    doc = addAnnotation(doc, draftAnnotation(doc, "line", sceneId, at(1, 1), at(9, 9), { color: "#fff", dash: "wavy" }));
    doc = addAnnotation(doc, draftAnnotation(doc, "rect", sceneId, at(1, 1), at(9, 9), { color: "#fff" }));
    doc = addAnnotation(doc, draftAnnotation(doc, "ellipse", sceneId, at(1, 1), at(9, 9), { color: "#fff" }));
    doc = addAnnotation(doc, draftAnnotation(doc, "pen", sceneId, at(1, 1), at(9, 9), { color: "#fff", points: [at(1, 1), at(5, 5)] }));
    doc = addAnnotation(doc, draftAnnotation(doc, "text", sceneId, at(1, 1), at(9, 9), { color: "#fff", text: "press here" }));

    const parsed = boardDocSchema.parse(JSON.parse(JSON.stringify(doc)));
    expect(parsed.annotations).toHaveLength(6);
  });

  it("still accepts a board drawn before annotations existed", () => {
    const doc = board();
    expect(doc.annotations).toBeUndefined();
    expect(() => boardDocSchema.parse(JSON.parse(JSON.stringify(doc)))).not.toThrow();
  });

  it("rejects a range pointing at a scene that does not exist", () => {
    let doc = board();
    doc = addAnnotation(doc, arrow(doc, "no-such-scene"));
    expect(() => boardDocSchema.parse(JSON.parse(JSON.stringify(doc)))).toThrow();
  });
});
