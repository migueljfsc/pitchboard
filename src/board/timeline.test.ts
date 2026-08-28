import { describe, expect, it } from "vitest";
import { BALL_GLUE, ballAt, frameAt, positionAt, resolveAt, totalDurationMs } from "./timeline";
import { createBoardDoc } from "@/formations";
import { boardDocSchema } from "./schema";
import type { BoardDoc, Scene } from "./types";

/** Two scenes: 1 s hold, 2 s transition, 0.5 s hold. Total 3.5 s. */
function twoScene(mutate?: (a: Scene, b: Scene, doc: BoardDoc) => void): BoardDoc {
  const doc = createBoardDoc();
  const a = doc.scenes[0];
  a.transitionMs = 0;
  a.holdMs = 1000;
  const b: Scene = { ...structuredClone(a), id: "scene-2", name: "Scene 2", transitionMs: 2000, holdMs: 500 };
  doc.scenes = [a, b];
  mutate?.(a, b, doc);
  return doc;
}

const HOME_9 = "home-9";
const HOME_10 = "home-10";

describe("totalDurationMs", () => {
  it("counts scene 0's hold, then transition plus hold for each later scene", () => {
    expect(totalDurationMs(twoScene())).toBe(3500);
  });

  it("ignores scenes[0].transitionMs — there is nothing to travel from", () => {
    const doc = twoScene((a) => {
      a.transitionMs = 9999;
    });
    expect(totalDurationMs(doc)).toBe(3500);
  });

  it("is just the hold for a single-scene board", () => {
    const doc = createBoardDoc();
    doc.scenes[0].holdMs = 1234;
    expect(totalDurationMs(doc)).toBe(1234);
  });
});

describe("resolveAt", () => {
  const doc = twoScene();

  it("holds on scene 0 before the transition", () => {
    for (const t of [0, 0.5, 1]) {
      const r = resolveAt(doc, t);
      expect(r.moving).toBe(false);
      expect(r.index).toBe(0);
      expect(r.u).toBe(1);
      expect(r.from).toBe(r.to);
    }
  });

  it("reports progress through the transition", () => {
    expect(resolveAt(doc, 1.5).u).toBeCloseTo(0.25);
    expect(resolveAt(doc, 2).u).toBeCloseTo(0.5);
    expect(resolveAt(doc, 2.5).u).toBeCloseTo(0.75);
    expect(resolveAt(doc, 2).moving).toBe(true);
  });

  it("holds on the final scene after it arrives", () => {
    const r = resolveAt(doc, 3.2);
    expect(r.moving).toBe(false);
    expect(r.index).toBe(1);
  });

  it("clamps out-of-range times instead of producing NaN", () => {
    for (const t of [-5, 0, 3.5, 99]) {
      const r = resolveAt(doc, t);
      expect(Number.isFinite(r.u)).toBe(true);
      expect(r.u).toBeGreaterThanOrEqual(0);
      expect(r.u).toBeLessThanOrEqual(1);
    }
    expect(resolveAt(doc, -5).index).toBe(0);
    expect(resolveAt(doc, 99).index).toBe(1);
  });

  it("never divides by a zero-length transition", () => {
    const instant = twoScene((_a, b) => {
      b.transitionMs = 0;
    });
    for (const t of [0, 1, 1.0001, 1.5]) {
      expect(Number.isFinite(resolveAt(instant, t).u)).toBe(true);
    }
    // Straight from one hold to the next, with no travelling segment.
    expect(resolveAt(instant, 1.2).moving).toBe(false);
    expect(resolveAt(instant, 1.2).index).toBe(1);
  });

  it("handles a single-scene board at every time", () => {
    const one = createBoardDoc();
    for (const t of [0, 1, 100]) {
      const r = resolveAt(one, t);
      expect(r.index).toBe(0);
      expect(r.moving).toBe(false);
    }
  });
});

describe("positionAt", () => {
  it("tweens in a straight line with no path", () => {
    const doc = twoScene((a, b) => {
      a.positions[HOME_9] = { x: 10, y: 10 };
      b.positions[HOME_9] = { x: 30, y: 10 };
    });
    // Eased, so the midpoint of TIME is the midpoint of DISTANCE only by symmetry.
    const mid = positionAt(HOME_9, resolveAt(doc, 2), doc);
    expect(mid.x).toBeCloseTo(20);
    expect(mid.y).toBeCloseTo(10);
  });

  it("pins the endpoints of a transition", () => {
    const doc = twoScene((a, b) => {
      a.positions[HOME_9] = { x: 10, y: 10 };
      b.positions[HOME_9] = { x: 30, y: 50 };
    });
    expect(positionAt(HOME_9, resolveAt(doc, 1), doc)).toEqual({ x: 10, y: 10 });
    expect(positionAt(HOME_9, resolveAt(doc, 3), doc)).toEqual({ x: 30, y: 50 });
  });

  it("follows a drawn curve away from the straight line", () => {
    const doc = twoScene((a, b) => {
      a.positions[HOME_9] = { x: 10, y: 34 };
      b.positions[HOME_9] = { x: 50, y: 34 };
      b.paths[HOME_9] = { c1: { x: 20, y: 5 }, c2: { x: 40, y: 5 } };
    });
    const mid = positionAt(HOME_9, resolveAt(doc, 2), doc);
    // Bowed towards the control points, well off the y=34 straight line.
    expect(mid.y).toBeLessThan(25);
  });

  it("travels a curve at constant speed", () => {
    const doc = twoScene((a, b) => {
      a.positions[HOME_9] = { x: 5, y: 34 };
      b.positions[HOME_9] = { x: 70, y: 40 };
      b.paths[HOME_9] = { c1: { x: 7, y: 34 }, c2: { x: 13, y: 5 } };
    });
    // Sample the middle of the transition, where easing is near linear in time.
    const at = (t: number) => positionAt(HOME_9, resolveAt(doc, t), doc);
    const steps = [1.8, 1.9, 2.0, 2.1, 2.2].map(at);
    const gaps = steps.slice(1).map((p, i) => Math.hypot(p.x - steps[i].x, p.y - steps[i].y));
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.3);
  });

  it("returns the scene position when holding", () => {
    const doc = twoScene((a) => {
      a.positions[HOME_9] = { x: 12, y: 21 };
    });
    expect(positionAt(HOME_9, resolveAt(doc, 0.5), doc)).toEqual({ x: 12, y: 21 });
  });
});

describe("ball — a pass is a carrier change", () => {
  const carried = (a: Scene, b: Scene, from: string | null, to: string | null) => {
    a.carrier = from;
    b.carrier = to;
    if (from) delete a.ballPos;
    else a.ballPos ??= { x: 52.5, y: 34 };
    if (to) delete b.ballPos;
    else b.ballPos ??= { x: 52.5, y: 34 };
  };

  it("glues to a carrier that keeps the ball", () => {
    const doc = twoScene((a, b) => {
      carried(a, b, HOME_9, HOME_9);
      a.positions[HOME_9] = { x: 20, y: 34 };
      b.positions[HOME_9] = { x: 40, y: 34 };
    });
    for (const t of [1, 1.5, 2, 2.5, 3]) {
      const r = resolveAt(doc, t);
      const player = positionAt(HOME_9, r, doc);
      const ball = ballAt(r, doc);
      expect(Math.hypot(ball.x - player.x, ball.y - player.y)).toBeCloseTo(BALL_GLUE, 5);
    }
  });

  it("offsets the ball ahead of a stationary carrier, clear of the token", () => {
    const doc = twoScene((a, b) => carried(a, b, HOME_9, HOME_9));
    const r = resolveAt(doc, 0.5);
    const ball = ballAt(r, doc);
    const player = positionAt(HOME_9, r, doc);
    expect(ball.x).toBeGreaterThan(player.x);
    expect(ball.y).toBeCloseTo(player.y);
  });

  it("travels between players on a pass", () => {
    const doc = twoScene((a, b) => {
      carried(a, b, HOME_9, HOME_10);
      a.positions[HOME_9] = { x: 20, y: 20 };
      b.positions[HOME_9] = { x: 20, y: 20 };
      a.positions[HOME_10] = { x: 60, y: 50 };
      b.positions[HOME_10] = { x: 60, y: 50 };
    });
    const start = ballAt(resolveAt(doc, 1.001), doc);
    const end = ballAt(resolveAt(doc, 3), doc);
    expect(start.x).toBeCloseTo(20 + BALL_GLUE, 1);
    expect(end.x).toBeCloseTo(60 + BALL_GLUE, 1);
  });

  it("tracks a receiver who is moving during the pass, and lands without a jump", () => {
    const doc = twoScene((a, b) => {
      carried(a, b, HOME_9, HOME_10);
      a.positions[HOME_9] = { x: 20, y: 34 };
      b.positions[HOME_9] = { x: 20, y: 34 };
      a.positions[HOME_10] = { x: 50, y: 10 };
      b.positions[HOME_10] = { x: 80, y: 60 }; // receiver runs during the pass
    });
    const r1 = resolveAt(doc, 2.999);
    const rEnd = resolveAt(doc, 3);
    const nearlyThere = ballAt(r1, doc);
    const arrived = ballAt(rEnd, doc);

    // Continuous across the handoff — no teleport onto the receiver.
    expect(Math.hypot(arrived.x - nearlyThere.x, arrived.y - nearlyThere.y)).toBeLessThan(0.5);
    // And it ends on the receiver's FINAL position, not where they started.
    const receiver = positionAt(HOME_10, rEnd, doc);
    expect(Math.hypot(arrived.x - receiver.x, arrived.y - receiver.y)).toBeCloseTo(BALL_GLUE, 5);
  });

  it("decelerates — a pass is struck hard, not eased in like a jogging player", () => {
    const doc = twoScene((a, b) => {
      carried(a, b, HOME_9, HOME_10);
      a.positions[HOME_9] = { x: 0, y: 34 };
      b.positions[HOME_9] = { x: 0, y: 34 };
      a.positions[HOME_10] = { x: 100, y: 34 };
      b.positions[HOME_10] = { x: 100, y: 34 };
    });
    // Halfway through the transition it is already past halfway to the receiver.
    const mid = ballAt(resolveAt(doc, 2), doc);
    expect(mid.x).toBeGreaterThan(50);
  });

  it("goes loose when the carrier is cleared", () => {
    const doc = twoScene((a, b) => {
      carried(a, b, HOME_9, null);
      b.ballPos = { x: 90, y: 5 };
    });
    expect(ballAt(resolveAt(doc, 3), doc)).toEqual({ x: 90, y: 5 });
  });

  it("is collected when a carrier is set", () => {
    const doc = twoScene((a, b) => {
      carried(a, b, null, HOME_9);
      a.ballPos = { x: 10, y: 10 };
      b.positions[HOME_9] = { x: 70, y: 40 };
    });
    const arrived = ballAt(resolveAt(doc, 3), doc);
    const player = positionAt(HOME_9, resolveAt(doc, 3), doc);
    expect(Math.hypot(arrived.x - player.x, arrived.y - player.y)).toBeCloseTo(BALL_GLUE, 5);
  });

  it("moves as an ordinary entity when never carried", () => {
    const doc = twoScene((a, b) => {
      a.ballPos = { x: 10, y: 10 };
      b.ballPos = { x: 40, y: 10 };
    });
    expect(ballAt(resolveAt(doc, 1), doc)).toEqual({ x: 10, y: 10 });
    expect(ballAt(resolveAt(doc, 3), doc)).toEqual({ x: 40, y: 10 });
    expect(ballAt(resolveAt(doc, 2), doc).x).toBeGreaterThan(10);
  });

  it("follows ballPath when one is drawn", () => {
    const doc = twoScene((a, b) => {
      a.ballPos = { x: 10, y: 34 };
      b.ballPos = { x: 60, y: 34 };
      b.ballPath = { c1: { x: 20, y: 60 }, c2: { x: 50, y: 60 } };
    });
    expect(ballAt(resolveAt(doc, 2), doc).y).toBeGreaterThan(40);
  });
});

describe("frameAt", () => {
  it("positions every player and the ball", () => {
    const doc = twoScene();
    const frame = frameAt(doc, 2);
    const players = doc.teams.flatMap((t) => t.players);
    expect(Object.keys(frame.positions)).toHaveLength(players.length);
    for (const p of players) expect(frame.positions[p.id]).toBeDefined();
    expect(frame.ball).toBeDefined();
    expect(frame.resolved.moving).toBe(true);
  });

  it("produces finite coordinates across the whole timeline", () => {
    const doc = twoScene((_a, b) => {
      b.paths[HOME_9] = { c1: { x: 20, y: 5 }, c2: { x: 40, y: 5 } };
      b.positions[HOME_9] = { x: 80, y: 60 };
    });
    for (let t = -1; t <= 5; t += 0.1) {
      const frame = frameAt(doc, t);
      for (const p of Object.values(frame.positions)) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
      expect(Number.isFinite(frame.ball.x) && Number.isFinite(frame.ball.y)).toBe(true);
    }
  });

  it("builds documents the schema accepts", () => {
    expect(boardDocSchema.safeParse(twoScene()).success).toBe(true);
  });
});
