import { describe, expect, it } from "vitest";
import { ballAt, ballGlue, frameAt, passEnds, positionAt, resolveAt, runsThrough } from "./timeline";
import { setDelay, setRunStyle, setTravel } from "./scenes";
import { boardDocSchema } from "./schema";
import { createBoardDoc } from "@/formations";
import { drawBoard } from "./render";
import { createRecordingCtx } from "./recording-ctx";
import { fitViewport } from "./geometry";
import { BALL_ID, type BoardDoc, type Scene, type Vec2 } from "./types";

const doc0 = createBoardDoc();
const RUNNER = doc0.teams[0].players[5].id;
const MATE = doc0.teams[0].players[6].id;
const OTHER = doc0.teams[0].players[7].id;

/**
 * Four scenes, the runner going 20 m along x in each. Every travel is 1 s and every
 * hold 0.5 s, so the clock is: scene 0 rests 0–0.5 s, travel 0.5–1.5, scene 1 rests
 * 1.5–2.0, travel 2.0–3.0, scene 2 rests 3.0–3.5, travel 3.5–4.5, scene 3 rests.
 */
function fourScenes(): BoardDoc {
  const doc = structuredClone(doc0);
  const base = doc.scenes[0];
  const scenes: Scene[] = [0, 1, 2, 3].map((i) => ({
    ...structuredClone(base),
    id: `s${i}`,
    name: `Scene ${i + 1}`,
    transitionMs: i === 0 ? 0 : 1000,
    holdMs: 500,
    positions: { ...structuredClone(base.positions), [RUNNER]: { x: 10 + 20 * i, y: 20 } },
  }));
  return { ...doc, scenes };
}

const x = (doc: BoardDoc, t: number, id = RUNNER) => positionAt(id, resolveAt(doc, t), doc).x;

describe("run styles", () => {
  it("stores nothing for a gradual run, and moves exactly as before", () => {
    const plain = fourScenes();
    const reset = setRunStyle(setRunStyle(plain, 1, RUNNER, { end: "sharp" }), 1, RUNNER, {
      end: "gradual",
    });
    expect(reset.scenes[1].run).toBeUndefined();
    for (const t of [0.7, 1.0, 1.3, 2.4]) expect(x(reset, t)).toBeCloseTo(x(plain, t), 9);
  });

  it("runs at a constant pace when both ends are sharp", () => {
    const doc = setRunStyle(fourScenes(), 1, RUNNER, { start: "sharp", end: "sharp" });
    expect(x(doc, 0.75)).toBeCloseTo(15, 6);
    expect(x(doc, 1.0)).toBeCloseTo(20, 6);
    expect(x(doc, 1.25)).toBeCloseTo(25, 6);
  });

  it("sets off at pace with a sharp start and still eases to a stop", () => {
    const sharp = setRunStyle(fourScenes(), 1, RUNNER, { start: "sharp" });
    const gradual = fourScenes();
    // Further along early on, and on the mark at the end either way.
    expect(x(sharp, 0.6)).toBeGreaterThan(x(gradual, 0.6));
    expect(x(sharp, 1.5)).toBeCloseTo(30, 6);
  });

  it("is valid in a document, and validated", () => {
    const doc = setRunStyle(fourScenes(), 1, RUNNER, { start: "sharp", end: "through" });
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
    const bad = structuredClone(doc);
    (bad.scenes[1].run as Record<string, unknown>)[RUNNER] = { end: "sideways" };
    expect(boardDocSchema.safeParse(bad).success).toBe(false);
  });
});

describe("running through a scene", () => {
  const through = (doc: BoardDoc, ...scenes: number[]) =>
    scenes.reduce((d, k) => setRunStyle(d, k, RUNNER, { end: "through" }), doc);

  it("is on his mark as the scene comes to rest, and moving during its hold", () => {
    const doc = through(fourScenes(), 1);
    expect(x(doc, 1.5)).toBeCloseTo(30, 6);
    expect(x(doc, 1.75)).toBeGreaterThan(30.5);
    expect(x(doc, 3.0)).toBeCloseTo(50, 6);
  });

  it("does not stop at the mark: the speed carries across it", () => {
    const doc = through(fourScenes(), 1, 2);
    const speed = (t: number) => (x(doc, t + 0.005) - x(doc, t - 0.005)) / 0.01;
    for (const mark of [1.5, 3.0]) {
      const before = speed(mark - 0.01);
      const after = speed(mark + 0.01);
      expect(before).toBeGreaterThan(5);
      expect(Math.abs(after - before) / before).toBeLessThan(0.1);
    }
  });

  it("leaves everyone else holding", () => {
    const doc = through(fourScenes(), 1);
    const other = doc.scenes[1].positions[OTHER];
    expect(positionAt(OTHER, resolveAt(doc, 1.75), doc)).toEqual(other);
  });

  it("draws his arrow as soon as he sets off, not only once the next scene starts", () => {
    const view = { ...fitViewport(1200, 800, 105, 68), width: 1200, height: 800, interactive: false };
    const strokes = (doc: BoardDoc, t: number) => {
      const r = createRecordingCtx();
      drawBoard(r.ctx, doc, t, view);
      return r.log;
    };
    const plain = fourScenes();
    const running = through(fourScenes(), 1);
    // In the hold, he is running and the others are not: one more arrow than without.
    const count = (log: string[]) => log.filter((e) => e === "stroke()").length;
    expect(count(strokes(running, 1.75))).toBeGreaterThan(count(strokes(plain, 1.75)));
    // At the instant the scene rests he is on his mark, and nothing is drawn differently.
    expect(strokes(running, 1.5)).toEqual(strokes(plain, 1.5));
  });

  it("gives way to a wait on the next scene, and to the last scene", () => {
    const waiting = setDelay(through(fourScenes(), 1), 2, RUNNER, 300);
    expect(runsThrough(waiting, RUNNER, 1)).toBe(false);
    expect(x(waiting, 1.75)).toBeCloseTo(30, 6);

    const last = through(fourScenes(), 3);
    expect(runsThrough(last, RUNNER, 3)).toBe(false);
  });

  it("is ignored in flow mode, where every run is continuous already", () => {
    const doc = { ...through(fourScenes(), 1), flow: { speed: 10, endHoldMs: 500 } };
    expect(runsThrough(doc, RUNNER, 1)).toBe(false);
  });
});

describe("the ball keeps its own time (D97)", () => {
  /**
   * The mate carries the ball into scene 1 and passes to the runner in scene 2. The
   * runner makes a slow 2 s run; the pass takes 0.6 s after a 0.4 s wait.
   */
  function pass(): BoardDoc {
    let doc = fourScenes();
    doc.scenes = doc.scenes.slice(0, 3);
    const mateAt = (i: number): Vec2 => ({ x: 40 + 10 * i, y: 40 });
    doc.scenes.forEach((s, i) => (s.positions[MATE] = mateAt(i)));
    doc.scenes[1].carrier = MATE;
    doc.scenes[2].carrier = RUNNER;
    doc = setTravel(doc, 2, RUNNER, 2000);
    doc = setDelay(doc, 2, BALL_ID, 400);
    doc = setTravel(doc, 2, BALL_ID, 600);
    return doc;
  }
  // Scene 2's window opens at 2.0 s and lasts 2 s — the runner's run.
  const near = (a: Vec2, b: Vec2, d: number) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(d, 4);

  it("stays at the passer's feet, wherever he has run to, until it is released", () => {
    const doc = pass();
    const r = resolveAt(doc, 2.2);
    near(ballAt(r, doc)!, positionAt(MATE, r, doc), ballGlue(doc));
  });

  it("is met in the receiver's stride, and he carries it on", () => {
    const doc = pass();
    // Arrived at 3.0 s, halfway through his 2 s run: with him, not on his mark.
    const r = resolveAt(doc, 3.4);
    const runner = positionAt(RUNNER, r, doc);
    near(ballAt(r, doc)!, runner, ballGlue(doc));
    expect(runner.x).toBeLessThan(doc.scenes[2].positions[RUNNER].x - 1);
  });

  it("is drawn from where it is struck to where it is met", () => {
    const doc = pass();
    const r = { ...resolveAt(doc, 2.5), ms: undefined };
    const ends = passEnds(r, doc)!;
    const released = resolveAt(doc, 2.4);
    const met = resolveAt(doc, 3.0);
    near(ends.start, positionAt(MATE, released, doc), ballGlue(doc));
    near(ends.end, positionAt(RUNNER, met, doc), ballGlue(doc));
  });

  it("with no timing of its own, leaves at once and lands where it always did", () => {
    let doc = pass();
    doc = setDelay(setTravel(setTravel(doc, 2, BALL_ID, null), 2, RUNNER, null), 2, BALL_ID, null);
    const frame = frameAt(doc, 3.0);
    const end = passEnds(frame.resolved, doc)!.end;
    near(end, doc.scenes[2].positions[RUNNER], ballGlue(doc));
  });
});
