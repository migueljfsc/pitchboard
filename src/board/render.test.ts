import { describe, expect, it } from "vitest";
import { drawBoard, TOKEN_RADIUS } from "./render";
import { frameAt } from "./timeline";
import { createRecordingCtx } from "./recording-ctx";
import { createBoardDoc } from "@/formations";
import { fitViewport, viewMatrix } from "./geometry";
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

  it("applies the viewport as one matrix, then works in metres", () => {
    const r = createRecordingCtx();
    const v = view();
    drawBoard(r.ctx, createBoardDoc(), 0, v);
    const [a, b, c, d, e, f] = viewMatrix(v);
    expect(r.log).toContain(
      `transform(${round(a)},${round(b)},${round(c)},${round(d)},${round(e)},${round(f)})`,
    );
  });

  it("rotates via the matrix, changing no geometry — only text counter-rotates", () => {
    const doc = createBoardDoc();
    const flat = createRecordingCtx();
    const turned = createRecordingCtx();

    drawBoard(flat.ctx, doc, 0, view());
    drawBoard(
      turned.ctx,
      doc,
      0,
      view({ ...fitViewport(W, H, doc.pitch.length, doc.pitch.width, { half: "full", rotated: true }) }),
    );

    // Every metre-space drawing command is byte-identical: rotation is a viewport
    // concern, not a second rendering path to keep in step.
    const geometry = (log: string[]) =>
      log.filter((l) => !l.startsWith("transform(") && !l.startsWith("rotate("));
    expect(geometry(turned.log)).toEqual(geometry(flat.log));
    expect(turned.calls("transform")[0]).not.toBe(flat.calls("transform")[0]);

    // ...except that each token's text is counter-rotated so numbers stay upright.
    const players = doc.teams[0].players.length + doc.teams[1].players.length;
    expect(flat.count("rotate")).toBe(0);
    expect(turned.count("rotate")).toBe(players);
  });

  it("counter-rotates distance labels too", () => {
    const doc = createBoardDoc();
    doc.links = doc.links.map((l) => ({ ...l, showDistances: true }));
    const labels = doc.links.reduce(
      (n, l) => n + (l.style === "chain" || l.members.length < 3 ? l.members.length - 1 : l.members.length),
      0,
    );

    const turned = createRecordingCtx();
    drawBoard(
      turned.ctx,
      doc,
      0,
      view({ ...fitViewport(W, H, doc.pitch.length, doc.pitch.width, { half: "full", rotated: true }) }),
    );

    const players = doc.teams[0].players.length + doc.teams[1].players.length;
    expect(turned.count("rotate")).toBe(players + labels);
  });

  it("clips to a half, so the other half cannot spill into spare canvas", () => {
    const doc = createBoardDoc();
    const full = createRecordingCtx();
    drawBoard(full.ctx, doc, 0, view());
    expect(full.count("clip")).toBe(0);

    for (const half of ["left", "right"] as const) {
      const r = createRecordingCtx();
      drawBoard(
        r.ctx,
        doc,
        0,
        view({ ...fitViewport(W, H, doc.pitch.length, doc.pitch.width, { half, rotated: false }) }),
      );
      expect(r.count("clip"), half).toBe(1);

      // The clip spans exactly one half of the length, plus padding on the
      // outside only — the halfway line is a hard edge.
      const rect = r.calls("rect")[0];
      const [x, , w] = rect.slice(5, -1).split(",").map(Number);
      expect(w, half).toBeCloseTo(doc.pitch.length / 2 + 3);
      expect(half === "left" ? x : x + w, half).toBeCloseTo(
        half === "left" ? -3 : doc.pitch.length + 3,
      );
    }
  });

  it("still draws the same geometry when cropped — only the clip is added", () => {
    const doc = createBoardDoc();
    const full = createRecordingCtx();
    const half = createRecordingCtx();
    drawBoard(full.ctx, doc, 0, view());
    drawBoard(
      half.ctx,
      doc,
      0,
      view({ ...fitViewport(W, H, doc.pitch.length, doc.pitch.width, { half: "left", rotated: false }) }),
    );

    const strip = (log: string[]) =>
      log.filter(
        (l) => !l.startsWith("transform(") && !l.startsWith("clip(") && !l.startsWith("rect("),
      );
    // beginPath is emitted for the clip too, so allow one extra.
    expect(strip(half.log).length).toBe(strip(full.log).length + 1);
  });

  it("omits a hidden team, and the links that belong to it", () => {
    const doc = createBoardDoc();
    const shown = createRecordingCtx();
    drawBoard(shown.ctx, doc, 0, view());

    const hidden = structuredClone(doc);
    hidden.teams[1].hidden = true;
    const solo = createRecordingCtx();
    drawBoard(solo.ctx, hidden, 0, view());

    const tokens = (r: ReturnType<typeof createRecordingCtx>) =>
      r.calls("arc").filter((c) => c.includes(`,${TOKEN_RADIUS},0,6.283`)).length;

    expect(tokens(shown)).toBe(22);
    expect(tokens(solo)).toBe(11);
    // Fewer strokes overall, because the away team's seeded links go too.
    expect(solo.count("stroke")).toBeLessThan(shown.count("stroke"));
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
