import { describe, expect, it } from "vitest";
import { drawBoard, TOKEN_RADIUS } from "./render";
import { frameAt } from "./timeline";
import { createRecordingCtx } from "./recording-ctx";
import { createBoardDoc } from "@/formations";
import { fitViewport } from "./geometry";
import { BALL_ID, type RenderView } from "./types";

const W = 1200;
const H = 800;

function view(overrides: Partial<RenderView> = {}): RenderView {
  const doc = createBoardDoc();
  return {
    ...fitViewport(W, H, doc.pitch.length, doc.pitch.width),
    width: W,
    height: H,
    interactive: true,
    ...overrides,
  };
}

describe("drawBoard", () => {
  it("is deterministic — same inputs, identical command log", () => {
    const doc = createBoardDoc();
    const a = createRecordingCtx();
    const b = createRecordingCtx();
    drawBoard(a.ctx, doc, 0, view());
    drawBoard(b.ctx, doc, 0, view());
    expect(a.log).toEqual(b.log);
  });

  it("paints the full surround so one call yields a complete frame", () => {
    const r = createRecordingCtx();
    drawBoard(r.ctx, createBoardDoc(), 0, view());
    // First fill covers the whole canvas, before any transform is applied.
    expect(r.calls("fillRect")[0]).toBe(`fillRect(0,0,${W},${H})`);
  });

  it("applies the viewport transform then works in metres", () => {
    const r = createRecordingCtx();
    const v = view();
    drawBoard(r.ctx, createBoardDoc(), 0, v);
    expect(r.log).toContain(`translate(${round(v.offsetX)},${round(v.offsetY)})`);
    expect(r.log).toContain(`scale(${round(v.scale)},${round(v.scale)})`);
  });

  it("balances save and restore", () => {
    const r = createRecordingCtx();
    drawBoard(r.ctx, createBoardDoc(), 0, view());
    expect(r.count("save")).toBe(r.count("restore"));
  });

  it("draws the pitch before any token — order is load-bearing", () => {
    const r = createRecordingCtx();
    const doc = createBoardDoc();
    drawBoard(r.ctx, doc, 0, view());

    const halfway = r.log.findIndex((e) => e.startsWith(`moveTo(${round(doc.pitch.length / 2)},0)`));
    const firstToken = r.log.findIndex((e) => e.includes(`,${TOKEN_RADIUS},0,6.283`));
    expect(halfway).toBeGreaterThan(-1);
    expect(firstToken).toBeGreaterThan(halfway);
  });

  it("draws one token arc per player, and the ball above them", () => {
    const doc = createBoardDoc();
    const r = createRecordingCtx();
    drawBoard(r.ctx, doc, 0, view());

    const players = doc.teams[0].players.length + doc.teams[1].players.length;
    const tokenArcs = r.calls("arc").filter((c) => c.includes(`,${TOKEN_RADIUS},0,6.283`));
    expect(tokenArcs).toHaveLength(players);

    const lastToken = r.log.lastIndexOf(tokenArcs[tokenArcs.length - 1]);
    const ballArc = r.log.findIndex((e) => e.startsWith("arc(52.5,34,0.45"));
    expect(ballArc).toBeGreaterThan(lastToken);
  });

  it("renders the penalty arc centred on the spot, not on the box edge", () => {
    const r = createRecordingCtx();
    drawBoard(r.ctx, createBoardDoc(), 0, view());
    // Centre x is the penalty spot (11), radius 9.15 — not x=16.5.
    expect(r.calls("arc").some((c) => c.startsWith("arc(11,34,9.15"))).toBe(true);
    expect(r.calls("arc").some((c) => c.startsWith("arc(16.5,34,9.15"))).toBe(false);
  });

  it("suppresses editor chrome when not interactive — the export path", () => {
    const doc = createBoardDoc();
    const selection = new Set([doc.teams[0].players[0].id]);
    const marquee = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } };

    const editor = createRecordingCtx();
    drawBoard(editor.ctx, doc, 0, view({ selection, hover: doc.teams[0].players[1].id, marquee }));

    const exported = createRecordingCtx();
    drawBoard(exported.ctx, doc, 0, view({ interactive: false, selection, hover: null, marquee }));

    // No marquee in the export.
    expect(editor.count("setLineDash")).toBeGreaterThan(0);
    expect(exported.count("setLineDash")).toBe(0);
    // Hover ring present in the editor only.
    expect(editor.count("arc")).toBeGreaterThan(exported.count("arc"));
  });
});

describe("frameAt", () => {
  it("places a loose ball at its stored position", () => {
    const doc = createBoardDoc();
    expect(frameAt(doc, 0).ball).toEqual(doc.scenes[0].ballPos);
  });

  it("glues a carried ball beside its carrier", () => {
    const doc = createBoardDoc();
    const carrier = doc.teams[0].players[5].id;
    doc.scenes[0].carrier = carrier;
    delete doc.scenes[0].ballPos;

    const ball = frameAt(doc, 0).ball;
    const at = doc.scenes[0].positions[carrier];
    expect(ball.y).toBeCloseTo(at.y);
    expect(ball.x).toBeGreaterThan(at.x);
    // Clear of the token so the shirt number stays readable.
    expect(ball.x - at.x).toBeGreaterThanOrEqual(TOKEN_RADIUS);
  });

  it("ignores the ball id in positions — it is derived, never stored", () => {
    const doc = createBoardDoc();
    expect(doc.scenes[0].positions[BALL_ID]).toBeUndefined();
  });
});

const round = (n: number) => Math.round(n * 1000) / 1000;
