/**
 * The contract between the main thread and the export worker.
 *
 * A request crosses once, by structured clone, and progress comes back. There is
 * no shared state and no second copy of the document, so the worker renders the
 * board it was handed and nothing else.
 */

import type { BoardDoc, PitchView } from "@/board/types";
import type { Size } from "./frame";

/** Containers mediabunny writes for us. */
export type VideoFormat = "mp4" | "webm";

/** What the worker can produce. PNG is a single frame and stays on the main thread. */
export type ClipFormat = VideoFormat | "gif";

export type ExportFormat = ClipFormat | "png";

export type ExportRequest = {
  doc: BoardDoc;
  /** The framing on screen — half, rotation — so the export matches the preview. */
  pitchView: PitchView;
  format: ClipFormat;
  size: Size;
  fps: number;
  /** Video only, bits per second. Ignored for GIF. */
  bitrate: number;
};

export type ExportResult = {
  buffer: ArrayBuffer;
  mime: string;
  extension: string;
  /** What was actually encoded, e.g. "avc" — the ladder may not have given us MP4. */
  codec: string;
};

/**
 * Where an export has got to. GIF quantises before it renders, so it has a phase
 * the video path does not.
 */
export type ExportPhase = "palette" | "render" | "finalise";

export type WorkerMessage =
  | { kind: "progress"; phase: ExportPhase; done: number; total: number }
  | { kind: "done"; result: ExportResult }
  | { kind: "error"; message: string };

export const MIME: Record<ClipFormat, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  gif: "image/gif",
};

export const FPS_OPTIONS: Record<ClipFormat, number[]> = {
  mp4: [24, 30, 60],
  webm: [24, 30, 60],
  // A GIF delay is a whole number of centiseconds, so rates that divide 100
  // land exactly. 50 is the ceiling: browsers clamp anything faster to 10 fps.
  gif: [10, 20, 25, 50],
};

export const DEFAULT_FPS: Record<ClipFormat, number> = { mp4: 60, webm: 60, gif: 25 };

/** Video bitrates, in bits per second, as offered in the dialog. */
export const BITRATES = [4e6, 8e6, 16e6, 32e6] as const;
export const DEFAULT_BITRATE = 8e6;
