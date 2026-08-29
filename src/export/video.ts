/**
 * MP4 and WebM, via mediabunny.
 *
 * The loop is offline: render a frame, hand it to the encoder, repeat. There is
 * no requestAnimationFrame and no compositor, so no frame can be captured stale
 * and export time is decoupled from clip length. That is the whole reason this
 * runs in a worker.
 */

import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
} from "mediabunny";

import { drawBoard } from "@/board/render";
import { totalSeconds } from "@/board/scenes";
import { pickCodec } from "./codecs";
import { exportView, frameCount, frameTime } from "./frame";
import {
  MIME,
  type ExportPhase,
  type ExportRequest,
  type ExportResult,
  type VideoFormat,
} from "./types";

export async function encodeVideo(
  request: ExportRequest,
  report: (phase: ExportPhase, done: number, total: number) => void,
): Promise<ExportResult> {
  const { doc, pitchView, size, fps, bitrate } = request;
  const format = request.format as VideoFormat;

  const codec = await pickCodec(format, size, bitrate);
  if (!codec) {
    throw new Error(
      `This browser cannot encode ${format.toUpperCase()} at ${size.width}x${size.height}. Try a smaller size, or export a GIF.`,
    );
  }

  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The browser would not give the export worker a 2D canvas.");

  const target = new BufferTarget();
  const output = new Output({
    format: format === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target,
  });
  const source = new CanvasSource(canvas, { codec, quality: new Quality({ bitrate }) });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const view = exportView(doc, size, pitchView);
  const frames = frameCount(totalSeconds(doc), fps);

  try {
    for (let i = 0; i < frames; i++) {
      drawBoard(ctx, doc, frameTime(i, fps), view);
      // Awaited so encoder and writer backpressure is respected; without it a
      // long export queues every frame in memory at once.
      await source.add(frameTime(i, fps), 1 / fps);
      report("render", i + 1, frames);
    }
    // Flushing the encoder and writing the container is its own wait, long
    // enough on a big clip to look like a hang if the bar stays on the last frame.
    report("finalise", 0, 1);
    await output.finalize();
    report("finalise", 1, 1);
  } catch (err) {
    await output.cancel();
    throw err;
  }

  if (!target.buffer) throw new Error("The encoder finished without producing a file.");
  return { buffer: target.buffer, mime: MIME[format], extension: format, codec };
}
