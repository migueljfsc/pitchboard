import { describe, expect, it } from "vitest";
import { TEXT_BG_PAD, addAnnotation, boundsOf, textSize } from "./annotations";
import { snapLabel } from "./interaction";
import { createBoardDoc } from "@/formations";
import type { Annotation, BoardDoc } from "./types";

type Text = Extract<Annotation, { kind: "text" }>;

const board = (): BoardDoc => ({ ...createBoardDoc(), annotations: [] });
const label = (doc: BoardDoc, id: string, at: { x: number; y: number }, text = "Press here"): Text => ({
  id,
  kind: "text",
  color: "#fff",
  from: doc.scenes[0].id,
  to: null,
  at,
  text,
});

describe("snapLabel", () => {
  it("draws a label's centre onto the halfway line, and says so", () => {
    const doc = board();
    const ann = label(doc, "t1", { x: 52.1, y: 20 });
    const { at, guides } = snapLabel(doc, 0, ann, ann.at, false);
    expect(at).toEqual({ x: 52.5, y: 20 });
    expect(guides).toEqual([{ x: 52.5 }]);
  });

  it("leaves a label alone with no line within reach", () => {
    const doc = board();
    const ann = label(doc, "t1", { x: 40, y: 27 });
    expect(snapLabel(doc, 0, ann, ann.at, false)).toEqual({ at: { x: 40, y: 27 }, guides: [] });
  });

  // Canva's other half: lining a note up with another one, by an edge as well as the middle.
  it("lines a label's left edge up with another label's", () => {
    let doc = board();
    const other = label(doc, "t0", { x: 30, y: 40 }, "A much longer note than the other");
    doc = addAnnotation(doc, other);
    const pad = (a: Text) => textSize(a) * TEXT_BG_PAD;
    const left = boundsOf(other).x - pad(other);

    const ann = label(doc, "t1", { x: 0, y: 30 }, "Short");
    const halfBox = boundsOf(ann).w / 2 + pad(ann);
    const near = { x: left + halfBox + 0.3, y: 30 };
    const { at, guides } = snapLabel(doc, 0, ann, near, false);
    expect(at.x - halfBox).toBeCloseTo(left, 9);
    expect(guides).toContainEqual({ x: left });
  });

  // On half a pitch the middle of the frame is the middle of that half, which no marking is.
  it("draws a label onto the middle of the frame on a half view, and only there", () => {
    const doc = board();
    const ann = label(doc, "t1", { x: 78.5, y: 20 });
    expect(snapLabel(doc, 0, ann, ann.at, false, "right")).toEqual({
      at: { x: 78.75, y: 20 },
      guides: [{ x: 78.75 }],
    });
    expect(snapLabel(doc, 0, ann, ann.at, false).at.x).toBe(78.5);
    expect(snapLabel(doc, 0, label(doc, "t1", { x: 26, y: 20 }, "x"), { x: 26, y: 20 }, false, "left").at.x).toBe(26.25);
  });

  it("takes the nearer of two lines on the same axis", () => {
    const doc = board();
    // 16.5 is the box's edge; 11 the penalty spot. Centred at 16.3, the box edge is nearer.
    const ann = label(doc, "t1", { x: 16.3, y: 20 }, "x");
    expect(snapLabel(doc, 0, ann, ann.at, false).at.x).toBeCloseTo(16.5, 9);
  });
});
