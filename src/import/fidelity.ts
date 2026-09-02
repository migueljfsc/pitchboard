/**
 * How closely a board follows the play it was made from.
 *
 * The importer throws almost everything away: hundreds of frames become a handful of
 * scenes, and what happens between them is whatever the curve says. That is the point —
 * a board is a claim about a play, not a recording of it — but it means the reduction
 * can lose the very thing it exists to capture, and nothing else here would notice.
 *
 * Every other measurement in this pipeline is per frame: was this player found, is this
 * position within two metres, did the identity hold. A RUN is none of those. It is a
 * whole trajectory, and a board can score well on all of them while drawing a run that
 * bends the wrong way, because the fitted curve is never compared to anything.
 *
 * So this samples the board exactly as it is drawn — `resolveAt`, the same function the
 * renderer and the exporter use — and asks how far that is, in metres, from where the
 * player actually was. Nothing is reimplemented; measuring a reconstruction of the
 * renderer would measure the reconstruction.
 */

import type { BoardDoc } from "@/board/types";
import { positionAt as drawnAt, resolveAt, totalDurationMs } from "@/board/timeline";
import type { Imported } from "./index";
import { positionAt as trackAt } from "./reduce";

/** How often the drawn path is compared with the real one. */
export const SAMPLE_HZ = 10;

export type PlayerFidelity = {
  playerId: string;
  trackId: number;
  medianM: number;
  p90M: number;
  maxM: number;
};

export type Fidelity = {
  /** Over every player and every sample. */
  medianM: number;
  p90M: number;
  maxM: number;
  samples: number;
  players: PlayerFidelity[];
};

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

/**
 * Which source frame the board is showing at `tSeconds`.
 *
 * Scene i sits at `frames[i]`, and a transition runs linearly between two of them — the
 * board's own time, not the clip's, because a scene's `transitionMs` is what the board
 * will actually play. Getting this backwards would compare the drawing to the wrong
 * moment and blame the curve for it.
 */
export function frameAt(doc: BoardDoc, frames: number[], tSeconds: number): number {
  let elapsed = 0;
  for (let i = 1; i < doc.scenes.length; i++) {
    const span = doc.scenes[i].transitionMs / 1000;
    if (tSeconds <= elapsed + span || i === doc.scenes.length - 1) {
      const within = span <= 0 ? 0 : Math.min(1, Math.max(0, (tSeconds - elapsed) / span));
      return frames[i - 1] + within * (frames[i] - frames[i - 1]);
    }
    elapsed += span;
  }
  return frames[frames.length - 1];
}

export function fidelity(imported: Imported, sampleHz = SAMPLE_HZ): Fidelity {
  const { doc, frames, sources } = imported;

  const durationS = totalDurationMs(doc) / 1000;
  const steps = Math.max(2, Math.round(durationS * sampleHz));

  const all: number[] = [];
  const players: PlayerFidelity[] = [];

  for (const [playerId, track] of Object.entries(sources)) {
    const errors: number[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * durationS;
      const resolved = resolveAt(doc, t);
      const drawn = drawnAt(playerId, resolved, doc);
      if (!drawn) continue;
      const real = trackAt(track, Math.round(frameAt(doc, frames, t)));
      errors.push(Math.hypot(drawn.x - real.x, drawn.y - real.y));
    }
    if (errors.length === 0) continue;

    all.push(...errors);
    errors.sort((a, b) => a - b);
    players.push({
      playerId,
      trackId: track.id,
      medianM: percentile(errors, 0.5),
      p90M: percentile(errors, 0.9),
      maxM: errors[errors.length - 1],
    });
  }

  all.sort((a, b) => a - b);
  return {
    medianM: percentile(all, 0.5),
    p90M: percentile(all, 0.9),
    maxM: all.length ? all[all.length - 1] : NaN,
    samples: all.length,
    players: players.sort((a, b) => b.p90M - a.p90M),
  };
}
