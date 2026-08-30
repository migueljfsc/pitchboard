import { describe, expect, it } from "vitest";
import {
  MARK_WIDTH,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  TEXT_SIZE,
  TEXT_WIDTH_MAX,
  TEXT_WIDTH_MIN,
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
  reorderAnnotation,
  sceneRange,
  simplify,
  straightCurve,
  strokePoints,
  textExtent,
  textLines,
  textSize,
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

describe("label size", () => {
  const label = (size?: number): Extract<Annotation, { kind: "text" }> => ({
    id: "t1",
    kind: "text",
    from: "scene-1",
    to: null,
    color: "#fff",
    at: at(50, 34),
    text: "press",
    ...(size === undefined ? {} : { size }),
  });

  it("defaults to TEXT_SIZE when no size was ever set", () => {
    expect(textSize(label())).toBe(TEXT_SIZE);
  });

  it("multiplies TEXT_SIZE, keeping the default defined in one place", () => {
    expect(textSize(label(2))).toBe(TEXT_SIZE * 2);
  });

  it("clamps rather than trusting the value — an imported board is untrusted", () => {
    expect(textSize(label(99))).toBe(TEXT_SIZE * TEXT_SCALE_MAX);
    expect(textSize(label(0))).toBe(TEXT_SIZE * TEXT_SCALE_MIN);
  });

  it("grows the selection box with the label, so a big one is still grabbable", () => {
    const small = boundsOf(label());
    const big = boundsOf(label(3));
    expect(big.w).toBeGreaterThan(small.w);
    expect(big.h).toBeCloseTo(small.h * 3, 6);
    // Centred on the anchor, which is where it is drawn.
    expect(big.x + big.w / 2).toBeCloseTo(50, 6);
    expect(big.y + big.h / 2).toBeCloseTo(34, 6);
  });

  it("reaches further for a hit the bigger it is", () => {
    let doc = board();
    const wide = { ...label(3), from: doc.scenes[0].id };
    doc = addAnnotation(doc, wide);
    const edge = textExtent(wide).w / 2;
    expect(hitTestAnnotation(doc, 0, at(50 + edge * 0.5, 34), "mark")?.id).toBe("t1");
    expect(hitTestAnnotation(doc, 0, at(50 + edge * 4, 34), "mark")).toBeNull();
  });

  it("survives a round trip through the schema", () => {
    let doc = board();
    doc = addAnnotation(doc, { ...label(1.6), from: doc.scenes[0].id });
    const parsed = boardDocSchema.parse(JSON.parse(JSON.stringify(doc)));
    expect(parsed.annotations?.[0]).toMatchObject({ kind: "text", size: 1.6 });
  });

  it("rejects a size outside the range", () => {
    let doc = board();
    doc = addAnnotation(doc, { ...label(99), from: doc.scenes[0].id });
    expect(boardDocSchema.safeParse(JSON.parse(JSON.stringify(doc))).success).toBe(false);
  });
});

describe("reorderAnnotation", () => {
  const three = () => {
    let doc = board();
    for (let i = 0; i < 3; i++) doc = addAnnotation(doc, arrow(doc));
    return doc;
  };

  it("moves a shape within the list, which is the drawing order", () => {
    const doc = three();
    const [a, b, c] = (doc.annotations ?? []).map((x) => x.id);
    expect(reorderAnnotation(doc, 0, 2).annotations?.map((x) => x.id)).toEqual([b, c, a]);
    expect(reorderAnnotation(doc, 2, 0).annotations?.map((x) => x.id)).toEqual([c, a, b]);
  });

  it("changes nothing else about the shapes", () => {
    const doc = three();
    expect(new Set(reorderAnnotation(doc, 2, 0).annotations)).toEqual(new Set(doc.annotations));
  });

  it("is a no-op for the same slot, an out-of-range move, or an empty board", () => {
    const doc = three();
    expect(reorderAnnotation(doc, 1, 1)).toBe(doc);
    expect(reorderAnnotation(doc, -1, 0)).toBe(doc);
    expect(reorderAnnotation(doc, 0, 9)).toBe(doc);
    const blank = board();
    expect(reorderAnnotation(blank, 0, 1)).toBe(blank);
  });

  it("leaves a valid document", () => {
    expect(boardDocSchema.safeParse(reorderAnnotation(three(), 0, 2)).success).toBe(true);
  });
});

describe("a shape's own name", () => {
  it("round-trips through the schema", () => {
    let doc = board();
    doc = addAnnotation(doc, { ...arrow(doc), name: "Press trigger" });
    const parsed = boardDocSchema.parse(JSON.parse(JSON.stringify(doc)));
    expect(parsed.annotations?.[0].name).toBe("Press trigger");
  });

  it("is optional — a shape drawn before names existed still parses", () => {
    let doc = board();
    doc = addAnnotation(doc, arrow(doc));
    expect("name" in (doc.annotations?.[0] ?? {})).toBe(false);
    expect(boardDocSchema.safeParse(JSON.parse(JSON.stringify(doc))).success).toBe(true);
  });
});

describe("text boxes", () => {
  const label = (over: Partial<Extract<Annotation, { kind: "text" }>> = {}) =>
    ({
      id: "t1",
      kind: "text",
      color: "#fff",
      from: "s1",
      at: { x: 50, y: 30 },
      text: "hello",
      ...over,
    }) as Extract<Annotation, { kind: "text" }>;

  it("is one line when it has no box, however long", () => {
    const lines = textLines(label({ text: "a fairly long note with several words in it" }));
    expect(lines).toEqual(["a fairly long note with several words in it"]);
  });

  // The thing that was missing: without a width there is nowhere for a second line to go.
  it("wraps on words once it has a width", () => {
    const lines = textLines(label({ text: "press high and force it wide", width: 12 }));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("press high and force it wide");
  });

  it("breaks on explicit newlines with or without a box", () => {
    expect(textLines(label({ text: "one\ntwo" }))).toEqual(["one", "two"]);
    expect(textLines(label({ text: "one\ntwo", width: 40 }))).toEqual(["one", "two"]);
  });

  it("keeps a blank line as a blank line", () => {
    expect(textLines(label({ text: "one\n\ntwo", width: 40 }))).toEqual(["one", "", "two"]);
  });

  // Hyphenating a name to fit is worse than a line that sticks out, and the author can widen
  // the box. What matters is that it terminates rather than looping on an empty line.
  it("lets a single over-long word overflow rather than looping", () => {
    const lines = textLines(label({ text: "Wolverhampton", width: TEXT_WIDTH_MIN }));
    expect(lines).toEqual(["Wolverhampton"]);
  });

  it("grows in height as it wraps, and keeps the width it was given", () => {
    const narrow = label({ text: "press high and force it wide", width: 12 });
    const wide = label({ text: "press high and force it wide", width: 60 });
    expect(textExtent(narrow).h).toBeGreaterThan(textExtent(wide).h);
    expect(textExtent(narrow).w).toBe(12);
  });

  it("offers a width handle on the right edge, and dragging it resizes the box", () => {
    const ann = label({ width: 20 });
    const handles = annotationHandles(ann);
    expect(handles.map((h) => h.which).sort()).toEqual(["at", "w"]);
    expect(handles.find((h) => h.which === "w")?.at).toEqual({ x: 60, y: 30 });

    // Doubled, because the box is centred on `at`.
    expect(dragAnnotationHandle(ann, "w", { x: 65, y: 30 })).toEqual({ width: 30 });
  });

  it("clamps a dragged width rather than letting it invert or swallow the pitch", () => {
    const ann = label({ width: 20 });
    expect(dragAnnotationHandle(ann, "w", { x: 10, y: 30 })).toEqual({ width: TEXT_WIDTH_MIN });
    expect(dragAnnotationHandle(ann, "w", { x: 900, y: 30 })).toEqual({ width: TEXT_WIDTH_MAX });
  });

  it("still moves on the `at` handle", () => {
    expect(dragAnnotationHandle(label(), "at", { x: 1, y: 2 })).toEqual({ at: { x: 1, y: 2 } });
  });

  // A label stays upright while the board turns, so on a vertical board its lines run along
  // pitch y. The geometry has to turn with the words or the box and its handle sit ninety
  // degrees from the label they belong to.
  it("turns its box and its width handle with a vertical board", () => {
    const ann = label({ width: 20 });
    const flat = boundsOf(ann);
    const vertical = boundsOf(ann, true);
    expect(vertical.w).toBeCloseTo(flat.h, 6);
    expect(vertical.h).toBeCloseTo(flat.w, 6);

    expect(annotationHandles(ann, true).find((h) => h.which === "w")?.at).toEqual({
      x: 50,
      y: 40,
    });
  });

  it("reads a rotated resize drag along pitch y, and ignores the other axis", () => {
    const ann = label({ width: 20 });
    expect(dragAnnotationHandle(ann, "w", { x: 50, y: 45 }, true)).toEqual({ width: 30 });
    expect(dragAnnotationHandle(ann, "w", { x: 999, y: 45 }, true)).toEqual({ width: 30 });
  });

  it("takes a click where the words are, not where they would be unrotated", () => {
    let doc = board();
    doc = addAnnotation(doc, { ...label({ width: 20 }), from: doc.scenes[0].id });
    // Eight metres up the pitch: inside a vertical label, well outside a flat one.
    const along = at(50, 38);
    expect(hitTestAnnotation(doc, 0, along, "mark", true)?.id).toBe("t1");
    expect(hitTestAnnotation(doc, 0, along, "mark")).toBeNull();
  });
});
