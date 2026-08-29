import { describe, expect, it } from "vitest";
import { drawBoard } from "./render";
import { ballRadius, tokenRadius } from "./pitch";
import { PITCH, PITCH_PADDING, TEAM_NAME_OFFSET } from "./pitch";
import { frameAt } from "./timeline";
import { createRecordingCtx } from "./recording-ctx";
import { createBoardDoc } from "@/formations";
import { addSceneAfter, setCarrier, setRunHidden, setShot } from "./scenes";
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
    // Compared against the flat baseline, because other text (the team names
    // behind each goal) rotates in both.
    const players = doc.teams[0].players.length + doc.teams[1].players.length;
    expect(turned.count("rotate") - flat.count("rotate")).toBe(players);
  });

  it("counter-rotates distance labels too", () => {
    const doc = createBoardDoc();
    doc.links = doc.links.map((l) => ({ ...l, showDistances: true }));
    const labels = doc.links.reduce(
      (n, l) => n + (l.style === "chain" || l.members.length < 3 ? l.members.length - 1 : l.members.length),
      0,
    );

    const flat = createRecordingCtx();
    const turned = createRecordingCtx();
    drawBoard(flat.ctx, doc, 0, view());
    drawBoard(
      turned.ctx,
      doc,
      0,
      view({ ...fitViewport(W, H, doc.pitch.length, doc.pitch.width, { half: "full", rotated: true }) }),
    );

    const players = doc.teams[0].players.length + doc.teams[1].players.length;
    expect(turned.count("rotate") - flat.count("rotate")).toBe(players + labels);
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
      expect(w, half).toBeCloseTo(doc.pitch.length / 2 + PITCH_PADDING);
      expect(half === "left" ? x : x + w, half).toBeCloseTo(
        half === "left" ? -PITCH_PADDING : doc.pitch.length + PITCH_PADDING,
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
      r.calls("arc").filter((c) => c.includes(`,${tokenRadius(doc)},0,6.283`)).length;

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
    const firstToken = r.log.findIndex((e) => e.includes(`,${tokenRadius(doc)},0,6.283`));
    expect(halfway).toBeGreaterThan(-1);
    expect(firstToken).toBeGreaterThan(halfway);
  });

  it("draws one token arc per player, and the ball above them", () => {
    const doc = createBoardDoc();
    const r = createRecordingCtx();
    drawBoard(r.ctx, doc, 0, view());

    const players = doc.teams[0].players.length + doc.teams[1].players.length;
    const tokenArcs = r.calls("arc").filter((c) => c.includes(`,${tokenRadius(doc)},0,6.283`));
    expect(tokenArcs).toHaveLength(players);

    const lastToken = r.log.lastIndexOf(tokenArcs[tokenArcs.length - 1]);
    // Rounded the way the recorder logs numbers, or the scaled radius misses.
    const ballArc = r.log.findIndex((e) => e.startsWith(`arc(52.5,34,${round(ballRadius(doc))},`));
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

describe("team names", () => {
  const nameCalls = (r: ReturnType<typeof createRecordingCtx>, name: string) =>
    r.log.filter((l) => l.startsWith(`fillText(${JSON.stringify(name)},`));

  it("writes each team's name once, behind the goal it defends", () => {
    const doc = createBoardDoc();
    doc.teams[0].name = "Arsenal";
    doc.teams[1].name = "City";

    const r = createRecordingCtx();
    drawBoard(r.ctx, doc, 0, view());
    expect(nameCalls(r, "Arsenal")).toHaveLength(1);
    expect(nameCalls(r, "City")).toHaveLength(1);

    // Drawn in the translated frame, so the call itself is at the origin; the
    // placement is the preceding translate.
    const translates = r.calls("translate");
    expect(translates.some((t) => t.startsWith(`translate(${-TEAM_NAME_OFFSET},34)`))).toBe(true);
    expect(
      translates.some((t) => t.startsWith(`translate(${105 + TEAM_NAME_OFFSET},34)`)),
    ).toBe(true);

    // Clear of the 2 m goal, and inside the grass.
    expect(TEAM_NAME_OFFSET).toBeGreaterThan(PITCH.goalDepth + 1);
    expect(TEAM_NAME_OFFSET).toBeLessThan(PITCH_PADDING - 1);
  });

  it("omits a hidden team's name", () => {
    const doc = createBoardDoc();
    doc.teams[1].name = "City";
    doc.teams[1].hidden = true;
    const r = createRecordingCtx();
    drawBoard(r.ctx, doc, 0, view());
    expect(nameCalls(r, "City")).toHaveLength(0);
  });

  it("omits a blank name rather than drawing an empty string", () => {
    const doc = createBoardDoc();
    doc.teams[0].name = "   ";
    const r = createRecordingCtx();
    drawBoard(r.ctx, doc, 0, view());
    expect(r.calls("fillText").some((c) => c.startsWith('fillText("   "'))).toBe(false);
  });

  it("mirrors the two names on a flat board so they face each other", () => {
    const r = createRecordingCtx();
    drawBoard(r.ctx, createBoardDoc(), 0, view());
    const turns = r.calls("rotate");
    expect(turns).toContain(`rotate(${round(-Math.PI / 2)})`);
    expect(turns).toContain(`rotate(${round(Math.PI / 2)})`);
  });

  it("keeps both names upright on a vertical board, where mirroring would invert one", () => {
    const doc = createBoardDoc();
    const r = createRecordingCtx();
    drawBoard(
      r.ctx,
      doc,
      0,
      view({ ...fitViewport(W, H, doc.pitch.length, doc.pitch.width, { half: "full", rotated: true }) }),
    );
    // Both cancel the board's own turn the same way; neither flips.
    expect(r.calls("rotate")).not.toContain(`rotate(${round(-Math.PI / 2)})`);
  });

  it("writes the name in white, not the kit colour, so a dark kit still reads", () => {
    const doc = createBoardDoc();
    doc.teams[0].color = "#18181b";
    const r = createRecordingCtx();
    drawBoard(r.ctx, doc, 0, view());

    const name = r.log.findIndex((l) => l.startsWith('fillText("Home",'));
    const fillBefore = r.log
      .slice(0, name)
      .reverse()
      .find((l) => l.startsWith("fillStyle="));
    expect(fillBefore).toBe('fillStyle="rgba(255,255,255,0.92)"');
  });

  it("lays the name along the goal line in both orientations", () => {
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
    // A quarter turn anticlockwise when flat; clockwise when the board is
    // already turned, so it nets to zero. Both leave the name along the line —
    // getting this wrong renders it sideways and clipped off the canvas.
    expect(flat.calls("rotate")).toContain(`rotate(${round(-Math.PI / 2)})`);
    expect(turned.calls("rotate")).toContain(`rotate(${round(Math.PI / 2)})`);
    // Flat mirrors the pair, so both quarter turns appear.
    expect(flat.calls("rotate")).toContain(`rotate(${round(Math.PI / 2)})`);
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
    expect(ball.x - at.x).toBeGreaterThanOrEqual(tokenRadius(doc));
  });

  it("ignores the ball id in positions — it is derived, never stored", () => {
    const doc = createBoardDoc();
    expect(doc.scenes[0].positions[BALL_ID]).toBeUndefined();
  });
});

const round = (n: number) => Math.round(n * 1000) / 1000;

describe("link colour", () => {
  it("strokes a seeded link in its team's kit, and follows a recolour", () => {
    const doc = createBoardDoc();
    // Seeded links carry no colour, so the only kit-coloured stroke at rest is
    // theirs — a token is filled, not stroked, in its kit.
    doc.teams[0] = { ...doc.teams[0], color: "#123456" };

    const r = createRecordingCtx();
    drawBoard(r.ctx, doc, 0, view());

    expect(r.log).toContain('strokeStyle="#123456"');
    expect(r.log).not.toContain('strokeStyle="#e11d48"');
  });
});

/**
 * A two-scene board mid-transition, which is when runs and the ball's own line
 * are drawn. `t` sits inside the travel into scene 2.
 */
function moving(edit: (doc: ReturnType<typeof createBoardDoc>) => ReturnType<typeof createBoardDoc> = (d) => d) {
  let doc = addSceneAfter(createBoardDoc(), 0);
  const id = doc.teams[0].players[5].id;
  doc = {
    ...doc,
    scenes: doc.scenes.map((s, i) =>
      i === 1 ? { ...s, positions: { ...s.positions, [id]: { x: 70, y: 40 } } } : s,
    ),
  };
  doc = edit(doc);
  const r = createRecordingCtx();
  drawBoard(r.ctx, doc, doc.scenes[0].holdMs / 1000 + 0.5, view());
  return { doc, r, id };
}

describe("run arrows", () => {
  // One per drawn run: drawPath fades the curve, nothing else does.
  const runs = (r: ReturnType<typeof createRecordingCtx>) =>
    r.log.filter((l) => l === "globalAlpha=0.75").length;

  it("draws one per player in flight", () => {
    expect(runs(moving().r)).toBe(1);
  });

  it("drops the one hidden for that scene, and no other", () => {
    const { id } = moving();
    expect(runs(moving((d) => setRunHidden(d, 1, id, true)).r)).toBe(0);
    // Hidden in the scene the player is NOT travelling into: still drawn.
    expect(runs(moving((d) => setRunHidden(d, 0, id, true)).r)).toBe(1);
  });
});

describe("the ball's own line", () => {
  const pass = (extra: (d: ReturnType<typeof createBoardDoc>) => ReturnType<typeof createBoardDoc> = (d) => d) =>
    moving((doc) => {
      const from = doc.teams[0].players[5].id;
      const to = doc.teams[0].players[9].id;
      return extra(setCarrier(setCarrier(doc, 0, from), 1, to));
    });

  it("dashes a pass — the convention every coaching diagram uses", () => {
    expect(pass().r.log).toContain("setLineDash([1.4,1])");
  });

  it("is absent when the ball never leaves anyone's feet", () => {
    expect(moving().r.log).not.toContain("setLineDash([1.4,1])");
  });

  it("goes solid and doubles up for a shot", () => {
    const plain = pass();
    const shot = pass((d) => setShot(d, 1, true));
    expect(shot.r.log).not.toContain("setLineDash([1.4,1])");
    // Two rails plus the strike burst, against the pass's single line.
    expect(shot.r.count("stroke")).toBeGreaterThan(plain.r.count("stroke"));
  });

  it("goes when the ball's line is hidden for that scene", () => {
    const hidden = pass((d) => setRunHidden(d, 1, BALL_ID, true));
    expect(hidden.r.log).not.toContain("setLineDash([1.4,1])");
  });

  /**
   * The one that was wrong: a player running with the ball carries it the whole
   * length of their run, and that movement was being drawn as a pass.
   */
  it("draws nothing for a dribble — one player carrying it throughout", () => {
    const dribble = moving((doc) => {
      const runner = doc.teams[0].players[5].id;
      return setCarrier(setCarrier(doc, 0, runner), 1, runner);
    });
    expect(dribble.doc.scenes[0].carrier).toBe(dribble.doc.scenes[1].carrier);
    expect(dribble.r.log).not.toContain("setLineDash([1.4,1])");
    // Not merely undashed: no ball line at all. The run arrow already says it.
    expect(dribble.r.count("stroke")).toBe(moving().r.count("stroke"));
  });

  it("does not dash a turnover — the convention is a pass between team-mates", () => {
    const turnover = moving((doc) => {
      const home = doc.teams[0].players[5].id;
      const away = doc.teams[1].players[9].id;
      return setCarrier(setCarrier(doc, 0, home), 1, away);
    });
    expect(turnover.r.log).not.toContain("setLineDash([1.4,1])");
    // Still drawn, though — the ball really did travel.
    expect(turnover.r.count("stroke")).toBeGreaterThan(moving().r.count("stroke"));
  });
});
