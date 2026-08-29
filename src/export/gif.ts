/**
 * GIF, via gifenc.
 *
 * The whole animation shares ONE palette. Quantising per frame is the default in
 * most encoders and is wrong here: the pitch greens crawl between frames, which
 * reads far worse than the colour loss it saves.
 */

import { GIFEncoder, applyPalette, quantize, type Palette } from "gifenc";

import { drawBoard } from "@/board/render";
import { totalSeconds } from "@/board/scenes";
import {
  exportView,
  frameCount,
  frameTime,
  gifDelays,
  sampleIndices,
  type Size,
} from "./frame";
import { MIME, type ExportRequest, type ExportResult } from "./types";

const COLORS = 256;

/**
 * Pixels the palette is built from, across all sampled frames.
 *
 * Quantising every pixel of sixteen 960px frames means holding ~50 MB of RGBA at
 * once for a palette that a fraction of them determines just as well.
 */
const PALETTE_PIXELS = 1 << 20;

type Ctx = OffscreenCanvasRenderingContext2D;

/**
 * Collect a subsample of the sampled frames into one RGBA buffer.
 *
 * The stride is forced odd so it cannot be a whole number of rows: an even
 * stride that divides the width would walk the same columns on every row and
 * miss the vertical pitch markings entirely.
 */
function paletteSample(
  ctx: Ctx,
  size: Size,
  draw: (index: number) => void,
  frames: number[],
  report: (done: number, total: number) => void,
): Uint8ClampedArray {
  const perFrame = size.width * size.height;
  const budget = Math.max(1, Math.floor(PALETTE_PIXELS / frames.length));
  const stride = Math.max(1, Math.ceil(perFrame / budget)) | 1;
  const kept = Math.ceil(perFrame / stride);

  const out = new Uint8ClampedArray(kept * frames.length * 4);
  let at = 0;

  frames.forEach((frame, n) => {
    draw(frame);
    const { data } = ctx.getImageData(0, 0, size.width, size.height);
    for (let p = 0; p < perFrame; p += stride) {
      const src = p * 4;
      out[at++] = data[src];
      out[at++] = data[src + 1];
      out[at++] = data[src + 2];
      out[at++] = data[src + 3];
    }
    report(n + 1, frames.length);
  });

  // The tail is only short when a frame's pixel count is not a multiple of the
  // stride. quantize reads the buffer as Uint32, so it must end on a pixel.
  return at === out.length ? out : out.slice(0, at);
}

export function encodeGif(
  request: ExportRequest,
  report: (phase: "palette" | "render", done: number, total: number) => void,
): ExportResult {
  const { doc, pitchView, size, fps } = request;

  const canvas = new OffscreenCanvas(size.width, size.height);
  // Every frame is read straight back out for palettising, which is exactly the
  // access pattern this hint exists for.
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("The browser would not give the export worker a 2D canvas.");

  const view = exportView(doc, size, pitchView);
  const frames = frameCount(totalSeconds(doc), fps);
  const delays = gifDelays(frames, fps);
  const draw = (index: number) => drawBoard(ctx, doc, frameTime(index, fps), view);

  const sample = paletteSample(ctx, size, draw, sampleIndices(frames), (done, total) =>
    report("palette", done, total),
  );
  const palette: Palette = quantize(sample, COLORS, { format: "rgb565" });

  const gif = GIFEncoder();
  for (let i = 0; i < frames; i++) {
    draw(i);
    const { data } = ctx.getImageData(0, 0, size.width, size.height);
    gif.writeFrame(applyPalette(data, palette, "rgb565"), size.width, size.height, {
      // Only the first frame carries the palette. Passing it again would write a
      // local colour table per frame — the same bytes, over and over.
      palette: i === 0 ? palette : null,
      delay: delays[i],
      repeat: 0,
    });
    report("render", i + 1, frames);
  }
  gif.finish();

  const bytes = gif.bytes();
  // bytes() already returns a right-sized copy; hand the worker its buffer so
  // the transfer back to the main thread costs nothing.
  return {
    buffer: bytes.buffer as ArrayBuffer,
    mime: MIME.gif,
    extension: "gif",
    codec: "gif",
  };
}
