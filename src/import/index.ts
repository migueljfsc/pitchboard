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
import { buildSquad, HOME, AWAY } from "@/formations";
import { msg, type Message } from "@/i18n/core";
import {
  CARRIER_RADIUS_M,
  carrierAt,
  chooseScenes,
  chooseWindow,
  fitCurve,
  handovers,
  MAX_PER_SIDE,
  MIN_COVERAGE,
  MIN_OBSERVED_S,
  MIN_WINDOW_S,
  observed,
  onPitch,
  SCENE_BACKED_FLOOR,
  WITNESS_TOL_S,
  witnessed,
  positionAt,
  restartAt,
  sideOf,
  splitImpossible,
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
  const events = [
    ...(kick !== null && kick >= from && kick <= to ? [kick] : []),
    ...handovers(ballSamples, kept, file.source.fps).filter((f) => f >= from && f <= to),
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
    handovers(ballSamples, kept, file.source.fps),
    backedAt,
  );

  const teams = (["home", "away"] as const).map((side) => {
    const spec = side === "home" ? HOME : AWAY;
    return buildSquad(
      { id: spec.id, name: spec.name, color: spec.color, textColor: spec.textColor },
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
  const found = frames.map((f) => carrierAt(ballSamples, withIds, f));

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

  // A holder stands until somebody else takes it, even across scenes where the ball was
  // seen somewhere else. Dropping the carrier at those scenes is more faithful to where
  // the ball WAS and worse as a board: one pass becomes three hops with the ball adrift
  // between them, and a stray sighting sends it to the touchline and back. A coach can
  // mark a pass that is drawn; they cannot repair a play that is not.
  // The taker of a restart may not play the ball twice in succession — Law 8, and it is
  // what a kick-off IS. Without this he simply keeps it: nobody else is inside the carrier
  // radius for the next few scenes, the holder stands, and the board shows him dribbling
  // away from the centre spot, which is not football.
  const takerId = taker ? (idOf.get(taker) ?? null) : null;
  let holder: string | null = null;
  let released = takerId === null;
  const carriers = found.map((c, i) => {
    if (c !== null && c !== takerId) released = true;
    if (i > 0 && !released) return null;
    if (c !== null) holder = c;
    return holder;
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

  const taken = carriers.findIndex((c) => c !== null);
  const first = taken >= 0 ? carriers[taken] : null;
  for (let i = 0; i < (taken >= 0 ? taken : carriers.length); i++) {
    // The opening scene keeps the ball's own position when there is one — that is the
    // restart, and it is what makes the kick a pass FROM the spot rather than a player
    // arriving already holding it. Every scene after it belongs to whoever first takes
    // the ball, so the passage opens with one travel instead of the ball going missing.
    if (i === 0 && resting[0] !== null) continue;
    carriers[i] = first;
  }

  const scenes: Scene[] = frames.map((f, i) => {
    const positions: Record<string, Vec2> = {};
    for (const track of kept) positions[idOf.get(track)!] = positionAt(track, f);

    const paths: Record<string, ReturnType<typeof fitCurve>> = {};
    if (i > 0) {
      const a = frames[i - 1];
      for (const track of kept) {
        const walked = track.samples
          .filter((s) => s.f >= a && s.f <= f)
          .map((s) => ({ x: s.x, y: s.y }));
        const curve = fitCurve(
          [positionAt(track, a), ...walked, positionAt(track, f)],
          options.straightToleranceM,
        );
        if (curve) paths[idOf.get(track)!] = curve;
      }
    }

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
      ...(i === 0 && carriers[0] === null && resting[0] ? { ballPos: resting[0] } : {}),
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
      name: options.labels?.board ?? file.source.clip,
      pitch: { length: file.pitch.length, width: file.pitch.width },
      teams: [teams[0], teams[1]],
      scenes,
      // No links: a link is a claim about which players form a unit, and nothing in a
      // tracks file makes that claim. The coach draws them.
      links: [],
    },
  };
}
