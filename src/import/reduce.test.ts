import { describe, expect, it } from "vitest";
import { PALETTE } from "@/components/ui/palette";
import { AWAY, HOME } from "@/formations";
import { boardFromTracks } from "./index";
import {
  breaks,
  carrierAt,
  KICK_S,
  kickedBy,
  scored,
  touchedAt,
  touches,
  leftBehind,
  chooseScenes,
  witnessed,
  chooseWindow,
  coverage,
  fitCurve,
  positionAt,
  restartAt,
  splitImpossible,
  steady,
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
    // Straight out, then a hard turn back. The corner is the moment worth keeping, and a
    // fixed interval would have cut somewhere else. The run is a tactical distance rather
    // than a stride: `SCENE_TOLERANCE_M` describes a player changing where they are going,
    // and a metre of it is the detector's own wobble.
    const turn = track(
      1,
      "home",
      Array.from({ length: 51 }, (_, i) => {
        const f = i + 1;
        return (f <= 26 ? [f, 10 + f * 0.6, 20] : [f, 25.6, 20 + (f - 26) * 0.6]) as [
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

  it("does not field a player watched for a second, however much of the window that is", () => {
    // 30 frames of 51 is 59% coverage and 1.2 seconds. The share says field them; the clock
    // says they never made a run (D66).
    const brief = track(
      9,
      "home",
      Array.from({ length: 30 }, (_, i) => [i + 1, 40 + i * 0.2, 50] as [number, number, number]),
    );
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

describe("steady", () => {
  it("undoes a turnover that gives the ball straight back", () => {
    // A coach watching SNGS-121: the home team passes across the pitch and never loses it,
    // and the board showed the blue team holding it for one scene in the middle.
    expect(steady(["home-1", "home-4", "away-9", "home-2", "home-7"])).toEqual([
      "home-1",
      "home-4",
      "home-4",
      "home-2",
      "home-7",
    ]);
  });

  it("leaves a turnover that sticks", () => {
    const won = ["home-1", "home-4", "away-9", "away-3", "away-9"];
    expect(steady(won)).toEqual(won);
  });

  it("leaves an exchange between team-mates alone", () => {
    const passed = ["home-1", "home-4", "home-1"];
    expect(steady(passed)).toEqual(passed);
  });

  it("says nothing where nobody is holding it", () => {
    const gap = ["home-1", null, "away-9", null, "home-2"];
    expect(steady(gap)).toEqual(gap);
  });
});

describe("witnessed", () => {
  it("counts the samples, where coverage counts the span", () => {
    // A track seen at both ends of a window and nowhere in between covers it completely
    // and was watched for almost none of it. That gap is where a board invents a player
    // standing still, and `coverage` cannot see it.
    const holed = track(1, "home", [
      [1, 10, 20],
      [2, 10.2, 20],
      [99, 30, 20],
      [100, 30.2, 20],
    ]);
    expect(coverage(holed, 1, 100)).toBe(1);
    expect(witnessed(holed, 1, 100, 5)).toBeLessThan(0.3);
  });

  it("is one for a track sampled through the whole window", () => {
    const solid = track(
      1,
      "home",
      Array.from({ length: 100 }, (_, i) => [i + 1, 10 + i * 0.1, 20] as [number, number, number]),
    );
    expect(witnessed(solid, 1, 100, 5)).toBe(1);
  });
});

describe("chooseScenes", () => {
  const run = (id: number, a: number, b: number) =>
    track(
      id,
      "home",
      Array.from(
        { length: b - a + 1 },
        (_, i) => [a + i, 10 + i * 0.1, 20] as [number, number, number],
      ),
    );

  /** Out and back, turning at frame 150 — fifteen metres from the straight tween. */
  const bend = (id: number) =>
    track(
      id,
      "home",
      Array.from({ length: 300 }, (_, i) => {
        const f = i + 1;
        return [f, 10 + (f <= 150 ? f * 0.1 : (300 - f) * 0.1), 20] as [number, number, number];
      }),
    );

  it("will not put a scene where most of the roster is off screen", () => {
    // The turn at 150 is where the deviation test wants a scene, and it is the frame the
    // tracker was blind for. A scene there asks the coach to look at a position nobody saw.
    const tracks = [run(1, 1, 300), run(2, 1, 300), bend(3), bend(4)];
    const backedAt = (f: number) => (f > 120 && f < 180 ? 0.1 : 1);
    const placed = chooseScenes(tracks, 1, 300, 25, undefined, undefined, [], backedAt);
    expect(placed.some((f) => f > 120 && f < 180)).toBe(false);

    // And without the floor it goes straight there, which is what the floor is for.
    const unguarded = chooseScenes(tracks, 1, 300, 25);
    expect(unguarded.some((f) => f > 120 && f < 180)).toBe(true);
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

  it("takes a much longer window that is one fragment short of the fullest", () => {
    // A fragment is not a player: an extra covering piece is often somebody already on
    // the board, so one of them does not outweigh four times the football.
    const whole = Array.from({ length: 5 }, (_, i) => spanning(i, 1, 300));
    const late = [spanning(99, 230, 300)];
    expect(chooseWindow([...whole, ...late], 1, 300, 25)).toEqual({ from: 1, to: 300 });
  });

  it("will not give up two", () => {
    const whole = Array.from({ length: 5 }, (_, i) => spanning(i, 1, 300));
    const late = [spanning(98, 230, 300), spanning(99, 230, 300)];
    expect(chooseWindow([...whole, ...late], 1, 300, 25).from).toBeGreaterThanOrEqual(230);
  });

  it("does not count a side past what the board can field", () => {
    // Fourteen home fragments and eleven are the same eleven once MAX_PER_SIDE has had
    // them, so the window they crowd into is not fuller — only shorter.
    const whole = Array.from({ length: 11 }, (_, i) => spanning(i, 1, 300));
    const late = Array.from({ length: 14 }, (_, i) => spanning(50 + i, 230, 300));
    expect(chooseWindow([...whole, ...late], 1, 300, 25)).toEqual({ from: 1, to: 300 });
  });

  it("prefers a passage it watched to a longer one it mostly remembers", () => {
    // Both windows field the same four players. In the first they are on screen; in the
    // second half the passage is a hole and the board would draw it from memory.
    const watched = Array.from({ length: 4 }, (_, i) => spanning(i, 1, 150));
    const holed = watched.map((t) =>
      track(
        t.id + 10,
        "home",
        t.samples
          .filter((s) => s.f <= 40 || s.f >= 140)
          .map((s) => [s.f + 150, s.x, s.y] as [number, number, number]),
      ),
    );
    const w = chooseWindow([...watched, ...holed], 1, 300, 25);
    expect(w.to).toBeLessThanOrEqual(160);
  });

  it("cannot be talked into a short window by fragments that clear the share", () => {
    // Eight pieces of 1.4 s each clear MIN_COVERAGE inside a 2.5 s window and nowhere else,
    // so counting them buys a passage a quarter the length for a roster nobody watched.
    const whole = Array.from({ length: 4 }, (_, i) => spanning(i, 1, 300));
    const brief = Array.from({ length: 8 }, (_, i) => spanning(20 + i, 237, 271));
    expect(chooseWindow([...whole, ...brief], 1, 300, 25)).toEqual({ from: 1, to: 300 });
  });

  it("starts at a set piece even where fewer players are on screen", () => {
    // The case this exists for. During a corner the players are bunched in the box
    // occluding each other, so their tracks fragment and the count drops — and the
    // window walked past four corners and a kick-off to the open play afterwards.
    const early = [spanning(1, 1, 300), spanning(2, 1, 300)];
    const late = Array.from({ length: 6 }, (_, i) => spanning(10 + i, 230, 300));
    const w = chooseWindow([...early, ...late], 1, 300, 25, undefined, undefined, 100);
    expect(w.from).toBeLessThanOrEqual(100);
    expect(w.to).toBeGreaterThan(100);
  });

  it("changes nothing when the passage holds no set piece", () => {
    const early = [spanning(1, 1, 300), spanning(2, 1, 300)];
    const late = Array.from({ length: 6 }, (_, i) => spanning(10 + i, 230, 300));
    const all = [...early, ...late];
    expect(chooseWindow(all, 1, 300, 25, undefined, undefined, null)).toEqual(
      chooseWindow(all, 1, 300, 25),
    );
  });
});

describe("restartAt", () => {
  const pitch = { length: 105, width: 68 };
  const resting = (from: number, to: number, x: number, y: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ f: from + i, x, y }));

  it("finds the frame the ball leaves the corner arc", () => {
    // A corner: the ball sits on the arc for three seconds, then is struck.
    const ball = [...resting(40, 115, 104.9, -0.4), { f: 130, x: 90, y: 20 }];
    expect(restartAt(ball, pitch, 25)).toBe(115);
  });

  it("finds a kick-off on the centre spot", () => {
    expect(restartAt(resting(1, 60, 52.4, 34.2), pitch, 25)).toBe(60);
  });

  it("ignores a ball that merely rolls past the spot", () => {
    // Four frames is 0.16s. Nobody placed that.
    const ball = [...resting(40, 43, 105, 0), { f: 60, x: 80, y: 30 }];
    expect(restartAt(ball, pitch, 25)).toBeNull();
  });

  it("ignores a ball at rest anywhere else", () => {
    // A free kick is taken wherever the foul was, so it has no position to recognise.
    expect(restartAt(resting(1, 100, 21.6, 7.2), pitch, 25)).toBeNull();
  });

  it("takes the longest rest when a clip holds more than one", () => {
    const ball = [
      ...resting(1, 20, 52.5, 34),
      { f: 40, x: 70, y: 30 },
      ...resting(60, 160, 104.8, 0.3),
    ];
    expect(restartAt(ball, pitch, 25)).toBe(160);
  });

  it("says nothing about a file with no ball", () => {
    expect(restartAt([], pitch, 25)).toBeNull();
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

  it("still cuts a gridded file, where samples are a slot apart", () => {
    // A producer that stores one position per time slot leaves consecutive samples five
    // frames apart at 48 fps. A gap rule counting raw frames calls that "not adjacent"
    // and stops cutting anything — the tell is a fragment count exactly equal to the
    // track count, which looks like clean tracking rather than a disabled defence.
    const t = track(1, "home", [
      [1, 10, 20],
      [6, 10.2, 20],
      [11, 40, 20],
      [16, 40.2, 20],
    ]);
    expect(splitImpossible(t, 48, undefined, 0.1)).toHaveLength(2);
    // Without being told the spacing, the same file survives whole.
    expect(splitImpossible(t, 48)).toHaveLength(1);
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

  it("does not hand the ball to a player it is flying over", () => {
    // The ball crosses home-1 for a frame on its way somewhere else. Read frame by frame
    // that is a pass to him, and the board draws one (D71): a coach watching SNGS-121 saw
    // a short pass drawn before the long ball that actually happened.
    const over = [
      ball(14, 10, 30),
      ball(15, 21, 30),
      ball(16, 32, 30),
      ball(17, 43, 30),
      ball(18, 54, 30),
    ];
    expect(carrierAt(over, players, 15, undefined, 25)).toBeNull();
  });

  it("hands it to a player who keeps it", () => {
    const kept = [ball(15, 21, 30), ball(16, 21.2, 30), ball(17, 21.1, 30), ball(18, 21.3, 30)];
    expect(carrierAt(kept, players, 15, undefined, 25)).toBe("home-1");
  });
});

describe("a holder the ball has left", () => {
  const players = [
    { id: "home-1", track: track(1, "home", [[10, 20, 30], [20, 20, 30]]) },
    { id: "away-1", track: track(2, "away", [[10, 60, 30], [20, 60, 30]]) },
  ];
  const ball = (f: number, x: number, y: number) => ({ f, x, y, conf: 0.9 });

  it("is no longer the holder once a sighting puts the ball out of his reach", () => {
    expect(leftBehind([ball(15, 40, 30)], players, 15, "home-1")).toBe(true);
    expect(leftBehind([ball(15, 21, 30)], players, 15, "home-1")).toBe(false);
  });

  it("says nothing where there is no evidence", () => {
    // No sighting at this frame, no holder, or a holder whose track does not reach it: all
    // three are absence of evidence, and the carry-forward rule stands.
    expect(leftBehind([ball(80, 40, 30)], players, 15, "home-1")).toBe(false);
    expect(leftBehind([ball(15, 40, 30)], players, 15, null)).toBe(false);
    expect(leftBehind([ball(15, 40, 30)], players, 15, "nobody")).toBe(false);
  });
});

describe("whose boot a flight came off", () => {
  const players = [
    { id: "home-1", track: track(1, "home", [[10, 20, 30], [30, 20, 30]]) },
    { id: "away-1", track: track(2, "away", [[10, 60, 30], [30, 60, 30]]) },
  ];
  const ball = (f: number, x: number, y: number) => ({ f, x, y, conf: 0.9 });
  // Kicked at 12 from home-1's feet, clear of everybody by 20.
  const struck = [ball(12, 21, 30), ball(16, 32, 30), ball(20, 44, 30)];

  it("is the last player within reach before it came loose", () => {
    expect(kickedBy(struck, players, 20, 25)).toBe("home-1");
  });

  it("says nothing when the ball was nobody's for longer than KICK_S", () => {
    expect(kickedBy(struck, players, 20 + Math.ceil(KICK_S * 25) + 5, 25)).toBeNull();
    expect(kickedBy([], players, 20, 25)).toBeNull();
  });
});

describe("one-touch play", () => {
  const runner = track(1, "home", [[1, 20, 30], [40, 20, 30]]);
  const other = track(2, "away", [[1, 60, 60], [40, 60, 60]]);
  const players = [
    { id: "home-1", track: runner },
    { id: "away-1", track: other },
  ];
  const ball = (f: number, x: number, y: number) => ({ f, x, y, conf: 0.9 });

  it("is a change of direction beside somebody, not a hold", () => {
    // Arrives at him along x, leaves along y: the hold test sees nobody keeping it and
    // says nothing, which is how a coach's possession highlight came back as one player
    // carrying the ball the length of the move.
    const turned = [
      ball(15, 14, 30),
      ball(17, 16.5, 30),
      ball(19, 19, 30),
      ball(21, 20, 32),
      ball(23, 20, 36),
      ball(25, 20, 40),
    ];
    expect(carrierAt(turned, players, 19, undefined, 25)).toBeNull();
    expect(touchedAt(turned, players, 19, 25)).toBe("home-1");
    expect(touches(turned, [runner, other], 25)).toContain(19);
  });

  it("is not a ball flying past him in a straight line", () => {
    const across = Array.from({ length: 11 }, (_, i) => ball(15 + i * 2, 10 + i * 2.5, 30));
    expect(touchedAt(across, players, 19, 25)).toBeNull();
  });

  it("is not the wobble of a ball barely moving", () => {
    // A metre of position noise on a slow ball is a right angle, and this camera has one.
    const dawdle = [
      ball(15, 19.8, 30),
      ball(17, 20.0, 30.1),
      ball(19, 20.1, 29.9),
      ball(21, 20.0, 30.2),
      ball(23, 20.2, 30.0),
    ];
    expect(touchedAt(dawdle, players, 19, 25)).toBeNull();
  });
});

describe("a player whose side nobody could read", () => {
  const ball = (f: number, x: number, y: number) => ({ f, x, y, conf: 0.9 });
  const named = [{ id: "away-1", track: track(2, "away", [[10, 23, 30], [20, 23, 30]]) }];
  const unreadable = track(3, "unknown", [[10, 21, 30], [20, 21, 30]]);

  it("blocks the ball rather than being stepped over", () => {
    // The keeper's pass was received by a shirt the split could not read, so the board
    // handed it to the next-nearest player -- an opponent -- and drew a keeper passing to
    // the opposition on a clip where that never happened.
    const seen = [ball(15, 20, 30)];
    expect(carrierAt(seen, named, 15)).toBe("away-1");
    expect(carrierAt(seen, named, 15, undefined, undefined, [unreadable])).toBeNull();
  });

  it("does not block when the ball is not his either", () => {
    const seen = [ball(15, 24, 30)];
    expect(carrierAt(seen, named, 15, undefined, undefined, [unreadable])).toBe("away-1");
  });
});

describe("a silence the ball moved across", () => {
  const players = [track(1, "home", [[10, 20, 30], [40, 20, 30]])];
  const ball = (f: number, x: number, y: number) => ({ f, x, y, conf: 0.9 });

  it("marks where the ball turned up, and where it was struck from", () => {
    // A shot: last seen at his feet on frame 12, next seen thirty metres away on 30.
    const shot = [ball(11, 20, 31), ball(12, 20.5, 30.5), ball(30, 50, 30), ball(31, 50, 30)];
    expect(breaks(shot, players, 25)).toEqual(expect.arrayContaining([30, 12]));
  });

  it("does not mark a departure nobody was near", () => {
    // Already in flight when it was last seen: a scene there splits one pass into two.
    const crossing = [ball(11, 60, 10), ball(12, 62, 10), ball(30, 90, 10)];
    expect(breaks(crossing, players, 25)).toEqual([30]);
  });

  it("ignores a gap the ball did not move across", () => {
    const blink = [ball(12, 20.5, 30.5), ball(30, 21, 30)];
    expect(breaks(blink, players, 25)).toEqual([]);
  });
});

describe("the kits a board wears", () => {
  const plain = () => file([straightRun(1, "home", 20), straightRun(2, "away", 40)]);

  it("takes them from the file, in the picker's own colours", () => {
    // Measured off the shirts, snapped to the swatches the team picker offers: a board
    // painted two colours that appear nowhere in the picker cannot be re-picked or matched
    // to a link by hand.
    const out = boardFromTracks({ ...plain(), kits: { home: "#3a81d1", away: "#d1493a" } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.doc.teams.map((t) => t.color)).toEqual(["#2563eb", "#e11d48"]);
    for (const team of out.doc.teams) expect(PALETTE).toContain(team.color);
  });

  it("never puts both sides in the same colour", () => {
    // Two kits that measure near the same swatch: the better match keeps it and the other
    // takes its next choice, because two teams in one colour is not a board.
    const out = boardFromTracks({ ...plain(), kits: { home: "#d1493a", away: "#c04030" } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const [home, away] = out.doc.teams.map((t) => t.color);
    expect(home).not.toBe(away);
    expect(PALETTE).toContain(home);
    expect(PALETTE).toContain(away);
  });

  it("keeps its own palette when the file says nothing", () => {
    const out = boardFromTracks(plain());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.doc.teams.map((t) => t.color)).toEqual([HOME.color, AWAY.color]);
  });

  it("puts readable numbers on a light kit and a dark one", () => {
    const out = boardFromTracks({ ...plain(), kits: { home: "#e6e6e6", away: "#1b2a4a" } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.doc.teams.map((t) => t.textColor)).toEqual(["#000000", "#ffffff"]);
  });
});

describe("a ball over the goal line", () => {
  const pitch = { length: 105, width: 68 };

  it("is in the net when it crossed between the posts", () => {
    expect(scored({ x: -0.8, y: 35 }, pitch)).toEqual({ x: -0.8, y: 35 });
    expect(scored({ x: 105.5, y: 33 }, pitch)).toEqual({ x: 105.5, y: 33 });
    // No deeper than the goal the board draws, however far out the model put it.
    expect(scored({ x: -3.5, y: 34 }, pitch)!.x).toBe(-2);
  });

  it("is not, outside the posts or far off the field", () => {
    expect(scored({ x: -1, y: 9 }, pitch)).toBeNull();
    expect(scored({ x: -20, y: 34 }, pitch)).toBeNull();
    expect(scored({ x: 50, y: 34 }, pitch)).toBeNull();
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

  it("lets the holder keep it through a silence the ball never contradicts", () => {
    // A carrier stands until somebody else takes it, and the flight between two holders is
    // the pass. Blanking the carrier at a scene that simply cannot tell would make the ball
    // vanish and return. Seen at his feet, then not seen: the board keeps it on him for
    // CARRY_S, and the test below is the other end of the same rule.
    const seen = Array.from({ length: 12 }, (_, i) => ({ f: i + 1, x: 10 + i * 0.2, y: 20.3 }));
    const result = boardFromTracks(withBall(seen));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.scenes[0].carrier).toBe("home-1");
  });

  it("draws a ball nobody is near where it actually is", () => {
    // The pass and the shot: both end with the ball metres from everybody, and the carrier
    // model alone leaves it on the boot of whoever last had it -- a coach reads that as a
    // player dribbling through a pass he played. Where the file says the ball is nobody's,
    // the board says so and draws it.
    const seen = Array.from({ length: 51 }, (_, i) => ({
      f: i + 1,
      x: 10 + i * 0.2,
      y: i < 12 ? 20.3 : 60,
    }));
    const result = boardFromTracks(withBall(seen));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const away = result.doc.scenes.filter((s) => s.carrier === null && s.ballPos);
    expect(away.length).toBeGreaterThan(0);
    expect(away[0].ballPos!.y).toBeCloseTo(60, 0);
    // Never both: a scene with a carrier draws the ball on him (schema).
    expect(result.doc.scenes.every((s) => s.carrier === null || s.ballPos === undefined)).toBe(
      true,
    );
  });

  it("puts a scene where the ball comes loose", () => {
    // A handover is only visible where the ball ARRIVES, so a pass whose receiver was never
    // tracked leaves no scene at all. The moment it leaves is the event.
    const seen = Array.from({ length: 51 }, (_, i) => ({
      f: i + 1,
      x: 10 + i * 0.2,
      y: i < 20 ? 20.3 : 60,
    }));
    const result = boardFromTracks(withBall(seen));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // At the touch that sent it, or the first sighting clear of everybody: either is the
    // moment it left, and which one is marked depends on whether the turn was visible.
    expect(result.frames.find((f) => f >= 15 && f <= 26)).toBeDefined();
  });

  it("names the player a flight came off, so the pass has a passer", () => {
    // With the flight drawn but nobody before it, the board shows the ball arriving out of
    // thin air -- reported by the coach one round after `flights` went in. A flight starts
    // with the ball already clear of everybody, so the kicker is at the last sighting
    // before it where somebody was still within reach.
    // Never seen at anybody's feet long enough to be theirs: three sightings a few metres
    // off home-1, then clear of everybody. The opening scene is his all the same, because
    // that is where the ball came from.
    const seen = Array.from({ length: 32 }, (_, i) => ({
      f: i + 20,
      x: 10 + (i + 19) * 0.2,
      y: i < 3 ? 22.5 : 60,
    }));
    const result = boardFromTracks(withBall(seen));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.scenes[0].carrier).toBe("home-1");
    expect(result.doc.scenes.some((s) => s.carrier === null && s.ballPos)).toBe(true);
  });

  it("draws a ball just past the goal line on it, and one in the crowd not at all", () => {
    // The shot is the case: a ball over the line is off the field by a metre or two, and
    // dropping it takes the ball off the board at the one moment a coach is watching it.
    // Far outside is the camera model failing, and drawing that moves the play off the
    // pitch entirely.
    const over = Array.from({ length: 51 }, (_, i) => ({ f: i + 1, x: i < 12 ? 10 : -2, y: 30 }));
    const scored = boardFromTracks(withBall(over));
    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    const drawn = scored.doc.scenes.filter((s) => s.ballPos);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn[drawn.length - 1].ballPos!.x).toBe(0);

    const miles = Array.from({ length: 51 }, (_, i) => ({ f: i + 1, x: i < 12 ? 10 : -20, y: 30 }));
    const lost = boardFromTracks(withBall(miles));
    expect(lost.ok).toBe(true);
    if (!lost.ok) return;
    expect(lost.doc.scenes.some((s) => s.ballPos && s.ballPos.x < 0)).toBe(false);
  });

  it("leaves the ball in the net once it has crossed the line", () => {
    // Play is over: a goal drawn back on the pitch, among the defenders who were standing
    // on the line, reads as them winning it -- which is what a coach reported.
    const shot = Array.from({ length: 51 }, (_, i) => ({
      f: i + 1,
      x: i < 12 ? 10 : i < 30 ? -1 : 3,
      y: i < 12 ? 20.3 : 34,
    }));
    const result = boardFromTracks(withBall(shot));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.doc.scenes.filter((s) => s.ballPos && s.ballPos.x < 0);
    expect(after.length).toBeGreaterThan(0);
    // Nothing puts it back on the pitch afterwards, and nobody is holding it.
    const last = result.doc.scenes[result.doc.scenes.length - 1];
    expect(last.carrier).toBeNull();
    expect(last.ballPos!.x).toBeLessThan(0);
  });

  it("stops naming a holder once the ball has gone unseen for too long", () => {
    // The other half of the same rule. Carrying a holder forward reads the ball's
    // silence, and past CARRY_S the silence says nothing about who has it -- on a coach's
    // clip 1.8 s of it handed the other team's attack to the player who last held it.
    const result = boardFromTracks(withBall([{ f: 3, x: 10.5, y: 20 }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const carriers = result.doc.scenes.map((s) => s.carrier);
    expect(carriers[0]).toBe("home-1");
    expect(carriers[carriers.length - 1]).toBeNull();
  });

  it("does not let the ball appear from nowhere partway through", () => {
    // Found only late, it still starts the board with the player who first takes it,
    // rather than materialising in scene three.
    const result = boardFromTracks(withBall([{ f: 49, x: 19.6, y: 20 }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.scenes[0].carrier).not.toBeNull();
  });

  it("does not hand the ball to a player who is not on the pitch yet", () => {
    // `positionAt` clamps outside a track's range, so a player first seen late reports
    // that position when asked about an early frame. The ball must not be given to them:
    // measured on SNGS-060 the carrier at scene two had a track beginning 38 frames later.
    const late = { ...straightRun(3, "home", 30), samples: straightRun(3, "home", 30).samples.filter((s) => s.f >= 40) };
    expect(carrierAt([{ f: 1, x: late.samples[0].x, y: late.samples[0].y }], [{ id: "p", track: late }], 1)).toBeNull();
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
