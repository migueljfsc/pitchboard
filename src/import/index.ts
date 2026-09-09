/**
 * Video-derived tracks in, a board out.
 *
 * The public face of the importer. Everything numerical is in `reduce.ts`; this decides
 * what becomes a player, what becomes a scene, and what is refused.
 *
 * Returns a `Message` rather than a sentence, like every other pure module that can
 * fail — `migrate`, `urlcodec`, `json`, `presets`. None of their callers agree on a
 * language and neither do this one's (D38).
 */

import type { BoardDoc, Scene, Vec2 } from "@/board/types";
import { clamp } from "@/board/geometry";
import { PALETTE } from "@/components/ui/palette";
import { buildSquad, HOME, AWAY } from "@/formations";
import { msg, type Message } from "@/i18n/core";
import {
  CARRIER_RADIUS_M,
  carrierAt,
  chooseScenes,
  chooseWindow,
  BALL_EDGE_M,
  breaks,
  fitCurve,
  flights,
  handovers,
  kickedBy,
  MAX_PER_SIDE,
  MIN_COVERAGE,
  MIN_OBSERVED_S,
  MIN_WINDOW_S,
  observed,
  STILL_M,
  onPitch,
  SCENE_BACKED_FLOOR,
  WITNESS_TOL_S,
  witnessed,
  positionAt,
  leftBehind,
  looseAt,
  restartAt,
  scored,
  sideOf,
  sighted,
  splitImpossible,
  steady,
  touchedAt,
  touches,
} from "./reduce";
import { tracksSchema, type Track, type TracksFile } from "./tracks";

export type Imported = {
  doc: BoardDoc;
  /** The passage of the source the board was built from, in source frames. */
  window: { from: number; to: number };
  /** Source frame each scene was taken at, in order. */
  frames: number[];
  /**
   * The track each player was built from, by player id.
   *
   * The track itself, not its id. Tracks are split before use, so a fragment's id may
   * name nothing in the original file — and anything measuring the board against "the
   * source" would silently measure it against a different, unsplit player.
   */
  sources: Record<string, Track>;
};

export type ImportResult = ({ ok: true } & Imported) | { ok: false; error: Message };

export type ImportOptions = {
  /** What the board and its scenes are called. Passed in so a board made in Portuguese
   *  is seeded in Portuguese — locale never enters `BoardDoc` (D38). */
  labels?: { board?: string; scene?: string };
  minCoverage?: number;
  /** How far a player must stray from the interpolation before a frame becomes a scene. */
  sceneToleranceM?: number;
  /** Most scenes to make. */
  maxScenes?: number;
  /** A run straighter than this keeps a straight tween. Infinity draws none at all. */
  straightToleranceM?: number;
};

export function boardFromTracks(raw: unknown, options: ImportOptions = {}): ImportResult {
  const parsed = tracksSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: msg("import.tracks.invalid") };
  const file: TracksFile = parsed.data;

  if (file.source.endFrame <= file.source.startFrame) {
    return { ok: false, error: msg("import.tracks.invalid") };
  }

  const minCoverage = options.minCoverage ?? MIN_COVERAGE;
  // How far either side of a sample a position may be drawn from it. Everything that asks
  // "how much of this player did we see" asks it with the same tolerance as the window
  // chooser, or the board fields a roster the passage was not chosen for.
  const tol = Math.max(1, Math.round(WITNESS_TOL_S * file.source.fps));

  // Players first, then the window: which passage is best observed depends only on the
  // people who could be on the board at all, so referees and spectators must not vote.
  const players = file.tracks
    // Cut before anything else looks at them: a track holding an impossible jump is two
    // people, and every judgement after this — coverage, which passage was watched, the
    // curve through a scene — would be made about a person who does not exist.
    .flatMap((t) => splitImpossible(t, file.source.fps, undefined, file.source.intervalS))
    .filter((t) => sideOf(t) !== null && onPitch(t, file.pitch));
  // Read before the window is chosen, because it is one of the things choosing it: a
  // board made of a corner clip that does not contain the corner is the wrong board.
  const ballSamples = file.ball?.samples ?? [];
  const { from, to } = chooseWindow(
    players,
    file.source.startFrame,
    file.source.endFrame,
    file.source.fps,
    minCoverage,
    undefined,
    restartAt(ballSamples, file.pitch, file.source.fps),
    handovers(ballSamples, players, file.source.fps),
  );

  const sides: Record<"home" | "away", Track[]> = { home: [], away: [] };
  // The keeper of each side, best-observed first. Held apart from the outfielders because
  // he is a ROLE and they are a ranking: a side fields exactly one, and the producer has
  // already said which track it is. Coverage cannot judge him — he is at the far end of
  // the pitch and in shot only while play is there, so on a thirty-second window he sits
  // near 16% where an outfielder sits near 80%, and both numbers are correct. Ranked
  // against them he loses every time, and the board comes out with no goalkeeper and no
  // pass back to one.
  // Whoever stands over the ball at the restart. Reserved for the same reason the keeper
  // is: it is a ROLE this passage has, not a ranking. The taker is on screen for the kick
  // and often little else — on SNGS-060 he holds 14% of the window against an outfielder's
  // 80% — so coverage cuts him, and the board opens on a restart with nobody to take it.
  const kick = restartAt(ballSamples, file.pitch, file.source.fps);
  let taker: Track | null = null;
  if (kick !== null) {
    const here = ballSamples.reduce<(typeof ballSamples)[number] | null>(
      (best, s) =>
        Math.abs(s.f - kick) <= 2 && (!best || Math.abs(s.f - kick) < Math.abs(best.f - kick))
          ? s
          : best,
      null,
    );
    if (here) {
      let best = CARRIER_RADIUS_M;
      for (const track of players) {
        if (!sideOf(track) || !onPitch(track, file.pitch)) continue;
        if (kick < track.samples[0].f || kick > track.samples[track.samples.length - 1].f) continue;
        const p = positionAt(track, kick);
        const d = Math.hypot(p.x - here.x, p.y - here.y);
        if (d < best) [best, taker] = [d, track];
      }
    }
  }

  const keepers: Record<"home" | "away", Track | null> = { home: null, away: null };
  for (const track of players) {
    const side = track.team === "gkHome" ? "home" : track.team === "gkAway" ? "away" : null;
    if (!side || !onPitch(track, file.pitch)) continue;
    const held = keepers[side];
    if (!held || witnessed(track, from, to, tol) > witnessed(held, from, to, tol)) {
      keepers[side] = track;
    }
  }

  for (const track of players) {
    const side = sideOf(track);
    // A track whose side could not be told is left out rather than assigned to one.
    // Half of them would be on the wrong team and nothing on the board would say so.
    if (!side) continue;
    if (track === keepers[side]) continue;
    // The same two tests `chooseWindow` scored the passage with. They have to agree: a
    // window chosen for a roster this then declines to field is a window chosen for
    // nothing.
    if (
      track !== taker &&
      (witnessed(track, from, to, tol) < minCoverage ||
        observed(track, from, to, file.source.fps) < MIN_OBSERVED_S)
    ) {
      continue;
    }
    // Somebody standing behind the goal is not a player, whatever the producer labelled
    // them. Their positions are off the pitch and they would appear on the board as a
    // teammate who never moves.
    if (!onPitch(track, file.pitch)) continue;
    sides[side].push(track);
  }

  // Best-observed first, then cut to a legal eleven. Coverage is the ranking because a
  // fragment is by definition the shorter half of something, so the players actually
  // watched through the passage are the ones that survive. The keeper takes the first
  // slot rather than competing for one.
  for (const side of ["home", "away"] as const) {
    const keeper = keepers[side];
    const reserved = sides[side].filter((t) => t === taker);
    const room = MAX_PER_SIDE - (keeper ? 1 : 0) - reserved.length;
    if (sides[side].length - reserved.length > room) {
      sides[side] = [
        ...reserved,
        ...sides[side]
          .filter((t) => t !== taker)
          .sort(
            (a, b) =>
              witnessed(b, from, to, tol) - witnessed(a, from, to, tol) ||
              b.samples.length - a.samples.length,
          )
          .slice(0, room),
      ];
    }
    if (keeper) sides[side].unshift(keeper);
  }

  const kept = [...sides.home, ...sides.away];
  if (kept.length === 0) return { ok: false, error: msg("import.tracks.empty") };

  // On the pitch, and nameable by nobody: a track whose side the kit could not settle
  // (D72). The board cannot field them -- half would be in the wrong colour -- but the
  // ball can still be at their feet, and pretending they are not there hands it to the
  // next player along, who may be an opponent.
  //
  // Officials are NOT among them. `unknown` means the side could not be read; `referee`
  // means it was read and there isn't one, and a linesman standing near the ball is not a
  // reason to refuse to say who has it.
  const unnamed = players.filter((t) => t.team === "unknown" && onPitch(t, file.pitch));

  // How much of the board is real at a frame, for the roster this passage actually fields.
  const backedAt = (f: number) =>
    kept.filter((t) => t.samples.some((s) => Math.abs(s.f - f) <= tol)).length /
    Math.max(kept.length, 1);

  // Trim the passage to where the players are on screen. A window's ends are the likeliest
  // to be empty -- a track starting or stopping there is exactly what made that frame a
  // candidate -- and a board whose last scene is drawn from memory is the one a coach
  // notices, because it is where the play stops making sense.
  //
  // It may never cross an EVENT. The restart and every change of possession are what the
  // passage was chosen for, and trimming a quiet opening straight past the kick-off is how
  // a board loses the one thing on it a coach came to see.
  const ballEvents = [
    ...handovers(ballSamples, kept, file.source.fps),
    // The ball coming loose is an event whether or not anybody is there to receive it: a
    // pass to an untracked player and a shot both end in nobody's possession, and trimming
    // past one loses the only mark the file carries of it.
    ...flights(ballSamples, kept, file.source.fps),
    // And both ends of a silence the ball crossed. The shot is the case: nobody sees it
    // between the boot and the net, so without these the board carries it on the striker
    // and then drifts it into the goal over whatever the next scene happens to be.
    ...breaks(ballSamples, kept, file.source.fps),
    // And every touch: a one-touch pass is over before the hold test can see it, so
    // without these the board draws a move of six passes as one player carrying.
    ...touches(ballSamples, kept, file.source.fps, undefined, unnamed),
  ].sort((a, b) => a - b);
  const events = [
    ...(kick !== null && kick >= from && kick <= to ? [kick] : []),
    ...ballEvents.filter((f) => f >= from && f <= to),
  ];
  const firstEvent = events.length ? Math.min(...events) : to;
  const lastEvent = events.length ? Math.max(...events) : from;

  let [start, end] = [from, to];
  const shortest = Math.round(MIN_WINDOW_S * file.source.fps);
  while (end - start > shortest && start < firstEvent && backedAt(start) < SCENE_BACKED_FLOOR) {
    start++;
  }
  while (end - start > shortest && end > lastEvent && backedAt(end) < SCENE_BACKED_FLOOR) end--;

  const frames = chooseScenes(
    kept,
    start,
    end,
    file.source.fps,
    options.sceneToleranceM,
    options.maxScenes,
    ballEvents,
    backedAt,
  );

  // The kits from the clip where the file measured them, this board's palette where it
  // could not. A coach who watched Everton in blue and United in red should not have to
  // translate the board's own two colours back to the game he is correcting.
  const worn = fromPalette(file.kits?.home ?? null, file.kits?.away ?? null);
  const teams = (["home", "away"] as const).map((side) => {
    const spec = side === "home" ? HOME : AWAY;
    const color = worn[side] ?? spec.color;
    return buildSquad(
      { id: spec.id, name: spec.name, color, textColor: readableOn(color) },
      sides[side].map((t) => ({ number: t.number ?? undefined })),
    );
  });

  // Track to player id, by position within its side, because `buildSquad` may have moved
  // a player off a taken shirt number and the id follows the number it settled on.
  const idOf = new Map<Track, string>();
  (["home", "away"] as const).forEach((side, i) => {
    sides[side].forEach((track, j) => idOf.set(track, teams[i].players[j].id));
  });

  // The ball, resolved to a holder at each scene. Where nobody can be said to have it —
  // it is in flight, or the sighting was not believable — the previous holder keeps it.
  // That is not a guess about who has the ball: it is what a board MEANS. A carrier
  // stands until somebody else takes it, and the flight between two holders is exactly
  // the pass Pitchboard draws (D43, D44).
  const withIds = kept.map((track) => ({ id: idOf.get(track)!, track }));
  // With `fps`, so a scene asks who HOLDS the ball rather than who it is passing over.
  // Who holds it, or -- where nobody does -- who turned it, which is what one-touch play
  // looks like from the outside (D78 in this file's numbering: `touchedAt`).
  const found = frames.map(
    (f) =>
      carrierAt(ballSamples, withIds, f, undefined, file.source.fps, unnamed) ??
      touchedAt(ballSamples, withIds, f, file.source.fps, undefined, unnamed),
  );

  // Before the first sighting the ball is somewhere, and it is not with the player who
  // eventually picks it up. Handing those scenes to that player puts it metres from where
  // it sat and erases the kick that started the passage — which is what a restart is. So
  // the leading scenes hold the ball's own position instead, which is exactly what
  // `ballPos` is for and is only trustworthy here: a ball at rest on the ground is where
  // the homography says, and a ball in flight is not (D44, and `tracks.ts` on the ball).
  const resting = frames.map((f) => {
    if (ballSamples.length === 0) return null;
    const here = ballSamples.reduce((best, s) =>
      Math.abs(s.f - f) < Math.abs(best.f - f) ? s : best,
    );
    return Math.abs(here.f - f) <= 2 ? { x: here.x, y: here.y } : null;
  });

  // A ball the camera model puts outside the field is either out of play or a false
  // positive, and drawing it where the model says takes the play off the board. Just
  // outside is the interesting case and the commonest: a shot ends up BEHIND the goal
  // line, and a metre of registration error puts it there too — so a sighting within
  // BALL_EDGE_M of the field is pulled onto it, which draws a goal on the line, and
  // anything further out is dropped. SNGS-060 had one at (-1, 9), which is neither.
  const onField = (p: Vec2 | null) => {
    if (!p) return null;
    const [x, y] = [clamp(p.x, 0, file.pitch.length), clamp(p.y, 0, file.pitch.width)];
    return Math.hypot(x - p.x, y - p.y) <= BALL_EDGE_M ? { x, y } : null;
  };

  // A holder stands until somebody else takes it, even across scenes where the ball was
  // seen somewhere else. Dropping the carrier at those scenes is more faithful to where
  // the ball WAS and worse as a board: one pass becomes three hops with the ball adrift
  // between them, and a stray sighting sends it to the touchline and back. A coach can
  // mark a pass that is drawn; they cannot repair a play that is not.
  // The taker of a restart may not play the ball twice in succession — Law 8, and it is
  // what a kick-off IS. Without this he simply keeps it: nobody else is inside the carrier
  // radius for the next few scenes, the holder stands, and the board shows him dribbling
  // away from the centre spot, which is not football.
  // Where the ball is in the air or dead, metres from everybody: the file says where it is
  // and says nobody has it, and both halves of that are worth drawing (D44).
  const loose = frames.map((f) => looseAt(ballSamples, withIds, f, undefined, unnamed));

  const takerId = taker ? (idOf.get(taker) ?? null) : null;
  let holder: string | null = null;
  let released = takerId === null;
  // Scenes where the file DENIES a holder rather than merely failing to name one. The two
  // are not the same answer and only the second may be filled in below.
  const denied = frames.map(() => false);
  const carriers = found.map((c, i) => {
    if (c !== null && c !== takerId) released = true;
    if (i > 0 && !released) return null;
    if (c !== null) holder = c;
    // A sighting that puts the ball out of his reach ends his possession, whether or not
    // anybody else can be shown to have taken it. Otherwise he keeps it on the board all
    // the way through the pass he played, and out to the corner flag to celebrate.
    else if (leftBehind(ballSamples, withIds, frames[i], holder)) {
      holder = null;
      denied[i] = true;
    }
    // Carrying a holder forward is a reading of the ball's silence, and it is only good
    // for as long as the silence is short (CARRY_S). Past that the file says nothing
    // about who has the ball, and the board says nothing either.
    // Only where there is a holder to lose: before anybody has been named, silence denies
    // nothing -- it is the opening of a board, not a statement about possession.
    else if (holder !== null && !sighted(ballSamples, frames[i], file.source.fps)) {
      holder = null;
      denied[i] = true;
    }
    return holder;
  });

  const settled = steady(carriers);
  carriers.splice(0, carriers.length, ...settled);

  // A flight with a player at both ends is already a pass: the carrier changes from the
  // man who struck it to the man who takes it, and that is ONE movement on the board.
  // Drawing the ball at its own position in between splits it into two hops -- reported
  // by a coach as "the pass is getting divided into two movements". So the ball is drawn
  // on its own only where the carrier model cannot draw the event: a shot, a ball that
  // runs out of play, a pass to somebody the tracker never held.
  loose.forEach((where, i) => {
    if (where === null || carriers[i] !== null) return;
    const lands = carriers.findIndex((c, j) => j > i && c !== null);
    const from = kickedBy(ballSamples, withIds, frames[i], file.source.fps);
    if (from !== null && lands >= 0) carriers[i] = from;
  });

  // Where the ball was NOT seen either, the old answer still stands: it starts with
  // whoever first takes it, rather than materialising in scene three.
  // The kick lands on whoever is next known to hold it. Between the restart and them the
  // ball is in the air with nobody we can name under it, and leaving those scenes empty
  // makes it blink out after the kick-off — so they belong to the receiver, and the kick
  // is one travel from the spot to him.
  if (carriers[0] !== null && carriers[0] === takerId) {
    const lands = carriers.findIndex((c, i) => i > 0 && c !== null);
    if (lands > 1) for (let i = 1; i < lands; i++) carriers[i] = carriers[lands];
  }

  // The first flight nobody could be named at either end of: nothing before it can be
  // given to anybody, because the ball came off a boot this file never saw.
  const adrift = loose.findIndex((p, i) => p !== null && carriers[i] === null);
  // Whoever struck THAT one, if the file saw him: the scenes before it are his, and where
  // it saw nobody they stay empty rather than being handed to a player who never had it.
  const struck =
    adrift >= 0 ? kickedBy(ballSamples, withIds, frames[adrift], file.source.fps) : null;

  // A scene the file could not name a holder at — as opposed to one where it says there
  // is none — belongs to the next player known to hold the ball. That is the old "it
  // starts with whoever first takes it" rule, applied wherever possession resumes rather
  // than only at the opening: the pass is then drawn once, from the man who struck it to
  // the man who took it, instead of the ball going missing in between and arriving in two
  // hops.
  const next = (i: number) => carriers.slice(i + 1).find((c) => c !== null) ?? null;
  for (let i = 0; i < carriers.length; i++) {
    if (carriers[i] !== null || denied[i] || loose[i] !== null) continue;
    // The opening scene keeps the ball's own position when there is one — that is the
    // restart, and it is what makes the kick a pass FROM the spot rather than a player
    // arriving already holding it.
    if (i === 0 && resting[0] !== null) continue;
    carriers[i] = adrift >= 0 && i < adrift ? struck : next(i);
  }

  // What the board draws for the ball at each scene, where it names nobody.
  const drawnBall = frames.map((_f, i) => onField(loose[i] ?? resting[i]));

  // Once it has crossed the line the play is over: the ball stays in the net rather than
  // drifting back onto the pitch as the next sighting says, and nobody is holding it. A
  // goal drawn on the line among the defenders standing on it reads as a turnover, which
  // is what a coach reported on a clip that ends in one.
  const scoredAt = frames.findIndex((_f, i) => {
    const seen = loose[i] ?? resting[i];
    return seen !== null && scored(seen, file.pitch) !== null;
  });
  if (scoredAt >= 0) {
    const net = scored((loose[scoredAt] ?? resting[scoredAt])!, file.pitch)!;
    for (let i = scoredAt; i < frames.length; i++) {
      carriers[i] = null;
      drawnBall[i] = net;
    }
  }

  // Where each player was last DRAWN, which is not always where the file puts them: a run
  // shorter than the camera model's own error is the measurement wobbling, and drawing it
  // gives the coach an arrow for a player who stood still (D69).
  const drawn: Record<string, Vec2> = {};
  /** Each scene's positions as drawn, so a path is fitted between what the board shows. */
  const scenes_: Record<string, Vec2>[] = [];

  const scenes: Scene[] = frames.map((f, i) => {
    const positions: Record<string, Vec2> = {};
    for (const track of kept) {
      const id = idOf.get(track)!;
      const here = positionAt(track, f);
      const before = drawn[id];
      const still = before && Math.hypot(here.x - before.x, here.y - before.y) < STILL_M;
      positions[id] = still ? before : here;
      drawn[id] = positions[id];
    }

    const paths: Record<string, ReturnType<typeof fitCurve>> = {};
    if (i > 0) {
      const a = frames[i - 1];
      for (const track of kept) {
        const id = idOf.get(track)!;
        const [was, now] = [scenes_[i - 1][id], positions[id]];
        // A player who did not move has no path to fit, and fitting one through the
        // samples anyway draws a curve out of and back into the same point.
        if (was.x === now.x && was.y === now.y) continue;
        const walked = track.samples
          .filter((s) => s.f >= a && s.f <= f)
          .map((s) => ({ x: s.x, y: s.y }));
        const curve = fitCurve([was, ...walked, now], options.straightToleranceM);
        if (curve) paths[id] = curve;
      }
    }
    scenes_.push(positions);

    return {
      id: `scene-${i + 1}`,
      name: `${options.labels?.scene ?? "Scene"} ${i + 1}`,
      // Meaningless on the first scene — there is nothing to travel from.
      transitionMs: i === 0 ? 0 : Math.round(((f - frames[i - 1]) / file.source.fps) * 1000),
      holdMs: 0,
      positions,
      paths,
      // A scene naming no carrier and storing no position has no ball at all (D44),
      // which is the right answer when nothing found one. A scene never holds both, so
      // the ball takes its OWN position only where it was seen and the holder the board
      // is carrying demonstrably does not have it: the restart, where it sits on its spot,
      // and the middle of a long ball, where whoever kicked it is thirty metres behind it.
      // Anywhere else the holder keeps it, or one pass becomes three hops.
      carrier: carriers[i],
      // The ball's own position, wherever the board names nobody and the file saw it. That
      // is the pass in the air, the shot on its way in, and the restart on its spot — the
      // events a carrier model has no way to draw (D44).
      ...(carriers[i] === null && drawnBall[i] ? { ballPos: drawnBall[i]! } : {}),
      ballPath: null,
    };
  });

  const sources: Record<string, Track> = {};
  for (const track of kept) sources[idOf.get(track)!] = track;

  return {
    ok: true,
    window: { from: start, to: end },
    frames,
    sources,
    doc: {
      version: 1,
      // Named for the passage, not just the clip. A board can only cover the part of a
      // clip that was tracked well enough to draw -- SNGS-151's first 21 seconds hold
      // fewer than six players, so its board opens at 21.4 s -- and a coach who chose the
      // clip and knows what is in it needs to be told which piece of it they are looking
      // at. Silence there reads as the board being wrong about the video.
      name:
        options.labels?.board ??
        (start > file.source.startFrame || end < file.source.endFrame
          ? `${file.source.clip} (${(start / file.source.fps).toFixed(0)}–${(end / file.source.fps).toFixed(0)}s)`
          : file.source.clip),
      pitch: { length: file.pitch.length, width: file.pitch.width },
      teams: [teams[0], teams[1]],
      scenes,
      // No links: a link is a claim about which players form a unit, and nothing in a
      // tracks file makes that claim. The coach draws them.
      links: [],
    },
  };
}

/**
 * Black or white, whichever can be read on a shirt colour.
 *
 * Relative luminance, the way a browser measures contrast: a yellow kit takes black
 * numbers and a navy one takes white, and getting it the wrong way round makes the
 * numbers vanish on exactly the kits that are hardest to tell apart anyway.
 */
function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.45 ? "#000000" : "#ffffff";
}

/**
 * The measured kits, snapped to the swatches the team picker offers.
 *
 * A colour read off a shirt is a measurement — `#3a81d1`, `#d1493a` — and a board whose
 * teams are two colours that appear nowhere in the picker is one a coach cannot re-pick
 * or match a link to. So the file says what it saw and the board says it in its own
 * vocabulary, which is the same bargain `buildSquad` already makes about formations.
 *
 * The two sides may not land on the same swatch. Where they would, the better match keeps
 * it and the other takes its next choice: two teams in one colour is not a board.
 */
function fromPalette(
  home: string | null,
  away: string | null,
): { home: string | null; away: string | null } {
  if (home === null || away === null) return { home: null, away: null };
  const ranked = (hex: string) =>
    [...PALETTE].sort((a, b) => apart(hex, a) - apart(hex, b)) as string[];
  const [first, second] = [ranked(home), ranked(away)];
  if (first[0] !== second[0]) return { home: first[0], away: second[0] };
  // Whoever matches its swatch worse gives way, and takes the next one down its own list.
  return apart(home, first[0]) <= apart(away, second[0])
    ? { home: first[0], away: second[1] }
    : { home: first[1], away: second[0] };
}

/**
 * How far apart two colours look, by the "redmean" approximation.
 *
 * Plain RGB distance calls a saturated blue and a saturated green neighbours, which is
 * how a red kit ends up amber. This weights the channels by where in the red range the
 * pair sits, and is within a point or two of a Lab distance over a palette this size.
 */
function apart(a: string, b: string): number {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const mean = (ar + br) / 2;
  const [dr, dg, db] = [ar - br, ag - bg, ab - bb];
  return (2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db;
}
