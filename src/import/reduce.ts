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
 * frame becomes a scene of its own.
 *
 * This is the setting that decides what a board is FOR. At 1.5 m it marked a jink or the
 * detector's own wobble: SNGS-151 came out with twelve scenes for about a metre and a half
 * of movement each, six of them describing one small adjustment that a coach would call a
 * single run. A tactical movement is several metres, so the tolerance is several metres,
 * and what survives is a player changing where they are going rather than how they are
 * standing. Each scene is also one more thing the coach has to look at and correct.
 */
export const SCENE_TOLERANCE_M = 4;

/** A path straighter than this stays a straight tween. */
export const STRAIGHT_TOLERANCE_M = 0.5;

/**
 * How far a player must have gone between two scenes before the board says they moved.
 *
 * The camera model puts a position 0.5-1.5 m from where the player was, and it does that
 * independently at every frame, so a player standing still arrives at the next scene a
 * metre away. Drawn, that is an arrow -- and measured across five boards, 35% of the runs
 * were under a metre and 48% under two: between a third and a half of what a coach was
 * being shown was the measurement wobbling, with a bezier fitted through 21% of it.
 *
 * A run shorter than the error that produced it is not a run, so the player keeps the
 * position they had. 1.5 m is the p90 of that error on the clips this is measured on, and
 * it is also about the shortest movement worth a coach's attention on a tactics board.
 */
export const STILL_M = 1.5;

/** Scenes never land closer together than this. */
export const MIN_SCENE_GAP_S = 0.4;

/**
 * The same, for scenes that mark an EVENT rather than a badly fitting curve.
 *
 * Half the gap, because the reason for the other one does not apply: `MIN_SCENE_GAP_S`
 * stops the deviation test describing a jittery detector, and a pass is not jitter.
 */
export const MIN_EVENT_GAP_S = 0.2;

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

/**
 * The least time a player must be watched for, in seconds, whatever share of the window
 * that is.
 *
 * A share of the window cannot be this floor, because a shorter passage clears it more
 * easily and the count of covering tracks rises as the passage shrinks -- a structural bias
 * rather than a tuning problem: judged that way SNGS-147 came out as nineteen fragments over
 * 3.2 seconds of a thirty-second clip, and those nineteen are eight real players seen for a
 * second each. That is what retired the coverage floor entirely (D81); this is what is left,
 * and it is the only bar between a track and a place on the board.
 *
 * A floor in seconds cannot be gamed by shrinking the window. It is a claim about football
 * rather than about the file: a player watched for under a second and a half has not made a
 * run, and drawing one for them is inventing it.
 *
 * Measured either side of it. At 1 s SNGS-147 stays broken -- 17 fragments over 3.6 s -- and
 * at 3 s the Nottingham clip falls from 20 players to 12 and the Rio Ave goal from 14 to 5.
 * It also has to stay under `MIN_WINDOW_S`, or a window trimmed to the minimum fields nobody.
 */
export const MIN_OBSERVED_S = 1.5;

/**
 * How far either side of a sample the board may be drawn from it, in seconds.
 *
 * A quarter of a second. Beyond that a position is not this player's position any more,
 * it is where they were: a footballer at 5 m/s has moved more than a metre.
 */
export const WITNESS_TOL_S = 0.25;

/**
 * How much of a board must be positions somebody actually SAW.
 *
 * The bar a passage has to clear before it can be chosen, and the reason this file has
 * `witnessed` at all. Every player needs a position in every scene — that is what a board
 * IS — so a player the tracker lost is drawn standing where they were last seen, and
 * nothing on the board tells the coach which of the twenty-two are real. Measured on the
 * shipped boards, 43-63% of the drawn positions were real ones, and one scene of SNGS-067
 * was 18%: four fifths of that scene is a reconstruction.
 *
 * 0.7 is where the passages stop being padded and still contain football. Higher empties
 * them — at a 0.85 average the eleven boards keep two or three scenes and no passes at
 * all, which is an accurate record of a moment rather than a play.
 */

/**
 * How much of the roster must be on screen at a frame before a scene is put there.
 *
 * A scene is a moment the coach is asked to look at, so it is the worst place on a board
 * to be drawing from memory -- and `chooseScenes` walks straight into it, because the
 * frames where a player deviates furthest from their interpolation are frequently the
 * frames where the tracker lost them and the position stopped being real. Measured on the
 * shipped boards: SNGS-067 held a scene where 18% of the shirts were backed by a sighting
 * and SNGS-151 one at 14%.
 *
 * Measured across the eleven clips against the share of the finished board that is real:
 *
 *     window density   scene floor   board is real   SNGS-060
 *          0.7            0.50           63-67%      12.4 s, 49 m of travel
 *          0.7            0.65           68-72%       9.0 s, 40 m
 *          0.8            0.65           63-79%       4.2 s, 16 m
 *
 * 0.65 with a 0.7 window is where the boards stop being half-remembered and still hold a
 * passage of play. Tightening the window instead of the scene empties them: SNGS-060 keeps
 * three scenes and a quarter of its movement.
 */
export const SCENE_BACKED_FLOOR = 0.65;

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

/**
 * Most scenes a board may hold.
 *
 * A guard, not a quality setting. `SCENE_TOLERANCE_M` is what decides how faithful a board
 * is — the search stops when no player is further than that from their interpolation — and
 * a cap below where it stops silently overrides it. At 12 it did: SNGS-060 ran out of slots
 * with a five-second stretch still uncovered, and every player crossed it in a straight
 * line. Let the tolerance finish and that clip takes 23; across the eleven benchmark clips
 * nothing asks for more than 24, and raising the cap further changes no board at all.
 *
 * It buys nothing at the share link either, which was the plausible reason for a low one:
 * the largest imported board already exceeds `URL_BUDGET` at 12 scenes, and 24 puts no
 * further clip over. A board too big to fit in a link is still saved, exported and opened
 * as a file.
 *
 * What it does still guard is a pathological file — the search is quadratic in the frames
 * of a window, and nothing about a producer's output is trusted here.
 */
export const MAX_SCENES = 24;

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
 * How many fielded tracks a passage may give up to be chosen, in players.
 *
 * The count is FRAGMENTS, not people. A track holding an impossible jump is cut before
 * the window is chosen, so a busy clip arrives as 90 to 200 pieces of 40 to 80 players
 * and an extra fragment is frequently a player already on the board. The board then
 * fields at most `MAX_PER_SIDE` a side, so windows scoring 26 and 25 routinely produce
 * the same eleven.
 */

/**
 * How much of the fullest honest passage's roster another may give up to hold more of the
 * ball.
 *
 * A board needs three things and no passage on this footage has all of them: positions
 * that were really seen, the events a coach came to look at, and enough of a team to read
 * the shape. Ordering them sacrifices whichever is last -- putting the roster first walks
 * past every pass, because possession changes where players occlude each other and tracks
 * fragment; putting the ball first empties the pitch to six players. So honesty and the
 * roster are floors, and the ball chooses among what clears them.
 */

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
 * How long the nearest player has to STAY the nearest before the ball is theirs, and how
 * much of that time they must hold it for.
 *
 * A ball in flight is the problem this exists for. A ground homography assumes z = 0, so a
 * lofted ball's position on the board is its shadow sweeping across the pitch -- and every
 * player it sweeps over is, for a frame, the nearest. Read frame by frame that is a pass,
 * and the board draws it: a coach watching SNGS-121 saw a short pass drawn before the loft
 * that actually happened, and a turnover in a passage where possession never changed.
 *
 * Speed cannot separate them -- measured on ground truth, half of all REAL receptions show
 * the ball moving faster than 9 m/s, because a pass arrives through the air there too.
 * Duration can: a real hold lasts 0.4 to 0.6 s at the median, and every hold our own ball
 * produced was under 0.3 s. So the test is whether the new holder keeps it.
 *
 * Measured end to end on six boards, as the passes DRAWN against the passes played inside
 * the same window:
 *
 *     rule          drawn   of them real   precision   recall
 *     as it was       28         17           61%       60%
 *     hold 0.2 s      22         15           68%       60%
 *     hold 0.4 s      15         11           73%       47%
 *
 * 0.2 s is free -- six phantoms go and no real pass with them. 0.4 s costs real passes to
 * remove more phantoms, and it is what ships, because the two errors are not equal: a pass
 * that never happened is a turnover a coach will try to coach, and a missing one leaves the
 * play looking continuous. On SNGS-121, the clip a coach checked, every pass the board now
 * draws is one that was really played.
 */
export const HOLD_S = 0.4;
export const HOLD_SHARE = 0.6;

/**
 * How long a holder may keep the ball with no sighting behind him, in seconds.
 *
 * A carrier stands until somebody else takes it, which is what a board MEANS (D43) — but
 * that rule is a reading of the ball's silence, and silence stops meaning "still his" once
 * it is long enough for the play to have moved on. On a coach's own clip the ball went
 * unseen for 1.8 s, exactly the run he was asking about, and the board handed the whole
 * passage to the player who last held it before the gap: the other team's attack drawn in
 * the defending side's colour, with nothing in the file behind it.
 *
 * Measured BACKWARDS only. A sighting after the scene says where the ball got to, not who
 * had it; the claim being carried is a claim about the past.
 *
 * Where nothing stands behind it the scene names nobody, which is a real answer (D44) and
 * the one a coach can work with: a board that shows possession stopping is honest about
 * what was tracked, and a board that shows the wrong team passing is not.
 */
export const CARRY_S = 1;

/**
 * How far from every player the ball has to be before the board draws it on its own.
 *
 * Wider than the carrier radius on purpose: those two rules must not argue over the same
 * metre. Inside four metres the ball is somebody's (D43); past eight it is nobody's, and a
 * board that pins it to a player anyway is drawing a pass as a dribble.
 */
export const LOOSE_M = 8;

/** A loose stretch shorter than this is a stray sighting, not a ball in flight. */
export const MIN_FLIGHT_S = 0.2;

/**
 * How far a ball's path may bow away from the straight line before it was in the AIR, in
 * metres, and how much of the run has to lie on one side of that line.
 *
 * A homography puts everything on the ground (D66), so a ball in flight is projected down
 * the camera ray and lands further from the camera the higher it is -- by metres, and by
 * most at the apex. The path therefore bows AWAY from the near touchline and comes back,
 * which is a signature no ball rolling on the grass has: a curled pass bends the other way
 * as often as this way, and by a metre or two rather than ten.
 */
export const AIR_BOW_M = 4.0;
export const AIR_ONE_SIDED = 0.9;

/**
 * The longest a kicked ball stays up, in seconds. A goal kick hangs two to three; nothing
 * struck by a foot hangs five.
 *
 * The bow test alone is not enough, because the runs it judges are delimited by the ball
 * being LOST, not by it landing. On SNGS-100 the ball is located on 134 frames of the whole
 * clip and one run of 124 of them curves gently across the pitch -- which passes a test for
 * bowing away and returning, and is five seconds of ordinary football. Airborne is a claim
 * about a second or two.
 */
export const MAX_AIR_S = 3.0;

/**
 * The frames the ball was off the ground, and therefore nowhere the board can draw it.
 *
 * The coach's goalkeeper lofted one 35 m and the board drew two passes: the ball out to the
 * apex of its own projected arc, where it was snapped to whichever player stood nearest
 * (D79), and on to the man who actually received it. The phantom is 9.5 m off the straight
 * line at its worst and swings through the far side of the pitch.
 *
 * One kick is one pass. These frames are dropped before anything reads the ball, so no
 * scene lands on them, no carrier is claimed from them and the pass is drawn once.
 */
export function airborne(ball: Sample[], fps: number): Set<number> {
  const out = new Set<number>();
  if (ball.length < 3) return out;
  const gap = Math.max(2, Math.round(MIN_FLIGHT_S * fps));

  let run: Sample[] = [];
  const judge = () => {
    if (run.length < 3) return;
    const a = run[0];
    const b = run[run.length - 1];
    if ((b.f - a.f) / fps > MAX_AIR_S) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    // Signed distance from the chord. Positive is the side the camera is NOT on: the
    // broadcast camera sits on the near touchline, which this project's coordinates put
    // at the high-y edge, so a ball lifted off the grass projects towards low y.
    const off = run.map((s) => ((s.x - a.x) * dy - (s.y - a.y) * dx) / len);
    const worst = Math.max(...off);
    if (worst < AIR_BOW_M) return;
    const sameSide = off.filter((d) => d >= 0).length / off.length;
    if (sameSide < AIR_ONE_SIDED) return;
    // And the high point has to be in the middle of the run, not at one end, or this is a
    // ball curving away rather than one coming back down.
    const peak = off.indexOf(worst) / (off.length - 1);
    if (peak < 0.15 || peak > 0.85) return;
    for (const s of run) out.add(s.f);
  };

  for (const s of ball) {
    if (run.length > 0 && s.f - run[run.length - 1].f > gap) {
      judge();
      run = [];
    }
    run.push(s);
  }
  judge();
  return out;
}


/** How far back from a flight to look for the player it came off. */
export const KICK_S = 1.5;

/** Half the goal's width, in metres: a sighting outside it did not cross between the posts. */
export const GOAL_HALF_WIDTH_M = 3.66;

/** How deep the board draws its goals, and so how far into one the ball may be put. */
export const GOAL_DEPTH_M = 2;

/**
 * Where the ball is when it has crossed a goal line between the posts: in the net.
 *
 * Worth naming because a board cannot say "goal" and a coach reads one anyway — from the
 * ball being past everybody rather than beside somebody. Pulled onto the goal line and it
 * sits among the defenders who were on it, which is how a clip that ends in a goal came
 * back as *"the blue team loses the ball to a red player"*.
 *
 * Null unless the sighting is behind the line by no more than `BALL_EDGE_M` -- further out
 * is the camera model failing, not a goal -- and inside the posts.
 */
export function scored(
  p: Vec2,
  pitch: { length: number; width: number },
  edgeM = BALL_EDGE_M,
): Vec2 | null {
  const behind = p.x < 0 ? -p.x : p.x > pitch.length ? p.x - pitch.length : -1;
  if (behind < 0 || behind > edgeM) return null;
  if (Math.abs(p.y - pitch.width / 2) > GOAL_HALF_WIDTH_M) return null;
  const depth = Math.min(behind, GOAL_DEPTH_M);
  return { x: p.x < 0 ? -depth : pitch.length + depth, y: p.y };
}

/**
 * How near a player a loose ball has to be before it is drawn at his feet instead.
 *
 * The ball's own position carries the camera model's error, a metre or two of it, and at
 * that accuracy "at his feet" and "a stride away" are the same measurement. Drawn where the
 * number says, a pass to a player standing still lands on the grass beside him and a coach
 * reads the move as passes into space: *"the passes are not landing to players directly, it
 * seems like it's doing passes to the field"*.
 *
 * This does not name him the carrier -- the hold test has already declined that, and a pass
 * is a carrier change (D43). It only draws the ball where the football is.
 */
export const SNAP_M = 2;

/**
 * Where to draw a ball nobody is holding: at the nearest player's feet, or where it was
 * seen when nobody is near enough for that to be the same place.
 *
 * Blockers count as players here even though they cannot be named: the point is to draw the
 * ball where a person is, and an unreadable shirt is still a person. Snapping to the
 * second-nearest because the nearest cannot be named would put the ball at an opponent's
 * feet, which is the fault the blocker exists to prevent.
 */
export function atFeet(
  where: Vec2,
  players: { id: string; track: Track }[],
  f: number,
  blockers: Track[] = [],
  snapM = SNAP_M,
): Vec2 {
  let nearest: { at: Vec2; d: number } | null = null;
  for (const track of [...players.map((p) => p.track), ...blockers]) {
    if (f < track.samples[0].f || f > track.samples[track.samples.length - 1].f) continue;
    const p = positionAt(track, f);
    const d = Math.hypot(p.x - where.x, p.y - where.y);
    if (!nearest || d < nearest.d) nearest = { at: p, d };
  }
  return nearest && nearest.d <= snapM ? nearest.at : where;
}

/**
 * How far outside the field a ball sighting may sit and still be drawn, pulled onto it.
 *
 * The two cases either side of this number are a shot and a mistake. A ball that has just
 * crossed the line is metres past it and belongs on the line -- that is the goal, and
 * dropping it takes the ball off the board at the one moment a coach is watching it. A
 * sighting well outside is the camera model failing or the detector finding something in
 * the crowd, and drawing it moves the play off the pitch.
 */
export const BALL_EDGE_M = 4;

/** Whether a ball sighting stands behind frame `f` — one at or before it, within CARRY_S. */
export function sighted(ball: Sample[], f: number, fps: number): boolean {
  return ball.some((s) => s.f <= f && (f - s.f) / fps <= CARRY_S);
}

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
/** How long a track is actually watched inside a window, in seconds. */
export function observed(track: Track, from: number, to: number, fps: number): number {
  const first = track.samples[0].f;
  const last = track.samples[track.samples.length - 1].f;
  return Math.max(0, Math.min(to, last) - Math.max(from, first)) / fps;
}

/**
 * How much of a window a track was actually WATCHED for, as a share.
 *
 * `coverage` measures a track's span: first sample to last. A track with a two-second
 * hole in the middle covers the window completely by that measure, and the board draws
 * the player standing still through the hole — which is how a board ends up half held
 * without any number saying so (D67 in football-tracks is the same trap: a measurement
 * conditioned on what a model already answers).
 *
 * This measures the samples. Each one witnesses `tol` frames either side of itself, and
 * the union of those intervals inside the window is what the board can honestly draw.
 */
export function witnessed(track: Track, from: number, to: number, tol: number): number {
  if (to <= from) return 0;
  let total = 0;
  let openFrom = -Infinity;
  let openTo = -Infinity;
  for (const s of track.samples) {
    const lo = Math.max(from, s.f - tol);
    const hi = Math.min(to, s.f + tol);
    if (hi <= lo) continue;
    if (lo > openTo) {
      if (openTo > openFrom) total += openTo - openFrom;
      [openFrom, openTo] = [lo, hi];
    } else if (hi > openTo) {
      openTo = hi;
    }
  }
  if (openTo > openFrom) total += openTo - openFrom;
  return total / (to - from);
}

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
 * that is what has to be on screen. The wait in front of it is kept or trimmed by the end
 * trim in `boardFromTracks`, on whether anybody was seen during it.
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

/** How long after a handover to look for the moment the new holder actually has the ball. */
export const SETTLE_S = 0.5;

/**
 * The frames the ball changes hands on, across a whole file.
 *
 * A coach watches the ball. Which passage of a clip is worth a board is therefore a
 * question about possession and not only about how many players stood in shot — measured
 * on SNGS-151, the passage with the best-observed roster excluded the first three changes
 * of possession in the clip, which is where the play actually was.
 */
export function handovers(
  ball: Sample[],
  tracks: Track[],
  fps: number,
  radiusM = CARRIER_RADIUS_M,
): number[] {
  if (ball.length === 0 || tracks.length === 0) return [];
  const players = tracks.map((track, i) => ({ id: String(i), track }));
  const settle = Math.max(1, Math.round(SETTLE_S * fps));
  const at = new Map(ball.map((s) => [s.f, s]));
  const out: number[] = [];
  let held: string | null = null;
  for (const s of ball) {
    const who = carrierAt(ball, players, s.f, radiusM, fps);
    if (who === null) continue;
    if (held !== null && who !== held) {
      // Not the frame possession CHANGES — the frame the new holder actually has it. A
      // handover is the ball in flight, so a scene placed on it lands where nobody is
      // within reach of the ball and the board must attach it to somebody anyway.
      // Measured on SNGS-060: at the handover frames, the nearest real player to the real
      // ball is 4.0 to 8.5 m away.
      const track = players[Number(who)].track;
      let best = s.f;
      let near = Infinity;
      for (let f = s.f; f <= s.f + settle; f++) {
        const here = at.get(f);
        if (!here) continue;
        if (f < track.samples[0].f || f > track.samples[track.samples.length - 1].f) continue;
        const p = positionAt(track, f);
        const d = Math.hypot(p.x - here.x, p.y - here.y);
        if (d < near) [near, best] = [d, f];
      }
      out.push(best);
    }
    held = who;
  }
  return out;
}

/**
 * Possession with the one-scene flickers taken out.
 *
 * A turnover that gives the ball straight back is a ball crossing an opponent, not a
 * tackle. It is the last of the fly-over faults and the one `carrierAt`'s hold test cannot
 * reach: on SNGS-121 a cross-field pass put the board's ball seven metres from the real
 * one, on top of a track that was itself six metres from any real player, and the board
 * drew the blue team taking possession for a single scene and handing it back. A real
 * turnover changes what the other side does next; one that lasts one scene and reverses is
 * the measurement, and a coach reads it as an interception that never happened.
 *
 * Across SIDES only. One home player to another and back is an ordinary exchange of passes
 * and says nothing about who is in control.
 *
 * Made on a coach's reading of the clip rather than on the score, and it costs two points
 * of measured precision -- because the ground truth for a "real" handover is the same
 * nearest-player reading of an equally flat ball, so it endorses the very fly-over being
 * removed (D71).
 */
export function steady(carriers: (string | null)[]): (string | null)[] {
  const side = (id: string) => id.split("-")[0];
  const out = [...carriers];
  for (let i = 1; i < out.length - 1; i++) {
    const [before, here, after] = [out[i - 1], out[i], out[i + 1]];
    if (before === null || here === null || after === null) continue;
    if (side(here) !== side(before) && side(after) === side(before)) out[i] = before;
  }
  return out;
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
  fps?: number,
  blockers: Track[] = [],
): string | null {
  const who = nearestTo(ball, players, f, radiusM, blockers);
  if (who === null || fps === undefined) return who;

  // And do they KEEP it? A ball flying over a player is nearest to them for a frame, which
  // read on its own is a pass to them and is drawn as one.
  const hold = HOLD_S * fps;
  let seen = 0;
  let theirs = 0;
  for (const s of ball) {
    if (s.f < f || s.f > f + hold) continue;
    seen++;
    if (nearestTo(ball, players, s.f, radiusM, blockers) === who) theirs++;
  }
  // Every sighting counts, not just the ones with somebody near: a ball crossing open
  // ground has no rival claimant, and counting only claimants would read "nobody else was
  // nearer" as possession. With no sighting at all there is nothing to judge, and the
  // nearest player stands.
  return seen === 0 || theirs >= seen * HOLD_SHARE ? who : null;
}

/**
 * Where the ball is when it was seen at `f` and NOBODY is near it — in flight, or dead.
 *
 * The ball's own position is only worth drawing where it is unambiguous, which is why this
 * asks for `LOOSE_M` and not the carrier radius: at four metres a ball is arguably being
 * dribbled, and two rules fighting over the same metre is how a board flickers. At eight it
 * is nobody's, and the file is saying something the carrier model cannot — that the pass is
 * in the air, or that the ball is in the net.
 */
export function looseAt(
  ball: Sample[],
  players: { id: string; track: Track }[],
  f: number,
  radiusM = LOOSE_M,
  blockers: Track[] = [],
): Vec2 | null {
  if (ball.length === 0) return null;
  const here = ball.reduce((best, s) => (Math.abs(s.f - f) < Math.abs(best.f - f) ? s : best));
  if (Math.abs(here.f - f) > 2) return null;
  for (const { track } of [...players, ...blockers.map((track) => ({ track }))]) {
    if (f < track.samples[0].f || f > track.samples[track.samples.length - 1].f) continue;
    const p = positionAt(track, f);
    if (Math.hypot(p.x - here.x, p.y - here.y) <= radiusM) return null;
  }
  return { x: here.x, y: here.y };
}

/**
 * The frames the ball comes loose — the first sighting of each stretch nobody is near.
 *
 * A handover is only visible where the ball ARRIVES (`handovers`), so a pass whose receiver
 * was never tracked, and a shot, leave no mark on the board at all: the carrier model has
 * one holder before and one after, or the same holder throughout, and the ball is drawn on
 * his boot the whole way. A coach reads that as a player carrying the ball through a pass he
 * actually played — reported on a clip where the opening pass and the shot were both missing
 * and the scorer appeared to dribble away to celebrate.
 *
 * The moment the ball leaves is an event whatever happens next, and it is in the file. A
 * stretch shorter than `MIN_FLIGHT_S` is a stray sighting rather than a flight.
 */
export function flights(
  ball: Sample[],
  tracks: Track[],
  fps: number,
  radiusM = LOOSE_M,
): number[] {
  if (ball.length === 0) return [];
  const players = tracks.map((track, i) => ({ id: String(i), track }));
  const sorted = [...ball].sort((a, b) => a.f - b.f);
  const out: number[] = [];
  let start: number | null = null;
  let last: number | null = null;
  const close = (end: number) => {
    if (start !== null && (end - start) / fps >= MIN_FLIGHT_S) out.push(start);
    start = null;
  };
  for (const s of sorted) {
    const loose = looseAt(sorted, players, s.f, radiusM) !== null;
    // A break in the sightings ends the flight: what the ball did while unseen is not
    // something this can claim, and the far side of a gap is a new event or none.
    if (last !== null && (s.f - last) / fps > MIN_FLIGHT_S) close(last);
    if (loose) start ??= s.f;
    else if (start !== null) close(last ?? s.f);
    last = s.f;
  }
  if (last !== null) close(last);
  return out;
}

/**
 * Whether a sighting at `f` puts the ball out of the holder's reach — it is not his now.
 *
 * The carry-forward rule (D43) reads the ball's silence, and a sighting is not silence. A
 * holder thirty metres from a ball the file can see does not have it, however recently he
 * did: on a coach's clip the scorer ran away to celebrate and the board drew him dribbling,
 * with the ball sitting in the net behind him in the same file.
 *
 * Says nothing where the ball was not seen, or where the holder's track does not reach the
 * frame — both are absence of evidence, and this only ever acts on evidence.
 *
 * Judged at `LOOSE_M` rather than the carrier radius, and measured: at four metres it also
 * fires on the z = 0 shadow of a ball its holder still has, which cost two scenes of real
 * possession on SNGS-069 and bought nothing anywhere. Past eight metres it is not his.
 */
export function leftBehind(
  ball: Sample[],
  players: { id: string; track: Track }[],
  f: number,
  holder: string | null,
  radiusM = LOOSE_M,
): boolean {
  if (holder === null || ball.length === 0) return false;
  const here = ball.reduce((best, s) => (Math.abs(s.f - f) < Math.abs(best.f - f) ? s : best));
  if (Math.abs(here.f - f) > 2) return false;
  const track = players.find((p) => p.id === holder)?.track;
  if (!track) return false;
  // Measured against where the board DRAWS him, which is why `positionAt`'s clamping is
  // wanted here and refused in `nearestTo`. A holder whose track has run out is drawn
  // where he was last seen and the ball is drawn on him; if the file can see the ball
  // sixteen metres away, that picture is a lie whether or not he is still tracked. Not
  // naming a carrier needs evidence the player is there (D65); DROPPING one does not.
  const p = positionAt(track, f);
  return Math.hypot(p.x - here.x, p.y - here.y) > radiusM;
}

/** How far the ball's direction must change beside a player before it is called a touch. */
export const TOUCH_TURN_DEG = 40;

/** How long either side of a touch its direction is read over, in seconds. */
export const TOUCH_WINDOW_S = 0.15;

/** How fast the ball must be moving on both sides for a turn to mean anything, in m/s. */
export const TOUCH_SPEED_MS = 2.5;

/**
 * Who touched the ball at `f`, when nobody held it: one-touch play.
 *
 * `carrierAt`'s hold test asks who KEEPS the ball, which is what tells a receiver from a
 * player the ball merely flew over (D71) — and it is exactly wrong about the football a
 * coach most wants drawn. A one-touch pass is nobody keeping it: the ball arrives, leaves
 * in a new direction, and the man who did it never has it for the 0.4 s the test asks for.
 * Reported by a coach on a possession highlight: *"the quick triangle associations are not
 * present in the board"*.
 *
 * A touch is a change of DIRECTION beside somebody, which is the thing a fly-over cannot
 * fake: a ball crossing a player carries straight on. Speed is required on both sides so
 * that noise in a slow ball's position — a metre of it, at this camera's accuracy — cannot
 * turn into a right angle.
 */
export function touchedAt(
  ball: Sample[],
  players: { id: string; track: Track }[],
  f: number,
  fps: number,
  radiusM = CARRIER_RADIUS_M,
  blockers: Track[] = [],
): string | null {
  const window = Math.max(1, Math.round(TOUCH_WINDOW_S * fps));
  const at = (want: number) =>
    ball.reduce<Sample | null>(
      (best, s) =>
        Math.abs(s.f - want) <= 2 && (!best || Math.abs(s.f - want) < Math.abs(best.f - want))
          ? s
          : best,
      null,
    );
  const [before, here, after] = [at(f - window), at(f), at(f + window)];
  if (!before || !here || !after) return null;

  const inbound = { x: here.x - before.x, y: here.y - before.y };
  const outbound = { x: after.x - here.x, y: after.y - here.y };
  const [came, went] = [Math.hypot(inbound.x, inbound.y), Math.hypot(outbound.x, outbound.y)];
  const seconds = window / fps;
  if (came / seconds < TOUCH_SPEED_MS || went / seconds < TOUCH_SPEED_MS) return null;

  const cos = (inbound.x * outbound.x + inbound.y * outbound.y) / (came * went);
  const turn = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  return turn >= TOUCH_TURN_DEG ? nearestTo(ball, players, f, radiusM, blockers) : null;
}

/** The frames somebody touched the ball, one per turn rather than one per sighting. */
export function touches(
  ball: Sample[],
  tracks: Track[],
  fps: number,
  radiusM = CARRIER_RADIUS_M,
  blockers: Track[] = [],
): number[] {
  const players = tracks.map((track, i) => ({ id: String(i), track }));
  const out: number[] = [];
  let last = -Infinity;
  for (const s of [...ball].sort((a, b) => a.f - b.f)) {
    if (s.f - last < TOUCH_WINDOW_S * fps) continue;
    if (touchedAt(ball, players, s.f, fps, radiusM, blockers) !== null) {
      out.push(s.f);
      last = s.f;
    }
  }
  return out;
}

/**
 * Whose boot the ball came off, for a flight that starts at `f`.
 *
 * A flight begins by definition with the ball already clear of everybody (`LOOSE_M`), so the
 * kicker is not at that frame — he is at the last sighting before it where somebody was
 * still within reach. Naming him is what turns a ball appearing in mid-air into a pass:
 * without it the board draws the ball arriving from nowhere and a coach cannot see who
 * played it, which is exactly what one reported after `flights` first went in.
 *
 * Looks back `KICK_S` and no further. Beyond that the ball was somewhere else entirely and
 * the nearest player to an old sighting says nothing about this one.
 */
export function kickedBy(
  ball: Sample[],
  players: { id: string; track: Track }[],
  f: number,
  fps: number,
  radiusM = CARRIER_RADIUS_M,
): string | null {
  const back = ball
    .filter((s) => s.f <= f && (f - s.f) / fps <= KICK_S)
    .sort((a, b) => b.f - a.f);
  for (const s of back) {
    const who = nearestTo(ball, players, s.f, radiusM);
    if (who !== null) return who;
  }
  return null;
}

/**
 * The frames either side of a silence the ball moved across: it left, and it arrived.
 *
 * `flights` needs sightings to see a ball in the air, and the ones that matter most are
 * exactly where there are none — a shot is struck, the detector loses a ball travelling at
 * thirty metres a second, and the next thing anybody sees is it sitting in the goal. With
 * no scene at either end the board holds the striker's ball for the whole gap and then
 * floats it across two seconds of nothing, which is what a coach means by the ball getting
 * lost.
 *
 * Both ends are events the file is sure of: the last frame it saw the ball where it was,
 * and the first frame it saw where it got to. What happened in between is not claimed.
 *
 * A gap only counts if the ball MOVED across it (`minMoveM`). Sightings resuming where they
 * stopped are a detector blinking, not a pass.
 */
export function breaks(
  ball: Sample[],
  tracks: Track[],
  fps: number,
  minGapS = MIN_FLIGHT_S,
  minMoveM = LOOSE_M,
): number[] {
  const sorted = [...ball].sort((a, b) => a.f - b.f);
  const players = tracks.map((track, i) => ({ id: String(i), track }));
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = [sorted[i - 1], sorted[i]];
    if ((b.f - a.f) / fps <= minGapS) continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) < minMoveM) continue;
    // The arrival always: it is where the ball turned out to be, and a board with no
    // scene there drifts it across whatever the next scene happens to be.
    out.push(b.f);
    // The departure only if somebody still HAD it — the striker, about to shoot. A ball
    // already in flight when it was last seen is mid-pass, and a scene there breaks one
    // movement into two, which is the fault D75 exists to avoid.
    if (nearestTo(ball, players, a.f, CARRIER_RADIUS_M) !== null) out.push(a.f);
  }
  return out;
}

/** Fewest sightings a player must be nearest the ball at before the board must field him. */
export const MIN_ON_THE_BALL = 5;

/**
 * The eleven that between them cover the passage best, not the eleven seen longest.
 *
 * Ranking each player by how much of the clip he was watched for sounds like the same
 * question and is not. On a clip that follows the ball the length of the pitch, being in
 * shot for a long time means being wherever the camera settled — so every player from the
 * first half of the move loses his slot to one who had not arrived yet. On the coach's
 * Sporting clip the two Galatasaray players pressing his goalkeeper, seven and twelve
 * metres off him, were both cut for players who appear forty metres downfield a second
 * later, and the board showed an away side with nobody inside the D (D82).
 *
 * Greedy set cover over frames instead: repeatedly take whoever adds the most of the
 * passage nobody chosen so far was seen in. A player watched throughout still wins the
 * first slot, because he covers the most; a player watched only during the opening wins a
 * later one, because by then the opening is what is missing. The eleven come out spread
 * across the clip rather than bunched at the end of it.
 */
export function bestCover(
  tracks: Track[],
  from: number,
  to: number,
  tol: number,
  room: number,
): Track[] {
  if (room <= 0 || tracks.length === 0) return [];
  const span = to - from + 1;
  const seen = (t: Track) => {
    const value = new Float32Array(span);
    for (const s of t.samples) {
      const lo = Math.max(from, s.f - tol) - from;
      const hi = Math.min(to, s.f + tol) - from;
      for (let i = lo; i <= hi; i++) value[i] = 1;
    }
    return value;
  };
  const masks = new Map(tracks.map((t) => [t, seen(t)]));
  // How many of the chosen were watched at each frame. Not a flag: plain set cover
  // saturates, so once one player covers the opening a second one there is worth nothing
  // and the slot goes downfield instead — which loses the SHAPE of a press even though it
  // keeps a player in the picture. A frame already covered n times is worth 1/(1+n), so
  // the second man in a thin passage still outbids the fifth in a crowded one.
  const depth = new Uint8Array(span);
  const chosen: Track[] = [];
  const left = new Set(tracks);
  while (chosen.length < room && left.size > 0) {
    let best: Track | null = null;
    // Below any real gain, so the slots keep filling once the passage is covered: eleven
    // is a team, and stopping early fields nine.
    let gain = -1;
    for (const t of left) {
      const mask = masks.get(t)!;
      let adds = 0;
      for (let i = 0; i < span; i++) if (mask[i] > 0) adds += mask[i] / (1 + depth[i]);
      // Ties go to the better-watched player, which is what the ranking used to be and
      // is still the right answer between two who cover the same ground.
      const better =
        adds > gain || (adds === gain && best !== null && t.samples.length > best.samples.length);
      if (better) [best, gain] = [t, adds];
    }
    if (best === null) break;
    const mask = masks.get(best)!;
    for (let i = 0; i < span; i++) if (mask[i] > 0 && depth[i] < 255) depth[i]++;
    chosen.push(best);
    left.delete(best);
  }
  return chosen;
}

/**
 * The players the football goes through in a passage: whoever is nearest the ball, close
 * enough to have it, for more than a moment.
 *
 * The roster is capped at eleven a side and ranked by how much of the passage each player
 * was watched for, which is right for the twenty-one players who are not on the ball and
 * wrong for the one who is. A man who appears for a third of the window and receives the
 * pass the clip is about loses his place to a defender who stood in shot throughout, and
 * the pass then lands on grass: the board draws the ball at his feet and he is not there
 * to have it. `restartAt`'s taker is reserved for exactly this reason (D53); this is the
 * same rule for open play.
 */
export function onTheBall(
  ball: Sample[],
  tracks: Track[],
  from: number,
  to: number,
  radiusM = CARRIER_RADIUS_M,
): Set<Track> {
  const players = tracks.map((track, i) => ({ id: String(i), track }));
  const counted = new Map<string, number>();
  for (const s of ball) {
    if (s.f < from || s.f > to) continue;
    const who = nearestTo(ball, players, s.f, radiusM);
    if (who !== null) counted.set(who, (counted.get(who) ?? 0) + 1);
  }
  const out = new Set<Track>();
  for (const [id, seen] of counted) {
    if (seen >= MIN_ON_THE_BALL) out.add(players[Number(id)].track);
  }
  return out;
}

/**
 * The nearest player to the ball at a frame, inside the radius, and nothing more.
 *
 * `blockers` are tracks the board does not field — a player whose side the kit could not
 * settle (D72). They cannot be given the ball, and they must not be stepped over: on a
 * coach's clip the keeper's pass was received by an unreadable shirt, so the board handed
 * it to the next-nearest player, who was an opponent, and drew a keeper passing to the
 * opposition. Nearer than anybody nameable means nobody can be named.
 */
function nearestTo(
  ball: Sample[],
  players: { id: string; track: Track }[],
  f: number,
  radiusM: number,
  blockers: Track[] = [],
): string | null {
  if (ball.length === 0 || players.length === 0) return null;
  const here = ball.reduce((best, s) => (Math.abs(s.f - f) < Math.abs(best.f - f) ? s : best));
  // A sighting from another moment says nothing about this one.
  if (Math.abs(here.f - f) > 2) return null;

  let nearest: { id: string; d: number } | null = null;
  for (const { id, track } of players) {
    // The same rule the ball gets, applied to the player. `positionAt` CLAMPS outside a
    // track's range, so a player first seen at frame 268 reports that position when asked
    // about frame 1 — and the ball is handed to somebody who is not on the pitch yet.
    // Measured on SNGS-060: at scene frame 82 the carrier's track began at frame 120.
    if (f < track.samples[0].f || f > track.samples[track.samples.length - 1].f) continue;
    const p = positionAt(track, f);
    const d = Math.hypot(p.x - here.x, p.y - here.y);
    if (!nearest || d < nearest.d) nearest = { id, d };
  }
  if (!nearest || nearest.d > radiusM) return null;
  for (const track of blockers) {
    if (f < track.samples[0].f || f > track.samples[track.samples.length - 1].f) continue;
    const p = positionAt(track, f);
    if (Math.hypot(p.x - here.x, p.y - here.y) < nearest.d) return null;
  }
  return nearest.id;
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
  changes: number[] = [],
  backedAt: (frame: number) => number = () => 1,
  backedFloor: number = SCENE_BACKED_FLOOR,
): number[] {
  const minGap = Math.max(1, Math.round(MIN_SCENE_GAP_S * fps));
  // Events may sit closer together than scenes the deviation test invents, because they
  // are things that HAPPENED rather than places a curve fits badly. One-touch football is
  // three passes in a second, and at the deviation gap the second and third of them land
  // inside the first's shadow and are dropped -- a coach's possession highlight came back
  // as one player carrying the ball forty metres.
  const eventGap = Math.max(1, Math.round(MIN_EVENT_GAP_S * fps));
  const chosen = [from, to];

  // A change of possession is a scene whatever the players are doing. It is the event a
  // coach is looking at, and the deviation test below cannot find it: a pass moves the
  // ball twenty metres while everybody stands still, so no measurement of how far players
  // stray from their interpolation will ever put a scene there.
  for (const f of changes) {
    if (f - from < eventGap || to - f < eventGap) continue;
    if (chosen.some((c) => Math.abs(c - f) < eventGap)) continue;
    if (chosen.length >= maxScenes) break;
    // NOT subject to `backedFloor`. A pass is an observation of the ball and the two
    // players either end of it, and at a kick-off the rest of the roster is by definition
    // not gathered round: gating events on how many OTHER players are on screen deletes
    // the football and leaves the padding, which is the exact opposite of the intent.
    chosen.push(f);
  }
  chosen.sort((p, q) => p - q);

  while (chosen.length < maxScenes) {
    let worst = { error: 0, frame: -1 };

    for (let i = 0; i < chosen.length - 1; i++) {
      const a = chosen[i];
      const b = chosen[i + 1];
      if (b - a < 2 * minGap) continue;

      for (let f = a + minGap; f <= b - minGap; f++) {
        // The deviation test finds the frame where a player is furthest from where
        // interpolation puts them, and a player the tracker just lost deviates hardest of
        // all -- their position stops moving while everyone else carries on. Those frames
        // are the worst possible place for a scene.
        if (backedAt(f) < backedFloor) continue;
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
