import { describe, expect, it } from "vitest";
import {
  DEFAULT_END_HOLD_MS,
  MAX_FLOW_SPEED,
  MIN_FLOW_SPEED,
  MIN_FLOW_STEP_MS,
  scenePace,
  ballAt,
  ballGlue,
  ballLift,
  transitionInto,
  frameAt,
  positionAt,
  resolveAt,
  sceneTimings,
  totalDurationMs,
  type Resolved,
} from "./timeline";
import { createBoardDoc } from "@/formations";
import { addSceneAfter, sceneStartSeconds, setScenePace } from "./scenes";
import { boardDocSchema } from "./schema";
import type { BoardDoc, Scene, Vec2 } from "./types";

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

/**
 * `ballAt` where the scene is known to hold a ball. The board has none until one
 * is given out (D44), and that case has its own tests below.
 */
const ballIn = (doc: BoardDoc, r: Resolved): Vec2 => {
  const at = ballAt(r, doc);
  if (!at) throw new Error("expected a ball in this scene");
  return at;
};

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

/** Put the ball in the two scenes' hands, or on the grass between them. */
const carried = (a: Scene, b: Scene, from: string | null, to: string | null) => {
  a.carrier = from;
  b.carrier = to;
  if (from) delete a.ballPos;
  else a.ballPos ??= { x: 52.5, y: 34 };
  if (to) delete b.ballPos;
  else b.ballPos ??= { x: 52.5, y: 34 };
};

describe("ball — a pass is a carrier change", () => {
  it("glues to a carrier that keeps the ball", () => {
    const doc = twoScene((a, b) => {
      carried(a, b, HOME_9, HOME_9);
      a.positions[HOME_9] = { x: 20, y: 34 };
      b.positions[HOME_9] = { x: 40, y: 34 };
    });
    for (const t of [1, 1.5, 2, 2.5, 3]) {
      const r = resolveAt(doc, t);
      const player = positionAt(HOME_9, r, doc);
      const ball = ballIn(doc, r);
      expect(Math.hypot(ball.x - player.x, ball.y - player.y)).toBeCloseTo(ballGlue(doc), 5);
    }
  });

  it("offsets the ball ahead of a stationary carrier, clear of the token", () => {
    const doc = twoScene((a, b) => carried(a, b, HOME_9, HOME_9));
    const r = resolveAt(doc, 0.5);
    const ball = ballIn(doc, r);
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
    const start = ballIn(doc, resolveAt(doc, 1.001));
    const end = ballIn(doc, resolveAt(doc, 3));
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

    const start = ballIn(doc, resolveAt(doc, 1));
    const end = ballIn(doc, resolveAt(doc, 3));
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const span = Math.hypot(dx, dy);

    // Every sample must sit on the line from release point to meeting point.
    // Re-reading the receiver's live position each frame bowed this by metres.
    for (const t of [1.3, 1.7, 2.0, 2.4, 2.8]) {
      const p = ballIn(doc, resolveAt(doc, t));
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
    const nearlyThere = ballIn(doc, r1);
    const arrived = ballIn(doc, rEnd);

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
    const mid = ballIn(doc, resolveAt(doc, 2));
    expect(mid.x).toBeGreaterThan(50);
  });

  it("goes loose when the carrier is cleared", () => {
    const doc = twoScene((a, b) => {
      carried(a, b, HOME_9, null);
      b.ballPos = { x: 90, y: 5 };
    });
    expect(ballIn(doc, resolveAt(doc, 3))).toEqual({ x: 90, y: 5 });
  });

  it("is collected when a carrier is set", () => {
    const doc = twoScene((a, b) => {
      carried(a, b, null, HOME_9);
      a.ballPos = { x: 10, y: 10 };
      b.positions[HOME_9] = { x: 70, y: 40 };
    });
    const arrived = ballIn(doc, resolveAt(doc, 3));
    const player = positionAt(HOME_9, resolveAt(doc, 3), doc);
    expect(Math.hypot(arrived.x - player.x, arrived.y - player.y)).toBeCloseTo(ballGlue(doc), 5);
  });

  it("moves as an ordinary entity when never carried", () => {
    const doc = twoScene((a, b) => {
      a.ballPos = { x: 10, y: 10 };
      b.ballPos = { x: 40, y: 10 };
    });
    expect(ballIn(doc, resolveAt(doc, 1))).toEqual({ x: 10, y: 10 });
    expect(ballIn(doc, resolveAt(doc, 3))).toEqual({ x: 40, y: 10 });
    expect(ballIn(doc, resolveAt(doc, 2)).x).toBeGreaterThan(10);
  });

  it("follows ballPath when one is drawn", () => {
    const doc = twoScene((a, b) => {
      a.ballPos = { x: 10, y: 34 };
      b.ballPos = { x: 60, y: 34 };
      b.ballPath = { c1: { x: 20, y: 60 }, c2: { x: 50, y: 60 } };
    });
    expect(ballIn(doc, resolveAt(doc, 2)).y).toBeGreaterThan(40);
  });
});

describe("loft", () => {
  const lofted = (on: boolean) => {
    const doc = twoScene((a, b) => carried(a, b, HOME_9, HOME_10));
    if (on) doc.scenes[1].loft = true;
    return doc;
  };

  it("is flat on the ground unless the scene says otherwise", () => {
    const doc = lofted(false);
    for (const t of [1, 1.5, 2, 2.5, 3]) {
      expect(ballLift(resolveAt(doc, t), doc)).toBe(0);
    }
  });

  it("rises to its peak halfway and lands", () => {
    const doc = lofted(true);
    const start = sceneStartSeconds(doc, 0) + doc.scenes[0].holdMs / 1000;
    const end = sceneStartSeconds(doc, 1);

    expect(ballLift(resolveAt(doc, start), doc)).toBeCloseTo(0, 5);
    expect(ballLift(resolveAt(doc, (start + end) / 2), doc)).toBeCloseTo(1, 2);
    expect(ballLift(resolveAt(doc, end), doc)).toBeCloseTo(0, 5);
  });

  it("is on the ground again once the scene is at rest", () => {
    const doc = lofted(true);
    expect(ballLift(resolveAt(doc, sceneStartSeconds(doc, 1) + 0.1), doc)).toBe(0);
  });

  it("never leaves the ground on a scene the ball does not travel into", () => {
    const doc = lofted(true);
    expect(ballLift(resolveAt(doc, 0), doc)).toBe(0);
  });

  /** How far along its flight the ball is, as a fraction of the whole travel. */
  const covered = (doc: BoardDoc, u: number): number => {
    const r = transitionInto(doc, 1)!;
    const start = ballIn(doc, { ...r, u: 0 });
    const end = ballIn(doc, { ...r, u: 1 });
    const at = ballIn(doc, { ...r, u });
    return Math.hypot(at.x - start.x, at.y - start.y) / Math.hypot(end.x - start.x, end.y - start.y);
  };

  it("crosses the ground at a constant speed, so the apex is halfway", () => {
    // A ball in the air is not touching the turf that slows a ground pass. Half
    // the flight is half the distance, which is where the arc peaks.
    expect(covered(lofted(true), 0.5)).toBeCloseTo(0.5, 2);
  });

  it("still decelerates when it stays on the ground", () => {
    // easeOutQuad: three quarters of the way there at half the time.
    expect(covered(lofted(false), 0.5)).toBeCloseTo(0.75, 2);
  });
});

describe("frameAt", () => {
  it("positions every player, and the ball once somebody has it", () => {
    const doc = twoScene((a, b) => carried(a, b, HOME_9, HOME_9));
    const frame = frameAt(doc, 2);
    const players = doc.teams.flatMap((t) => t.players);
    expect(Object.keys(frame.positions)).toHaveLength(players.length);
    for (const p of players) expect(frame.positions[p.id]).toBeDefined();
    expect(frame.ball).not.toBeNull();
    expect(frame.resolved.moving).toBe(true);
  });

  it("leaves the ball out until it is given to somebody", () => {
    const doc = twoScene();
    expect(frameAt(doc, 0).ball).toBeNull();
    expect(frameAt(doc, 2).ball).toBeNull();
  });

  it("produces finite coordinates across the whole timeline", () => {
    const doc = twoScene((a, b) => {
      carried(a, b, HOME_9, HOME_9);
      b.paths[HOME_9] = { c1: { x: 20, y: 5 }, c2: { x: 40, y: 5 } };
      b.positions[HOME_9] = { x: 80, y: 60 };
    });
    for (let t = -1; t <= 5; t += 0.1) {
      const frame = frameAt(doc, t);
      for (const p of Object.values(frame.positions)) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
      const ball = frame.ball!;
      expect(Number.isFinite(ball.x) && Number.isFinite(ball.y)).toBe(true);
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

describe("per-scene pace", () => {
  /** Three scenes, with one player covering a known distance into each. */
  const runs = (a: number, b: number): BoardDoc => {
    let doc = addSceneAfter(createBoardDoc(), 0);
    doc = addSceneAfter(doc, 1);
    const start = doc.scenes[0].positions[HOME_9];
    const move = (i: number, dx: number) => ({
      ...doc.scenes[i],
      positions: { ...doc.scenes[i].positions, [HOME_9]: { x: start.x + dx, y: start.y } },
    });
    doc = { ...doc, scenes: [doc.scenes[0], move(1, a), move(2, a + b)] };
    return { ...doc, flow: { speed: 10, endHoldMs: DEFAULT_END_HOLD_MS } };
  };

  it("falls back to the board pace when a scene sets none", () => {
    const doc = runs(20, 20);
    expect(scenePace(doc, 1)).toBe(doc.flow!.speed);
    expect(scenePace(doc, 2)).toBe(doc.flow!.speed);
  });

  it("lets one scene run at its own pace without touching the others", () => {
    const base = runs(20, 20);
    const faster = setScenePace(base, 2, 20);

    const before = sceneTimings(base);
    const after = sceneTimings(faster);
    expect(after[1].travelMs).toBe(before[1].travelMs);
    // Same distance at twice the pace takes half as long.
    expect(after[2].travelMs).toBeCloseTo(before[2].travelMs / 2, 6);
  });

  it("paces each scene independently — slow, fast, slow", () => {
    let doc = runs(20, 20);
    doc = setScenePace(doc, 1, 10);
    doc = setScenePace(doc, 2, 20);
    const timing = sceneTimings(doc);
    expect(scenePace(doc, 1)).toBe(10);
    expect(scenePace(doc, 2)).toBe(20);
    expect(timing[1].travelMs).toBeCloseTo(timing[2].travelMs * 2, 6);
  });

  it("clamps a pace outside the range", () => {
    const doc = runs(20, 20);
    expect(scenePace(setScenePace(doc, 1, 1000), 1)).toBe(MAX_FLOW_SPEED);
    expect(scenePace(setScenePace(doc, 1, -5), 1)).toBe(MIN_FLOW_SPEED);
  });

  it("takes no pace on scene 0 — nothing travels into it", () => {
    const doc = runs(20, 20);
    expect(setScenePace(doc, 0, 25)).toBe(doc);
    expect(sceneTimings(doc)[0].travelMs).toBe(0);
  });

  it("goes back to the board pace when cleared", () => {
    const doc = setScenePace(runs(20, 20), 1, 25);
    expect(scenePace(doc, 1)).toBe(25);
    const cleared = setScenePace(doc, 1, null);
    expect(cleared.scenes[1].speed).toBeUndefined();
    expect(scenePace(cleared, 1)).toBe(cleared.flow!.speed);
  });

  it("is ignored entirely outside flow mode", () => {
    const doc = setScenePace(runs(20, 20), 1, 25);
    const fixed: BoardDoc = { ...doc };
    delete fixed.flow;
    expect(fixed.scenes[1].speed).toBe(25);
    expect(sceneTimings(fixed)[1].travelMs).toBe(fixed.scenes[1].transitionMs);
  });

  it("carries the pace into a scene added after it", () => {
    let doc = setScenePace(runs(20, 20), 2, 22);
    doc = addSceneAfter(doc, 2);
    expect(doc.scenes[3].speed).toBe(22);
    expect(scenePace(doc, 3)).toBe(22);
  });

  it("leaves an added scene on the board pace when its neighbour has none", () => {
    const doc = addSceneAfter(runs(20, 20), 1);
    expect(doc.scenes[2].speed).toBeUndefined();
    expect(scenePace(doc, 2)).toBe(doc.flow!.speed);
  });

  it("keeps a document written before per-scene pacing reading the same", () => {
    const doc = runs(20, 20);
    expect(doc.scenes.every((s) => s.speed === undefined)).toBe(true);
    const paced = { ...doc, flow: { ...doc.flow!, speed: 15 } };
    for (let i = 1; i < paced.scenes.length; i++) expect(scenePace(paced, i)).toBe(15);
  });

  it("still validates with a per-scene pace on it", () => {
    const doc = setScenePace(runs(20, 20), 1, 18.5);
    expect(boardDocSchema.safeParse(doc).success).toBe(true);
  });
});
