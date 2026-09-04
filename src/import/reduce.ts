/**
 * `tracks.json` → `BoardDoc`. The reduction.
 *
 * A tracks file is hundreds of frames of positions; a board is a handful of scenes with
 * a curve between them. Turning one into the other is the whole job, and it is pure
 * numerical code with no video, no camera and no pixels anywhere in it.
 *
 * Three decisions carry the module:
 *
 * SCENES ARE CHOSEN WHERE THE SHAPE STOPS BEING PREDICTABLE. Not on a fixed interval,
 * which cuts through the middle of a run and misses the moment the play turns. The
 * split is recursive: interpolate between the scenes so far, find the frame where some
 * player is furthest from where that interpolation puts them, and if it is far enough,
 * make that frame a scene. A straight run needs none; a sudden switch of play gets one
 * exactly where it happens.
 *
 * A CURVE IS ONLY DRAWN WHERE THE PATH IS ACTUALLY CURVED. `paths` takes null for a
 * straight tween, so a run that is straight within half a metre stays null rather than
 * carrying a bezier fitted to noise.
 *
 * NOTHING IS INVENTED THAT CAN BE LEFT OUT. A track with no shirt number becomes a
 * generic token rather than a guessed one; a side that could not be told becomes no
 * player at all rather than a coin flip.
 */

import type { BoardDoc, PathCurve, Scene, Vec2 } from "@/board/types";
import type { Sample, Track, TracksFile } from "./tracks";

/**
 * How far a player must be from where interpolation puts them, in metres, before the
 * frame becomes a scene of its own. Below this the board would carry detail nobody can
 * see, and each extra scene is one more the coach has to look at.
 */
export const SCENE_TOLERANCE_M = 1.5;

/** A path straighter than this stays a straight tween. */
export const STRAIGHT_TOLERANCE_M = 0.5;

/** Scenes never land closer together than this. */
export const MIN_SCENE_GAP_S = 0.4;

/**
 * How much of the window a track must cover to be worth putting on the board.
 *
 * Lower than it looks like it should be, and measured rather than chosen. Raising it
 * does NOT buy fidelity: the window trims to where the surviving players are all on
 * screen, so demanding more coverage buys a longer window with fewer people in it and
 * more of their positions held.
 *
 * It also has to answer to the tracker. A tracker that gives up on a lost player quickly
 * makes fewer identity mistakes and shorter tracks, and this is where that is paid for:
 * at 0.3 the Rio Ave goal fields 11 players over 3 scenes with a p90 of 0.57 m, where
 * demanding 0.4 fields 8 over 2 scenes and does worse.
 *
 * Below about 0.25 the roster passes what a pitch can hold, which is fragments of the
 * same player arriving as two.
 */
export const MIN_COVERAGE = 0.3;

/**
 * How far outside the pitch a position may sit and still be believed, in metres.
 *
 * A producer's own filter is generous on purpose, because it does not know how far off
 * its camera model is. This one is not: the board is metres on a known pitch, and a
 * throw-in taker stands a stride outside the line while the crowd behind a goal is ten
 * metres back. The file is another program's output arriving over a file picker, so it
 * is untrusted in exactly the sense `storage.ts` means and is checked rather than
 * assumed.
 */
export const OFF_PITCH_MARGIN_M = 3;

/** How much of a track may sit off the pitch before it is taken to be a spectator. */
export const MAX_OFF_PITCH = 0.2;

export const MAX_SCENES = 12;

/**
 * Players a side can field.
 *
 * A rule of the game rather than a tuning knob, and the only defence the importer has
 * against a fragment arriving as a teammate. Splitting a track is safe where the halves
 * are two people and lossy where they are one, so some over-count always survives: the
 * Nottingham clip yields fourteen home shirts for eleven players. Capping does not
 * reunite them — nothing in the file says which two are one — but a board cannot field
 * fourteen, and the best-observed eleven is a better guess than the first eleven found.
 */
export const MAX_PER_SIDE = 11;

/** The shortest passage worth making a board of. */
export const MIN_WINDOW_S = 2.5;

/**
 * How many covered tracks a longer window may give up to be chosen, in players.
 *
 * The count is FRAGMENTS, not people. A track holding an impossible jump is cut before
 * the window is chosen, so a busy clip arrives as 90 to 200 pieces of 40 to 80 players
 * and an extra covering fragment is frequently a player already on the board. The board
 * then fields at most `MAX_PER_SIDE` a side, so windows scoring 26 and 25 routinely
 * produce the same eleven.
 *
 * Without slack, duration only breaks an exact tie, and one fragment outweighs any amount
 * of football: the best window on one clip is 19 fragments over 2.8 s, against 18 over
 * 8.6 s. One is inside the noise of this measurement; six seconds of play is not.
 */
export const WINDOW_SLACK = 1;

/**
 * How near a restart spot the ball must sit, in metres, and how long it must sit there,
 * before the passage counts as a set piece being taken.
 *
 * A corner, a kick-off and a goal kick all start with the ball placed somewhere known and
 * left alone for seconds, which is a thing nothing else in a football clip does. The
 * radius is homography slack rather than a real tolerance — a ball on the corner arc
 * projects a metre or so outside the line — and the rest is what separates a placed ball
 * from one rolling past the spot.
 *
 * Free kicks are deliberately unreachable by this: they are taken wherever the foul was,
 * so they have no position to recognise.
 */
export const RESTART_RADIUS_M = 1.5;
export const RESTART_REST_S = 0.4;

/** How long a gap in the sightings a single rest survives, in seconds. */
const RESTART_GAP_S = 0.2;

/**
 * How near the ball a player must be to be called its carrier, in metres.
 *
 * Measured, not chosen. Against SoccerNet's own ball, the nearest player is the right
 * one 99% of the time inside four metres — and the radius is what buys that: beyond it
 * the ball is in flight or the sighting is a false one, and the nearest player is
 * whoever happens to be standing under it.
 *
 * It answers on about half the frames and declines on the rest. Declining is the point.
 */
export const CARRIER_RADIUS_M = 4;

/**
 * The fastest a footballer moves, in metres per second. Usain Bolt peaks near 12.
 *
 * Not a tuning knob — a fact used to catch impossibilities. A tracker gates on pixels,
 * and where the camera model is locally wrong a small step in pixels is a large one in
 * metres, so a track can arrive holding a jump no human made. Measured on the Rio Ave
 * goal: 11.26 m between two frames a thirtieth of a second apart, or 360 m/s.
 */
export const MAX_SPEED_MS = 12;

/**
 * How far apart two samples may be and still have their implied speed believed, in
 * frames.
 *
 * Across a long gap the tracker saw nothing, and "impossible speed" there means only
 * that the two ends are far apart — which is what an occlusion looks like when the
 * player kept running. Splitting on that punishes every occlusion and shatters the
 * roster: measured on the Rio Ave goal it took 10 v 6 down to 3 v 3. A teleport is a
 * jump between samples that are ADJACENT, where there was no time to travel.
 */
export const TELEPORT_GAP_FRAMES = 3;

/**
 * How many samples either side of a cut are averaged before its speed is believed.
 *
 * A speed measured across one frame is a position error multiplied by the frame rate.
 * At 48 fps, 12 m/s is a quarter of a metre between adjacent frames — under the noise a
 * carried homography puts on a position — so 5.9% of steps on the Nottingham clip read
 * as impossible and the file's 77 tracks arrived as 392 fragments. The same footage at
 * 25 fps would have split 1.7%, which is the tell: the rule was measuring the frame rate
 * rather than the football.
 *
 * `withoutSpikes` cannot help, because it only knows an excursion that comes back. Noise
 * that does not come back is indistinguishable from a real jump one frame at a time, and
 * only stops looking like one over a baseline.
 */
export const SPEED_BASELINE_SAMPLES = 3;

/** Below this many tracks, no error is discounted as an outlier. */
export const OUTLIER_MIN_TRACKS = 5;

/**
 * Where a track is at a frame.
 *
 * Inside the track's own span this interpolates, which is fair — the player was there
 * and the detector merely blinked. Outside it, the position is HELD at the nearest end.
 * That is the one thing this module invents, and it is visible on the board as a player
 * standing still before they enter, which is the least misleading way to be wrong about
 * somebody who was not on screen.
 */
export function positionAt(track: Track, f: number): Vec2 {
  const s = track.samples;
  if (f <= s[0].f) return { x: s[0].x, y: s[0].y };
  const last = s[s.length - 1];
  if (f >= last.f) return { x: last.x, y: last.y };

  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].f <= f) lo = mid;
    else hi = mid;
  }
  const a = s[lo];
  const b = s[hi];
  const t = b.f === a.f ? 0 : (f - a.f) / (b.f - a.f);
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/**
 * Samples that leap away and come straight back, removed.
 *
 * A detection landing briefly on the wrong person is one bad sample, not two players,
 * and cutting the track there costs a whole run to fix a thirtieth of a second. The
 * test is whether the two neighbours are consistent WITHOUT it: if they are, the
 * excursion was the outlier and the track continues through.
 *
 * Cutting every such spike instead is what took the Rio Ave board from 10 v 6 to 4 v 3.
 */
export function withoutSpikes(samples: Sample[], fps: number, maxSpeed = MAX_SPEED_MS): Sample[] {
  if (samples.length < 3) return samples;
  const speed = (a: Sample, b: Sample) =>
    Math.hypot(b.x - a.x, b.y - a.y) / (Math.max(1, b.f - a.f) / fps);

  const kept: Sample[] = [samples[0]];
  for (let i = 1; i < samples.length - 1; i++) {
    const prev = kept[kept.length - 1];
    const here = samples[i];
    const next = samples[i + 1];
    const excursion = speed(prev, here) > maxSpeed && speed(here, next) > maxSpeed;
    if (excursion && speed(prev, next) <= maxSpeed) continue;
    kept.push(here);
  }
  kept.push(samples[samples.length - 1]);
  return kept;
}

/**
 * A track cut wherever it claims a move nobody could make.
 *
 * The two sides of such a jump are two different people — the tracker changed its mind
 * about who it was following — so they come back as separate tracks rather than one
 * repaired one. Repairing would mean choosing which half is the real player, and there
 * is nothing in the file that says.
 *
 * Fragments too short to be worth anything are dropped by the coverage test later, so
 * this only has to make the cut, not judge what is left.
 */
export function splitImpossible(
  track: Track,
  fps: number,
  maxSpeed = MAX_SPEED_MS,
  intervalS?: number,
): Track[] {
  // What counts as adjacent. On a file reduced to a time grid, consecutive samples are a
  // slot apart — five frames at 48 fps and a tenth of a second — so a rule counting raw
  // frames finds nothing adjacent and quietly stops cutting anything at all. The tell is
  // a fragment count exactly equal to the track count.
  const maxGap = Math.max(TELEPORT_GAP_FRAMES, Math.ceil(1.5 * (intervalS ?? 0) * fps));
  const samples = withoutSpikes(track.samples, fps, maxSpeed);
  const out: Track[] = [];
  let run: Sample[] = [samples[0]];

  // The mean of up to `SPEED_BASELINE_SAMPLES` from `lo`, which is where the frame rate
  // stops being the thing measured: averaging shrinks position noise while leaving a
  // real jump exactly where it was.
  const centroid = (lo: number, hi: number) => {
    const a = Math.max(0, lo);
    const b = Math.min(samples.length, hi);
    let x = 0;
    let y = 0;
    let f = 0;
    for (let i = a; i < b; i++) {
      x += samples[i].x;
      y += samples[i].y;
      f += samples[i].f;
    }
    const n = b - a;
    return { x: x / n, y: y / n, f: f / n };
  };

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const gap = b.f - a.f;
    // The step itself says WHERE a cut would go; the baseline says whether there is one
    // to make. Only the step is local enough to place the boundary, and only the
    // baseline can tell a jump from noise, so a cut needs both to agree.
    const step = Math.hypot(b.x - a.x, b.y - a.y) / (Math.max(1, gap) / fps);
    const before = centroid(i - SPEED_BASELINE_SAMPLES, i);
    const after = centroid(i, i + SPEED_BASELINE_SAMPLES);
    const seconds = Math.max(1 / fps, (after.f - before.f) / fps);
    const sustained = Math.hypot(after.x - before.x, after.y - before.y) / seconds;
    if (gap <= maxGap && step > maxSpeed && sustained > maxSpeed) {
      out.push({ ...track, samples: run });
      run = [];
    }
    run.push(samples[i]);
  }
  out.push({ ...track, samples: run });

  // Ids must stay distinct: `sources` maps a player back to the track they came from,
  // and two fragments sharing an id would claim to be the same person.
  return out
    .filter((t) => t.samples.length >= 2)
    .map((t, i) => (i === 0 ? t : { ...t, id: track.id * 1000 + i }));
}

/** Fraction of [from, to] the track actually has samples for. */
export function coverage(track: Track, from: number, to: number): number {
  if (to <= from) return 0;
  const first = track.samples[0].f;
  const last = track.samples[track.samples.length - 1].f;
  const overlap = Math.min(to, last) - Math.max(from, first);
  return Math.max(0, overlap) / (to - from);
}

/** Sides a track can be put on. Referees and unknowns are not players. */
const SIDES = {
  home: ["home", "gkHome"],
  away: ["away", "gkAway"],
} as const;

export function sideOf(track: Track): "home" | "away" | null {
  if ((SIDES.home as readonly string[]).includes(track.team)) return "home";
  if ((SIDES.away as readonly string[]).includes(track.team)) return "away";
  return null;
}

/**
 * The frame a set piece is taken on, or null when the passage holds none.
 *
 * The ball resting on a corner arc or the centre spot is the one moment in a clip whose
 * position is known before it is seen, so it is worth finding: it is where the coach's
 * board should start. What is returned is the moment the ball LEAVES — the kick — because
 * that is what has to be on screen. How much of the wait to keep in front of it is left
 * to `chooseWindow`, which is already choosing between passages on other grounds.
 *
 * Derived from the samples rather than read from a field, so it works on any tracks.json
 * that satisfies the contract, including every file written before this existed.
 */
export function restartAt(
  ball: Sample[],
  pitch: { length: number; width: number },
  fps: number,
): number | null {
  if (ball.length === 0) return null;
  const spots: [number, number][] = [
    [0, 0],
    [0, pitch.width],
    [pitch.length, 0],
    [pitch.length, pitch.width],
    [pitch.length / 2, pitch.width / 2],
  ];
  const restFrames = Math.max(1, Math.round(RESTART_REST_S * fps));
  const gapFrames = Math.max(1, Math.round(RESTART_GAP_S * fps));
  const samples = [...ball].sort((a, b) => a.f - b.f);

  const runs: Sample[][] = [];
  let run: Sample[] = [];
  for (const s of samples) {
    const resting = spots.some((p) => Math.hypot(s.x - p[0], s.y - p[1]) <= RESTART_RADIUS_M);
    const broken = !resting || (run.length > 0 && s.f - run[run.length - 1].f > gapFrames);
    if (broken && run.length > 0) {
      runs.push(run);
      run = [];
    }
    if (resting) run.push(s);
  }
  if (run.length > 0) runs.push(run);

  const rests = runs.filter((r) => r.length >= restFrames);
  if (rests.length === 0) return null;
  const longest = rests.reduce((a, b) => (b.length > a.length ? b : a));
  return longest[longest.length - 1].f;
}

/**
 * The passage of play to build the board from.
 *
 * Not the whole clip. A board must give every player a position in every scene, so a
 * track covering half the file forces the other half to be invented — and the fuller
 * the roster, the more of it is fiction. Trimming to where the players are actually on
 * screen buys a real eleven over a shorter passage instead of a thin one over a long
 * passage padded out with people standing still.
 *
 * Candidates are the track endpoints themselves, since the count of covered tracks only
 * changes there. Each side is scored against `MAX_PER_SIDE`, since that is what the board
 * can field, and the longest window within `WINDOW_SLACK` of the fullest wins — a fragment
 * is not a player. The two rules need each other: the cap alone lets a side with two
 * fragments decide the window once the other is over eleven, and slack alone buys duration
 * by gutting a side.
 *
 * A set piece outranks both. During a corner the players are bunched in the box occluding
 * each other, so their tracks fragment and the count drops — which means this would
 * reliably walk past the corner and pick the open play afterwards, and did. A board made
 * of a corner clip that does not contain the corner is the wrong board however many
 * players it has. With no restart in the passage nothing changes.
 */
export function chooseWindow(
  tracks: Track[],
  from: number,
  to: number,
  fps: number,
  minCoverage = MIN_COVERAGE,
  minWindowS = MIN_WINDOW_S,
  restart: number | null = null,
): { from: number; to: number } {
  const minFrames = Math.round(minWindowS * fps);
  if (to - from <= minFrames || tracks.length === 0) return { from, to };

  const starts = [from, ...tracks.map((t) => t.samples[0].f)].filter((f) => f >= from && f < to);
  const ends = [to, ...tracks.map((t) => t.samples[t.samples.length - 1].f)].filter(
    (f) => f > from && f <= to,
  );

  const candidates: { from: number; to: number; count: number; covers: boolean }[] = [];
  for (const a of new Set(starts)) {
    for (const b of new Set(ends)) {
      if (b - a < minFrames) continue;
      const covered = tracks.filter((t) => coverage(t, a, b) >= minCoverage);
      const home = covered.filter((t) => sideOf(t) === "home").length;
      const away = covered.filter((t) => sideOf(t) === "away").length;
      candidates.push({
        from: a,
        to: b,
        // Capped per side, because that is what the board fields. Counting past the cap
        // optimises fragments it then discards, and a total hides the split: one clip's
        // fullest window is 17 home and 1 away, which is not a board.
        count: Math.min(home, MAX_PER_SIDE) + Math.min(away, MAX_PER_SIDE),
        covers: restart !== null && a <= restart && b > restart,
      });
    }
  }
  if (candidates.length === 0) return { from, to };

  const covering = candidates.filter((c) => c.covers);
  const pool = covering.length > 0 ? covering : candidates;
  const most = Math.max(...pool.map((c) => c.count));
  const best = pool
    .filter((c) => c.count >= most - WINDOW_SLACK)
    .reduce((x, y) => (y.to - y.from > x.to - x.from ? y : x));
  return { from: best.from, to: best.to };
}

/**
 * Who has the ball at a frame, or null when nobody can be said to.
 *
 * Pitchboard models the ball as `scene.carrier` and nothing else, which turns an
 * intractable problem into an easy one: where the ball IS cannot be recovered from a
 * ground homography, but who is NEAREST it can, and that is the whole question.
 *
 * Null is a real answer. A ball in flight belongs to nobody, and the caller decides what
 * to do about that — which is not the same decision as guessing at a holder.
 */
export function carrierAt(
  ball: Sample[],
  players: { id: string; track: Track }[],
  f: number,
  radiusM = CARRIER_RADIUS_M,
): string | null {
  if (ball.length === 0 || players.length === 0) return null;
  const here = ball.reduce((best, s) =>
    Math.abs(s.f - f) < Math.abs(best.f - f) ? s : best,
  );
  // A sighting from another moment says nothing about this one.
  if (Math.abs(here.f - f) > 2) return null;

  let nearest: { id: string; d: number } | null = null;
  for (const { id, track } of players) {
    const p = positionAt(track, f);
    const d = Math.hypot(p.x - here.x, p.y - here.y);
    if (!nearest || d < nearest.d) nearest = { id, d };
  }
  return nearest && nearest.d <= radiusM ? nearest.id : null;
}

/** Whether a track is a player rather than somebody watching from behind the goal. */
export function onPitch(
  track: Track,
  pitch: { length: number; width: number },
  marginM = OFF_PITCH_MARGIN_M,
  maxOutside = MAX_OFF_PITCH,
): boolean {
  let outside = 0;
  for (const s of track.samples) {
    const beyond =
      s.x < -marginM ||
      s.x > pitch.length + marginM ||
      s.y < -marginM ||
      s.y > pitch.width + marginM;
    if (beyond) outside++;
  }
  return outside / track.samples.length <= maxOutside;
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Frames worth making scenes of.
 *
 * Recursive split on the worst interpolation error, which is Douglas-Peucker applied to
 * every player at once rather than to one line. `MAX_SCENES` and `MIN_SCENE_GAP_S` stop
 * it turning a noisy clip into a flick-book.
 */
export function chooseScenes(
  tracks: Track[],
  from: number,
  to: number,
  fps: number,
  toleranceM: number = SCENE_TOLERANCE_M,
  maxScenes: number = MAX_SCENES,
): number[] {
  const minGap = Math.max(1, Math.round(MIN_SCENE_GAP_S * fps));
  const chosen = [from, to];

  while (chosen.length < maxScenes) {
    let worst = { error: 0, frame: -1 };

    for (let i = 0; i < chosen.length - 1; i++) {
      const a = chosen[i];
      const b = chosen[i + 1];
      if (b - a < 2 * minGap) continue;

      for (let f = a + minGap; f <= b - minGap; f++) {
        const t = (f - a) / (b - a);
        const errors = tracks.map((track) =>
          dist(lerp(positionAt(track, a), positionAt(track, b), t), positionAt(track, f)),
        );
        // The second worst player rather than the worst, ONCE there are enough players
        // to call one an outlier. A single jittery track — and there is always one —
        // otherwise demands a scene at every frame it wobbles, and the board fills with
        // scenes describing a detector rather than a play. Below OUTLIER_MIN_TRACKS the
        // worst is used, because among three players there is no outlier to discount
        // and one striker breaking away is the whole point of the scene.
        errors.sort((p, q) => q - p);
        const error = errors[tracks.length >= OUTLIER_MIN_TRACKS ? 1 : 0];
        if (error > worst.error) worst = { error, frame: f };
      }
    }

    if (worst.frame < 0 || worst.error < toleranceM) break;
    chosen.push(worst.frame);
    chosen.sort((p, q) => p - q);
  }

  return chosen;
}

/**
 * A cubic bezier through the sampled path, or null when a straight line will do.
 *
 * Endpoints are fixed — they are the two scenes — so only the controls are fitted, by
 * least squares over a chord-length parameterisation. `PathCurve` holds them in
 * absolute pitch metres, which is what the renderer expects.
 */
export function fitCurve(
  points: Vec2[],
  straightToleranceM: number = STRAIGHT_TOLERANCE_M,
): PathCurve | null {
  if (points.length < 4) return null;
  const p0 = points[0];
  const p3 = points[points.length - 1];

  // Chord length, so the parameterisation follows distance travelled rather than the
  // sample count — a player who pauses would otherwise drag the curve towards the pause.
  const acc = [0];
  for (let i = 1; i < points.length; i++) acc.push(acc[i - 1] + dist(points[i - 1], points[i]));
  const total = acc[acc.length - 1];
  if (total === 0) return null;

  let straight = 0;
  for (let i = 0; i < points.length; i++) {
    straight = Math.max(straight, dist(points[i], lerp(p0, p3, acc[i] / total)));
  }
  if (straight < straightToleranceM) return null;

  let c11 = 0;
  let c12 = 0;
  let c22 = 0;
  const d1 = { x: 0, y: 0 };
  const d2 = { x: 0, y: 0 };
  for (let i = 0; i < points.length; i++) {
    const t = acc[i] / total;
    const u = 1 - t;
    const a1 = 3 * u * u * t;
    const a2 = 3 * u * t * t;
    const rx = points[i].x - (u * u * u * p0.x + t * t * t * p3.x);
    const ry = points[i].y - (u * u * u * p0.y + t * t * t * p3.y);
    c11 += a1 * a1;
    c12 += a1 * a2;
    c22 += a2 * a2;
    d1.x += a1 * rx;
    d1.y += a1 * ry;
    d2.x += a2 * rx;
    d2.y += a2 * ry;
  }

  const det = c11 * c22 - c12 * c12;
  if (Math.abs(det) < 1e-9) return null;
  return {
    c1: { x: (c22 * d1.x - c12 * d2.x) / det, y: (c22 * d1.y - c12 * d2.y) / det },
    c2: { x: (c11 * d2.x - c12 * d1.x) / det, y: (c11 * d2.y - c12 * d1.y) / det },
  };
}

export type { Scene, BoardDoc, TracksFile, Sample };
