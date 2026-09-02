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
import { chooseScenes, coverage, fitCurve, MIN_COVERAGE, onPitch, positionAt } from "./reduce";
import { tracksSchema, type Track, type TracksFile } from "./tracks";

export type ImportResult = { ok: true; doc: BoardDoc } | { ok: false; error: Message };

export type ImportOptions = {
  /** What the board and its scenes are called. Passed in so a board made in Portuguese
   *  is seeded in Portuguese — locale never enters `BoardDoc` (D38). */
  labels?: { board?: string; scene?: string };
  minCoverage?: number;
};

/** Sides a track can be put on. Referees and unknowns are not players and are dropped. */
const SIDES = {
  home: ["home", "gkHome"],
  away: ["away", "gkAway"],
} as const;

function sideOf(track: Track): "home" | "away" | null {
  if ((SIDES.home as readonly string[]).includes(track.team)) return "home";
  if ((SIDES.away as readonly string[]).includes(track.team)) return "away";
  return null;
}

export function boardFromTracks(raw: unknown, options: ImportOptions = {}): ImportResult {
  const parsed = tracksSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: msg("import.tracks.invalid") };
  const file: TracksFile = parsed.data;

  const from = file.source.startFrame;
  const to = file.source.endFrame;
  if (to <= from) return { ok: false, error: msg("import.tracks.invalid") };

  const minCoverage = options.minCoverage ?? MIN_COVERAGE;
  const sides: Record<"home" | "away", Track[]> = { home: [], away: [] };
  for (const track of file.tracks) {
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

  const kept = [...sides.home, ...sides.away];
  if (kept.length === 0) return { ok: false, error: msg("import.tracks.empty") };

  const frames = chooseScenes(kept, from, to, file.source.fps);

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
        const curve = fitCurve([positionAt(track, a), ...walked, positionAt(track, f)]);
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
      // No ball: nothing tracked one, and a scene that names no carrier and stores no
      // position simply has none (D44). Inventing one would put it on a player at random.
      carrier: null,
      ballPath: null,
    };
  });

  return {
    ok: true,
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
