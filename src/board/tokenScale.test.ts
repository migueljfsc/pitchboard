import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  DEFAULT_TOKEN_SCALE,
  TOKEN_RADIUS,
  ballRadius,
  tokenRadius,
} from "./pitch";
import { ballGlue, frameAt } from "./timeline";
import { hitTest } from "./interaction";
import { drawBoard } from "./render";
import { createRecordingCtx } from "./recording-ctx";
import { fitViewport } from "./geometry";
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
  it("is the board default when unset, and scales token, ball and carry offset together", () => {
    expect(tokenRadius(createBoardDoc())).toBeCloseTo(TOKEN_RADIUS * DEFAULT_TOKEN_SCALE);
    expect(tokenRadius(scaled(1))).toBe(TOKEN_RADIUS);
    const big = scaled(2);
    expect(tokenRadius(big)).toBeCloseTo(TOKEN_RADIUS * 2);
    expect(ballRadius(big)).toBeCloseTo(BALL_RADIUS * 2);
    expect(ballGlue(big)).toBeCloseTo(ballGlue(scaled(1)) * 2);
  });
});

// The real risk: the renderer grows a token but hit-testing keeps the old radius, so the
// visible edge of a player stops being clickable — or an old edge stays clickable.
it("hit-testing agrees with the drawn size", () => {
  const small = scaled(1);
  const big = scaled(2);
  const tiny = scaled(0.5);
  const at = frameAt(small, 0).positions[A];
  const justOutside = { x: at.x + TOKEN_RADIUS * 1.6, y: at.y };
  expect(hitTest(small, frameAt(small, 0), justOutside, 0)).toBeNull();
  expect(hitTest(big, frameAt(big, 0), justOutside, 0)?.id).toBe(A);
  expect(hitTest(tiny, frameAt(tiny, 0), { x: at.x + TOKEN_RADIUS * 0.9, y: at.y }, 0)).toBeNull();
  for (const k of [0.5, 1, 1.7, 2.5]) {
    const doc = scaled(k);
    const f = frameAt(doc, 0);
    expect(hitTest(doc, f, f.positions[A])?.id).toBe(A);
  }
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

  it("draws a board with no tokenScale exactly as one set to the default", () => {
    const plain = createRecordingCtx();
    const explicit = createRecordingCtx();
    drawBoard(plain.ctx, createBoardDoc(), 0, view(createBoardDoc()));
    drawBoard(explicit.ctx, scaled(DEFAULT_TOKEN_SCALE), 0, view(scaled(DEFAULT_TOKEN_SCALE)));
    expect(explicit.log).toEqual(plain.log);
  });
});
