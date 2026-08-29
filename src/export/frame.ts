/**
 * What an exported frame is: how big, when, and how it is viewed.
 *
 * Everything here is pure, so the numbers the dialog quotes before you commit to
 * an export and the numbers the worker actually renders come from one place. The
 * worker never derives a size of its own.
 */

import type { BoardDoc, PitchView, RenderView } from "@/board/types";
import { DEFAULT_PITCH_VIEW } from "@/board/types";
import { fitViewport, halfRange } from "@/board/geometry";
import { framingOf, tiltedAspect } from "@/board/projection";
import { PITCH_PADDING } from "@/board/pitch";

export type Size = { width: number; height: number };

/**
 * Export sizes, given as the LONG edge in pixels.
 *
 * The short edge follows the board's own aspect rather than a fixed 16:9, so a
 * rotated or half-pitch export is tight to what is on screen instead of a thin
 * strip of pitch between two wide bands of surround.
 */
export const RESOLUTIONS = [960, 1280, 1920, 2560, 3840] as const;

export const DEFAULT_RESOLUTION = 1920;

/**
 * A GIF is an uncompressed-ish frame per frame and is meant to paste into a
 * chat, so it starts small. The larger sizes are still offered.
 */
export const DEFAULT_GIF_RESOLUTION = 960;
export const MAX_GIF_RESOLUTION = 1920;

/** H.264 and VP9 both want even dimensions on both axes. */
const even = (v: number): number => Math.max(2, Math.round(v / 2) * 2);

/**
 * Width / height of everything `drawBoard` paints, grass band included.
 *
 * Mirrors what `fitViewport` fits — the visible span along the pitch plus
 * `PITCH_PADDING` on every edge — so an export at this aspect has no dead space
 * on any side.
 */
export function boardAspect(doc: BoardDoc, view: PitchView = DEFAULT_PITCH_VIEW): number {
  const [x0, x1] = halfRange(view.half, doc.pitch.length);
  const along = x1 - x0 + PITCH_PADDING * 2;
  const across = doc.pitch.width + PITCH_PADDING * 2;
  // The angled camera foreshortens the length and widens the near edge, which
  // leaves a tilted board far closer to square than the pitch it is drawn from.
  // Sizing an export off the flat aspect would band it with dead surround.
  if (view.tilt) return tiltedAspect(across, along);
  return view.rotated ? across / along : along / across;
}

export function exportSize(
  longEdge: number,
  doc: BoardDoc,
  view: PitchView = DEFAULT_PITCH_VIEW,
): Size {
  const aspect = boardAspect(doc, view);
  return aspect >= 1
    ? { width: even(longEdge), height: even(longEdge / aspect) }
    : { width: even(longEdge * aspect), height: even(longEdge) };
}

/**
 * The view the exporter renders through.
 *
 * `interactive: false` is the only branch in the renderer that tells the two
 * contexts apart, and it only ever removes chrome — handles, marquee, hover.
 * Board content is identical to the preview by construction.
 */
export function exportView(
  doc: BoardDoc,
  size: Size,
  view: PitchView = DEFAULT_PITCH_VIEW,
): RenderView {
  const framing = framingOf(view);
  return {
    ...fitViewport(size.width, size.height, doc.pitch.length, doc.pitch.width, framing),
    width: size.width,
    height: size.height,
    interactive: false,
    tilt: framing.tilt,
  };
}

/**
 * Frames cover `[0, duration)` and never `duration` itself.
 *
 * The timeline always ends on a hold, so a frame at exactly `duration` repeats
 * the one before it — a wasted frame in an MP4 and a visible stutter at the seam
 * of a looping GIF.
 */
export function frameCount(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps));
}

export const frameTime = (index: number, fps: number): number => index / fps;

/**
 * Per-frame GIF delays, in milliseconds.
 *
 * A GIF stores delay in hundredths of a second, so at 30 fps every frame rounds
 * 33.3 ms down to 30 ms and a ten-second animation finishes a second early.
 * These are differences of rounded cumulative times instead, so the error stays
 * inside the frame it belongs to rather than accumulating across the clip.
 */
export function gifDelays(frames: number, fps: number): number[] {
  const at = (i: number) => Math.round((i * 100) / fps);
  return Array.from({ length: frames }, (_, i) => (at(i + 1) - at(i)) * 10);
}

/** Frames sampled to build the GIF palette. Enough to see every scene. */
export const PALETTE_SAMPLES = 16;

/**
 * Evenly spaced frame indices, first and last included.
 *
 * The palette is built once from these, so it has to see the whole animation:
 * a kit colour that only appears in the last scene must be in it.
 */
export function sampleIndices(frames: number, samples = PALETTE_SAMPLES): number[] {
  const n = Math.max(1, Math.min(frames, samples));
  if (n === 1) return [0];
  const out = Array.from({ length: n }, (_, i) => Math.round((i * (frames - 1)) / (n - 1)));
  return [...new Set(out)];
}
