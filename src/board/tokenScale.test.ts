import { describe, expect, it } from "vitest";
import { BALL_RADIUS, TOKEN_RADIUS, ballRadius, tokenRadius, tokenScaleOf } from "./pitch";
import { ballGlue, frameAt } from "./timeline";
import { hitTest } from "./interaction";
import { drawBoard } from "./render";
import { createRecordingCtx } from "./recording-ctx";
import { fitViewport } from "./geometry";
import { boardDocSchema } from "./schema";
import { createBoardDoc } from "@/formations";
import type { BoardDoc, RenderView } from "./types";

const scaled = (k?: number): BoardDoc => ({ ...createBoardDoc(), tokenScale: k });
const A = "home-9";

function view(doc: BoardDoc): RenderView {
  return {
    ...fitViewport(1200, 800, doc.pitch.length, doc.pitch.width),
    width: 1200,
    height: 800,
    interactive: false,
  };
}

describe("tokenScaleOf", () => {
  it("defaults to 1 when unset, so old documents are unaffected", () => {
    expect(tokenScaleOf(createBoardDoc())).toBe(1);
    expect(tokenRadius(createBoardDoc())).toBe(TOKEN_RADIUS);
    expect(ballRadius(createBoardDoc())).toBe(BALL_RADIUS);
  });

  it("scales the token, the ball and the carry offset together", () => {
    const big = scaled(2);
    expect(tokenRadius(big)).toBeCloseTo(TOKEN_RADIUS * 2);
    expect(ballRadius(big)).toBeCloseTo(BALL_RADIUS * 2);
    expect(ballGlue(big)).toBeCloseTo(ballGlue(createBoardDoc()) * 2);
  });
});

describe("hit-testing agrees with the drawn size", () => {
  // The real risk: the renderer grows a token but hit-testing keeps the old
  // radius, so the visible edge of a player stops being clickable.
  it("a point outside a small token is inside a large one", () => {
    const small = scaled(1);
    const big = scaled(2);
    const at = frameAt(small, 0).positions[A];
    const justOutside = { x: at.x + TOKEN_RADIUS * 1.6, y: at.y };

    expect(hitTest(small, frameAt(small, 0), justOutside, 0)).toBeNull();
    expect(hitTest(big, frameAt(big, 0), justOutside, 0)?.id).toBe(A);
  });

  it("a shrunken token stops being clickable at its old edge", () => {
    const tiny = scaled(0.5);
    const at = frameAt(tiny, 0).positions[A];
    const oldEdge = { x: at.x + TOKEN_RADIUS * 0.9, y: at.y };
    expect(hitTest(tiny, frameAt(tiny, 0), oldEdge, 0)).toBeNull();
  });

  it("the centre is always a hit, at any scale", () => {
    for (const k of [0.5, 1, 1.7, 2.5]) {
      const doc = scaled(k);
      const f = frameAt(doc, 0);
      expect(hitTest(doc, f, f.positions[A])?.id).toBe(A);
    }
  });
});

describe("rendering", () => {
  it("draws token arcs at the scaled radius", () => {
    const doc = scaled(1.5);
    const r = createRecordingCtx();
    drawBoard(r.ctx, doc, 0, view(doc));

    const expected = (TOKEN_RADIUS * 1.5).toFixed(3).replace(/\.?0+$/, "");
    const arcs = r.calls("arc").filter((c) => c.includes(`,${expected},0,6.283`));
    expect(arcs).toHaveLength(doc.teams[0].players.length + doc.teams[1].players.length);
  });

  it("scales the shirt number with the token, not just the circle", () => {
    const r = createRecordingCtx();
    const doc = scaled(2);
    drawBoard(r.ctx, doc, 0, view(doc));
    // 1.25px at scale 1 becomes 2.5px at scale 2.
    expect(r.log.some((l) => l.startsWith('font="600 2.5px'))).toBe(true);
  });

  it("leaves a scale-1 board byte-identical to one with no tokenScale at all", () => {
    const plain = createRecordingCtx();
    const explicit = createRecordingCtx();
    drawBoard(plain.ctx, createBoardDoc(), 0, view(createBoardDoc()));
    drawBoard(explicit.ctx, scaled(1), 0, view(scaled(1)));
    expect(explicit.log).toEqual(plain.log);
  });
});

describe("schema", () => {
  it("accepts the supported range and rejects beyond it", () => {
    expect(boardDocSchema.safeParse(scaled(0.5)).success).toBe(true);
    expect(boardDocSchema.safeParse(scaled(2.5)).success).toBe(true);
    expect(boardDocSchema.safeParse(scaled(0.1)).success).toBe(false);
    expect(boardDocSchema.safeParse(scaled(9)).success).toBe(false);
  });

  it("accepts a document without the field", () => {
    expect(boardDocSchema.safeParse(createBoardDoc()).success).toBe(true);
  });
});
