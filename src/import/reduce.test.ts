import { describe, expect, it } from "vitest";
import { boardFromTracks } from "./index";
import { chooseScenes, coverage, fitCurve, positionAt } from "./reduce";
import type { Track } from "./tracks";

const track = (
  id: number,
  team: string,
  pts: [number, number, number][],
  number: number | null = null,
): Track =>
  ({
    id,
    team,
    number,
    samples: pts.map(([f, x, y]) => ({ f, x, y })),
  }) as Track;

/** A straight run from (10,20) to (60,20) over two seconds at 25fps. */
const straightRun = (id: number, team: string, y = 20) =>
  track(
    id,
    team,
    Array.from({ length: 51 }, (_, i) => [i + 1, 10 + i, y] as [number, number, number]),
  );

const file = (tracks: Track[], endFrame = 51) => ({
  version: 1,
  source: { clip: "goal.mp4", fps: 25, startFrame: 1, endFrame },
  pitch: { length: 105, width: 68 },
  tracks,
  ball: null,
});

describe("positionAt", () => {
  it("interpolates inside a track's own span", () => {
    const t = track(1, "home", [
      [10, 0, 0],
      [20, 10, 20],
    ]);
    expect(positionAt(t, 15)).toEqual({ x: 5, y: 10 });
  });

  it("holds position outside the span rather than extrapolating", () => {
    // Extrapolating a velocity into frames nobody saw invents a run. Holding is
    // visible on the board as a player standing still, which is the honest failure.
    const t = track(1, "home", [
      [10, 0, 0],
      [20, 10, 0],
    ]);
    expect(positionAt(t, 1)).toEqual({ x: 0, y: 0 });
    expect(positionAt(t, 999)).toEqual({ x: 10, y: 0 });
  });

  it("bridges a gap the detector left in the middle", () => {
    const t = track(1, "home", [
      [1, 0, 0],
      [50, 49, 0],
    ]);
    expect(positionAt(t, 25).x).toBeCloseTo(24, 0);
  });
});

describe("coverage", () => {
  it("measures the share of the window a track spans", () => {
    expect(coverage(straightRun(1, "home"), 1, 101)).toBeCloseTo(0.5, 2);
    expect(coverage(straightRun(1, "home"), 1, 51)).toBeCloseTo(1, 2);
  });
});

describe("chooseScenes", () => {
  it("gives a straight run no scenes beyond its ends", () => {
    // Interpolation already describes it perfectly, so an extra scene would carry no
    // information and cost the coach a click.
    expect(chooseScenes([straightRun(1, "home")], 1, 51, 25)).toEqual([1, 51]);
  });

  it("puts a scene where the play actually turns", () => {
    // Straight out to x=35, then a hard turn back. The corner is the moment worth
    // keeping, and a fixed interval would have cut somewhere else.
    const turn = track(
      1,
      "home",
      Array.from({ length: 51 }, (_, i) => {
        const f = i + 1;
        return (f <= 26 ? [f, 10 + f, 20] : [f, 36, 20 + (f - 26)]) as [number, number, number];
      }),
    );
    const scenes = chooseScenes([turn], 1, 51, 25);
    expect(scenes.length).toBe(3);
    expect(scenes[1]).toBeGreaterThan(20);
    expect(scenes[1]).toBeLessThan(32);
  });

  it("never returns more scenes than the cap", () => {
    const noisy = track(
      1,
      "home",
      Array.from(
        { length: 201 },
        (_, i) => [i + 1, 20 + 12 * Math.sin(i / 2), 30 + 12 * Math.cos(i / 2)] as [number, number, number],
      ),
    );
    expect(chooseScenes([noisy], 1, 201, 25).length).toBeLessThanOrEqual(12);
  });

  it("ignores one jittery track when there are enough to call it an outlier", () => {
    // A single wobbling detection would otherwise demand a scene at every frame, and
    // the board would describe the detector rather than the play.
    const calm = Array.from({ length: 5 }, (_, n) =>
      track(
        n,
        "home",
        Array.from({ length: 51 }, (_, i) => [i + 1, 10 + n * 4, 20] as [number, number, number]),
      ),
    );
    const jittery = track(
      99,
      "away",
      Array.from(
        { length: 51 },
        (_, i) => [i + 1, 40 + (i % 2 ? 9 : -9), 40] as [number, number, number],
      ),
    );
    expect(chooseScenes([...calm, jittery], 1, 51, 25)).toEqual([1, 51]);
  });

  it("reads every player, not just the first", () => {
    const still = track(
      1,
      "home",
      Array.from({ length: 51 }, (_, i) => [i + 1, 10, 20] as [number, number, number]),
    );
    const turning = track(
      2,
      "away",
      Array.from({ length: 51 }, (_, i) => {
        const f = i + 1;
        return (f <= 26 ? [f, 50, 10 + f] : [f, 50, 62 - (f - 26)]) as [number, number, number];
      }),
    );
    expect(chooseScenes([still, turning], 1, 51, 25).length).toBeGreaterThan(2);
  });
});

describe("fitCurve", () => {
  it("returns null for a straight path", () => {
    // `paths` takes null for a straight tween. A bezier fitted to noise would be
    // detail the board cannot justify.
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0 }));
    expect(fitCurve(pts)).toBeNull();
  });

  it("recovers a curve that a straight line misses", () => {
    const pts = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      return { x: t * 40, y: 20 * Math.sin(Math.PI * t) };
    });
    const curve = fitCurve(pts);
    expect(curve).not.toBeNull();
    // The controls must be pulled to the same side as the bulge, in absolute metres.
    expect(curve!.c1.y).toBeGreaterThan(5);
    expect(curve!.c2.y).toBeGreaterThan(5);
  });

  it("is unmoved by a pause partway along", () => {
    // Chord-length parameterisation, so repeated samples at one spot do not drag the
    // curve towards where the player stood still.
    const moving = Array.from({ length: 21 }, (_, i) => ({ x: i, y: 0 }));
    const paused = [...moving.slice(0, 10), ...Array(15).fill({ x: 9, y: 0 }), ...moving.slice(10)];
    expect(fitCurve(paused)).toBeNull();
  });
});

describe("boardFromTracks", () => {
  it("builds a valid two-sided board", () => {
    const result = boardFromTracks(file([straightRun(1, "home", 20), straightRun(2, "away", 40)]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.teams[0].players).toHaveLength(1);
    expect(result.doc.teams[1].players).toHaveLength(1);
    expect(result.doc.scenes.length).toBeGreaterThanOrEqual(2);
  });

  it("gives every player a position in every scene", () => {
    // The schema requires it, and a missing entry is a player who vanishes mid-board.
    const result = boardFromTracks(
      file([
        straightRun(1, "home", 20),
        straightRun(2, "home", 30),
        track(3, "away", [
          [20, 50, 40],
          [51, 60, 44],
        ]),
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.doc.teams.flatMap((t) => t.players.map((p) => p.id));
    for (const scene of result.doc.scenes) {
      expect(Object.keys(scene.positions).sort()).toEqual([...ids].sort());
    }
  });

  it("leaves the first scene's transition at zero", () => {
    const result = boardFromTracks(file([straightRun(1, "home"), straightRun(2, "away", 40)]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.scenes[0].transitionMs).toBe(0);
    expect(result.doc.scenes[1].transitionMs).toBeGreaterThan(0);
  });

  it("gives the board no ball at all", () => {
    // Nothing tracked one, and a scene naming no carrier and storing no position simply
    // has none (D44). Putting it on a player at random would be a claim about the play.
    const result = boardFromTracks(file([straightRun(1, "home"), straightRun(2, "away", 40)]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const scene of result.doc.scenes) {
      expect(scene.carrier).toBeNull();
      expect(scene.ballPos).toBeUndefined();
    }
  });

  it("drops referees and tracks whose side is unknown", () => {
    const result = boardFromTracks(
      file([
        straightRun(1, "home"),
        straightRun(2, "away", 40),
        straightRun(3, "referee", 50),
        straightRun(4, "unknown", 55),
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.teams[0].players).toHaveLength(1);
    expect(result.doc.teams[1].players).toHaveLength(1);
  });

  it("keeps a read shirt number and invents one only where none was read", () => {
    const result = boardFromTracks(
      file([straightRun(1, "home"), straightRun(2, "away", 40)].map((t, i) =>
        i === 0 ? { ...t, number: 10 } : t,
      ) as Track[]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.teams[0].players[0].number).toBe(10);
    expect(result.doc.teams[1].players[0].number).toBeGreaterThan(0);
  });

  it("drops a track that was barely on screen", () => {
    const brief = track(9, "home", [
      [1, 5, 5],
      [4, 6, 5],
    ]);
    const result = boardFromTracks(file([straightRun(1, "home"), straightRun(2, "away", 40), brief]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.teams[0].players).toHaveLength(1);
  });

  it("refuses a file it does not understand, in a translatable way", () => {
    const result = boardFromTracks({ nope: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("import.tracks.invalid");
  });

  it("refuses a file with nobody worth importing", () => {
    const result = boardFromTracks(file([straightRun(1, "referee")]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("import.tracks.empty");
  });
});
