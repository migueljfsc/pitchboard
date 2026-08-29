import { describe, expect, it } from "vitest";
import {
  DEFAULT_END_HOLD_MS,
  MIN_FLOW_STEP_MS,
  ballAt,
  ballGlue,
  frameAt,
  positionAt,
  resolveAt,
  sceneTimings,
  totalDurationMs,
} from "./timeline";
import { createBoardDoc } from "@/formations";
import { sceneStartSeconds } from "./scenes";
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
      expect(Math.hypot(ball.x - player.x, ball.y - player.y)).toBeCloseTo(ballGlue(doc), 5);
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
    expect(start.x).toBeCloseTo(20 + ballGlue(doc), 1);
    expect(end.x).toBeCloseTo(60 + ballGlue(doc), 1);
  });

  it("travels in a straight line even when the receiver is running (BUG-1)", () => {
    const doc = twoScene((a, b) => {
      carried(a, b, HOME_9, HOME_10);
      a.positions[HOME_9] = { x: 10, y: 34 };
      b.positions[HOME_9] = { x: 10, y: 34 }; // passer stands still
      a.positions[HOME_10] = { x: 90, y: 10 };
      b.positions[HOME_10] = { x: 90, y: 58 }; // receiver runs across the pitch
    });

    const start = ballAt(resolveAt(doc, 1), doc);
    const end = ballAt(resolveAt(doc, 3), doc);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const span = Math.hypot(dx, dy);

    // Every sample must sit on the line from release point to meeting point.
    // Re-reading the receiver's live position each frame bowed this by metres.
    for (const t of [1.3, 1.7, 2.0, 2.4, 2.8]) {
      const p = ballAt(resolveAt(doc, t), doc);
      const cross = Math.abs((p.x - start.x) * dy - (p.y - start.y) * dx) / span;
      expect(cross, `off the line at t=${t}`).toBeLessThan(0.01);
    }
  });

  it("leads a receiver who is moving during the pass, and lands without a jump", () => {
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
    expect(Math.hypot(arrived.x - receiver.x, arrived.y - receiver.y)).toBeCloseTo(ballGlue(doc), 5);
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
    expect(Math.hypot(arrived.x - player.x, arrived.y - player.y)).toBeCloseTo(ballGlue(doc), 5);
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

describe("flow mode", () => {
  /** Two scenes with one player covering exactly 40 m between them. */
  const flowing = (speed = 10, endHoldMs = DEFAULT_END_HOLD_MS): BoardDoc => {
    const doc = twoScene((a, b) => {
      a.positions[HOME_9] = { x: 10, y: 34 };
      b.positions[HOME_9] = { x: 50, y: 34 };
      // Every other player holds station, so 40 m is the longest move.
      for (const id of Object.keys(b.positions)) {
        if (id !== HOME_9) b.positions[id] = { ...a.positions[id] };
      }
      a.ballPos = { x: 1, y: 1 };
      b.ballPos = { x: 1, y: 1 };
    });
    return { ...doc, flow: { speed, endHoldMs } };
  };

  it("paces each scene by its longest move, not by its own timings", () => {
    // 40 m at 10 m/s is 4 s, whatever transitionMs happens to say.
    expect(sceneTimings(flowing())[1].travelMs).toBeCloseTo(4000);
    expect(flowing().scenes[1].transitionMs).toBe(2000);
  });

  it("halves the time when the pace doubles", () => {
    expect(sceneTimings(flowing(20))[1].travelMs).toBeCloseTo(2000);
  });

  it("holds nothing but the last frame", () => {
    const timing = sceneTimings(flowing(10, 900));
    expect(timing[0].holdMs).toBe(0);
    expect(timing[timing.length - 1].holdMs).toBe(900);
  });

  it("totals the travel plus the one end hold", () => {
    expect(totalDurationMs(flowing(10, 900))).toBeCloseTo(4900);
  });

  it("gives a scene where nothing moves a floor, so it still exists", () => {
    const still = twoScene();
    expect(sceneTimings({ ...still, flow: { speed: 10, endHoldMs: 0 } })[1].travelMs).toBe(
      MIN_FLOW_STEP_MS,
    );
  });

  it("moves linearly — a quarter of the window is a quarter of the run", () => {
    const doc = flowing();
    // 1 s into a 4 s transition that starts at t=0, since nothing holds first.
    expect(positionAt(HOME_9, resolveAt(doc, 1), doc).x).toBeCloseTo(20, 6);
    expect(positionAt(HOME_9, resolveAt(doc, 2), doc).x).toBeCloseTo(30, 6);

    // Sampled a quarter in, the eased mode is still accelerating and well
    // behind — which is exactly the stop-start that flow mode removes.
    const eased = twoScene((a, b) => {
      a.positions[HOME_9] = { x: 10, y: 34 };
      b.positions[HOME_9] = { x: 50, y: 34 };
    });
    // Its transition runs from 1 s to 3 s, so 1.5 s is a quarter of the way in.
    expect(positionAt(HOME_9, resolveAt(eased, 1.5), eased).x).toBeCloseTo(12.5, 6);
  });

  it("starts moving at once — no opening hold to sit through", () => {
    const doc = flowing();
    expect(resolveAt(doc, 0.001).moving).toBe(true);
  });

  it("ignores per-entity travel overrides, so nobody breaks step", () => {
    const doc = flowing();
    const solo = { ...doc, scenes: [doc.scenes[0], { ...doc.scenes[1], travel: { [HOME_9]: 100 } }] };
    expect(positionAt(HOME_9, resolveAt(solo, 2), solo).x).toBeCloseTo(30, 6);
  });

  it("leaves the scenes' own timings untouched, so turning it off restores them", () => {
    const off: BoardDoc = { ...flowing() };
    delete off.flow;
    expect(totalDurationMs(off)).toBe(totalDurationMs(twoScene()));
  });

  /**
   * The regression behind "the player is not dragged with the mouse": a scene
   * start that resolves as `moving` gives interpolated positions and the wrong
   * editing overlay. Flow travels are distances over a speed, so the round trip
   * through seconds does not always land exactly on the boundary.
   */
  it("resolves every scene's own start time as that scene at rest", () => {
    for (const speed of [3, 7, 10, 13.5, 29]) {
      const doc = flowing(speed);
      doc.scenes.forEach((_, i) => {
        const at = resolveAt(doc, sceneStartSeconds(doc, i));
        expect(at.index, `scene ${i} at ${speed} m/s`).toBe(i);
        expect(at.moving, `scene ${i} at ${speed} m/s`).toBe(false);
      });
    }
  });

  it("holds that boundary for awkward distances too", () => {
    // A pile of positions whose distances do not divide cleanly by the speed.
    const doc = twoScene((a, b) => {
      b.positions[HOME_9] = { x: a.positions[HOME_9].x + 17.31, y: a.positions[HOME_9].y + 4.07 };
    });
    const flowed = { ...doc, flow: { speed: 7.3, endHoldMs: 700 } };
    const at = resolveAt(flowed, sceneStartSeconds(flowed, 1));
    expect(at.index).toBe(1);
    expect(at.moving).toBe(false);
  });

  it("round-trips through the schema", () => {
    const parsed = boardDocSchema.parse(JSON.parse(JSON.stringify(flowing(12, 800))));
    expect(parsed.flow).toEqual({ speed: 12, endHoldMs: 800 });
  });

  it("rejects a pace outside the supported range", () => {
    expect(boardDocSchema.safeParse(flowing(0)).success).toBe(false);
    expect(boardDocSchema.safeParse(flowing(99)).success).toBe(false);
  });
});
