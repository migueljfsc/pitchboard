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
  carrierAt,
  chooseScenes,
  chooseWindow,
  coverage,
  fitCurve,
  MAX_PER_SIDE,
  MIN_COVERAGE,
  onPitch,
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
  );

  const sides: Record<"home" | "away", Track[]> = { home: [], away: [] };
  for (const track of players) {
    const side = sideOf(track);
    // A track whose side could not be told is left out rather than assigned to one.
    // Half of them would be on the wrong team and nothing on the board would say so.
    if (!side) continue;
    if (coverage(track, from, to) < minCoverage) continue;
    // Somebody standing behind the goal is not a player, whatever the producer labelled
    // them. Their positions are off the pitch and they would appear on the board as a
    // teammate who never moves.
    if (!onPitch(track, file.pitch)) continue;
    sides[side].push(track);
  }

  // Best-observed first, then cut to a legal eleven. Coverage is the ranking because a
  // fragment is by definition the shorter half of something, so the players actually
  // watched through the passage are the ones that survive.
  for (const side of ["home", "away"] as const) {
    if (sides[side].length <= MAX_PER_SIDE) continue;
    sides[side] = sides[side]
      .slice()
      .sort(
        (a, b) =>
          coverage(b, from, to) - coverage(a, from, to) || b.samples.length - a.samples.length,
      )
      .slice(0, MAX_PER_SIDE);
  }

  const kept = [...sides.home, ...sides.away];
  if (kept.length === 0) return { ok: false, error: msg("import.tracks.empty") };

  const frames = chooseScenes(
    kept,
    from,
    to,
    file.source.fps,
    options.sceneToleranceM,
    options.maxScenes,
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
  let holder: string | null = null;
  const carriers = frames.map((f) => {
    const found = carrierAt(ballSamples, withIds, f);
    if (found) holder = found;
    return holder;
  });

  // Nobody held it before the first sighting either, so the ball would appear from
  // nowhere partway through. It starts with whoever first takes it instead.
  const first = carriers.find((c) => c !== null) ?? null;
  for (let i = 0; i < carriers.length && carriers[i] === null; i++) carriers[i] = first;

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
      // which is the right answer when nothing found one.
      carrier: carriers[i],
      ballPath: null,
    };
  });

  const sources: Record<string, Track> = {};
  for (const track of kept) sources[idOf.get(track)!] = track;

  return {
    ok: true,
    window: { from, to },
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
