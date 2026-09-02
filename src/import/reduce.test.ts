import { describe, expect, it } from "vitest";
import { boardFromTracks } from "./index";
import {
  carrierAt,
  chooseScenes,
  chooseWindow,
  coverage,
  fitCurve,
  positionAt,
  splitImpossible,
  withoutSpikes,
} from "./reduce";
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

/**
 * A straight run over two seconds at 25fps, at 5 m/s — a real pace.
 *
 * It used to cover a metre per frame, which is 25 m/s, and every test here passed
 * happily until `splitImpossible` pointed out that nobody runs that fast.
 */
const straightRun = (id: number, team: string, y = 20) =>
  track(
    id,
    team,
    Array.from({ length: 51 }, (_, i) => [i + 1, 10 + i * 0.2, y] as [number, number, number]),
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
        return (f <= 26 ? [f, 10 + f * 0.2, 20] : [f, 15.2, 20 + (f - 26) * 0.2]) as [
          number,
          number,
          number,
        ];
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
        (_, i) =>
          [i + 1, 20 + 3 * Math.sin(i / 12), 30 + 3 * Math.cos(i / 12)] as [number, number, number],
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
        (_, i) => [i + 1, 40 + (i % 2 ? 0.35 : -0.35), 40] as [number, number, number],
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
        return (f <= 26 ? [f, 50, 10 + f * 0.2] : [f, 50, 15.2 - (f - 26) * 0.2]) as [
          number,
          number,
          number,
        ];
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

  it("gives the board no ball when the file has none", () => {
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

describe("chooseWindow", () => {
  const spanning = (id: number, a: number, b: number) =>
    track(
      id,
      "home",
      Array.from({ length: b - a + 1 }, (_, i) => [a + i, 10 + i * 0.1, 20] as [number, number, number]),
    );

  it("trims to where most players are on screen", () => {
    // Two players for the whole clip and six who only arrive halfway. A board over the
    // whole clip carries the six as invented positions for half its length; a board
    // over the second half carries eight real ones.
    const early = [spanning(1, 1, 300), spanning(2, 1, 300)];
    const late = Array.from({ length: 6 }, (_, i) => spanning(10 + i, 230, 300));
    const w = chooseWindow([...early, ...late], 1, 300, 25);
    expect(w.from).toBeGreaterThanOrEqual(230);
    expect(w.to).toBe(300);
  });

  it("keeps the whole clip when everyone is there for it", () => {
    const all = Array.from({ length: 5 }, (_, i) => spanning(i, 1, 300));
    expect(chooseWindow(all, 1, 300, 25)).toEqual({ from: 1, to: 300 });
  });

  it("will not trim below a passage worth watching", () => {
    // Otherwise the densest window is always the single frame everybody appears in.
    const all = [spanning(1, 1, 300), ...Array.from({ length: 8 }, (_, i) => spanning(10 + i, 290, 300))];
    const w = chooseWindow(all, 1, 300, 25);
    expect(w.to - w.from).toBeGreaterThanOrEqual(Math.round(2.5 * 25));
  });

  it("prefers the longer of two equally full windows", () => {
    const all = Array.from({ length: 4 }, (_, i) => spanning(i, 1, 300));
    const w = chooseWindow(all, 1, 300, 25);
    expect(w.to - w.from).toBe(299);
  });
});

describe("impossible movement", () => {
  const at = (f: number, x: number, y: number) => ({ f, x, y });

  it("cuts a track where it teleports", () => {
    // Twelve metres between adjacent frames is 360 m/s. The tracker changed its mind
    // about who it was following, so the two halves are two people.
    const t = track(1, "home", [
      [1, 10, 20],
      [2, 10.2, 20],
      [3, 40, 20],
      [4, 40.2, 20],
    ]);
    expect(splitImpossible(t, 32)).toHaveLength(2);
  });

  it("gives the halves different ids", () => {
    // They map players back to their source. Two fragments sharing an id would claim
    // to be the same person.
    const t = track(1, "home", [
      [1, 10, 20],
      [2, 10.2, 20],
      [3, 40, 20],
      [4, 40.2, 20],
    ]);
    const ids = splitImpossible(t, 32).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves a genuine sprint alone", () => {
    const sprint = Array.from(
      { length: 20 },
      (_, i) => [i + 1, 10 + i * (9 / 32), 20] as [number, number, number],
    );
    expect(splitImpossible(track(1, "home", sprint), 32)).toHaveLength(1);
  });

  it("does not cut across an occlusion the player ran through", () => {
    // Nothing was seen for half a second. That the ends are far apart says the player
    // kept running, not that they teleported — and cutting there costs a whole run.
    const t = track(1, "home", [
      [1, 10, 20],
      [2, 10.3, 20],
      [18, 22, 20],
      [19, 22.3, 20],
    ]);
    expect(splitImpossible(t, 32)).toHaveLength(1);
  });

  it("removes a sample that leaps away and comes straight back", () => {
    // One detection landing on the wrong person is a bad sample, not two players.
    const spiked = [at(1, 10, 20), at(2, 10.2, 20), at(3, 45, 20), at(4, 10.6, 20), at(5, 10.8, 20)];
    const cleaned = withoutSpikes(spiked, 32);
    expect(cleaned).toHaveLength(4);
    expect(cleaned.every((s) => s.x < 20)).toBe(true);
  });

  it("keeps a track whole when a spike is all that was wrong with it", () => {
    const t = track(1, "home", [
      [1, 10, 20],
      [2, 10.2, 20],
      [3, 45, 20],
      [4, 10.6, 20],
      [5, 10.8, 20],
    ]);
    expect(splitImpossible(t, 32)).toHaveLength(1);
  });
});

describe("carrierAt", () => {
  const ball = (f: number, x: number, y: number) => ({ f, x, y });
  const players = [
    { id: "home-1", track: track(1, "home", [[10, 20, 30], [20, 20, 30]]) },
    { id: "away-1", track: track(2, "away", [[10, 60, 30], [20, 60, 30]]) },
  ];

  it("gives the ball to the nearest player", () => {
    expect(carrierAt([ball(15, 21, 30)], players, 15)).toBe("home-1");
    expect(carrierAt([ball(15, 59, 30)], players, 15)).toBe("away-1");
  });

  it("gives it to nobody when it is nearer nobody", () => {
    // A ball in flight belongs to no one, and the nearest player to it is whoever
    // happens to be standing under it. Null is the honest answer.
    expect(carrierAt([ball(15, 40, 30)], players, 15)).toBeNull();
  });

  it("will not use a sighting from another moment", () => {
    // The ball moves. Where it was a second ago says nothing about who holds it now.
    expect(carrierAt([ball(15, 21, 30)], players, 60)).toBeNull();
  });

  it("says nothing when the ball was never found", () => {
    expect(carrierAt([], players, 15)).toBeNull();
  });
});

describe("the ball on a board", () => {
  const withBall = (samples: { f: number; x: number; y: number }[]) => ({
    ...file([straightRun(1, "home", 20), straightRun(2, "away", 40)]),
    ball: { samples },
  });

  it("hands the ball to whoever is nearest at each scene", () => {
    // A sighting on every frame, as the producer gives it — the staleness guard means a
    // lone sighting says nothing about a scene several seconds away, which is correct
    // and is what the next test leans on.
    const result = boardFromTracks(
      withBall(Array.from({ length: 51 }, (_, i) => ({ f: i + 1, x: 10 + i * 0.2, y: 20.3 }))),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.scenes.every((s) => s.carrier?.startsWith("home"))).toBe(true);
  });

  it("lets the holder keep it through scenes that cannot tell", () => {
    // A carrier stands until somebody else takes it, and the flight between two holders
    // is the pass. Blanking the carrier mid-board would make the ball vanish and return.
    const result = boardFromTracks(withBall([{ f: 3, x: 10.5, y: 20 }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.scenes.every((s) => s.carrier !== null)).toBe(true);
  });

  it("does not let the ball appear from nowhere partway through", () => {
    // Found only late, it still starts the board with the player who first takes it,
    // rather than materialising in scene three.
    const result = boardFromTracks(withBall([{ f: 49, x: 19.6, y: 20 }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.scenes[0].carrier).not.toBeNull();
  });

  it("leaves the board with no ball at all when none was found", () => {
    const result = boardFromTracks(file([straightRun(1, "home"), straightRun(2, "away", 40)]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const s of result.doc.scenes) {
      expect(s.carrier).toBeNull();
      expect(s.ballPos).toBeUndefined();
    }
  });
});
