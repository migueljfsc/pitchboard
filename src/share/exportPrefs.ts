/**
 * The export dialog's settings, as the reader last left them.
 *
 * A per-browser convenience, through the ordinary storage layer: nothing throws,
 * and every field is validated on its own rather than trusted (D31) — one that is
 * out of range, or no longer offered, falls back to its default and takes nothing
 * else with it. The caption's words are the board's, so they are not kept, and whether
 * there is a caption at all is asked afresh each time: it starts off.
 */

import {
  DEFAULT_GIF_RESOLUTION,
  DEFAULT_RESOLUTION,
  EXPORT_SHAPES,
  MAX_GIF_RESOLUTION,
  RESOLUTIONS,
  type ExportShape,
} from "@/export/frame";
import { BITRATES, DEFAULT_BITRATE, DEFAULT_FPS, FPS_OPTIONS, type ExportFormat } from "@/export/types";
import { browserStore, keyFor, read, write, type Store } from "./storage";

export const EXPORT_PREFS_KEY = keyFor("export");

export type ExportPrefs = {
  format: ExportFormat;
  /** JSON sits beside the encoder's format rather than being one. */
  json: boolean;
  videoEdge: number;
  gifEdge: number;
  fps: number;
  bitrate: number;
  shape: ExportShape;
  sceneCaption: boolean;
  /** The scene's note under its name in a caption (D121). */
  noteCaption: boolean;
  transparent: boolean;
};

export const EXPORT_DEFAULTS: ExportPrefs = {
  format: "mp4",
  json: false,
  videoEdge: DEFAULT_RESOLUTION,
  gifEdge: DEFAULT_GIF_RESOLUTION,
  fps: DEFAULT_FPS.mp4,
  bitrate: DEFAULT_BITRATE,
  shape: "board",
  sceneCaption: true,
  noteCaption: true,
  transparent: false,
};

const FORMATS: readonly ExportFormat[] = ["mp4", "webm", "gif", "png"];

const oneOf = <T>(options: readonly T[], v: unknown): T | undefined =>
  options.includes(v as T) ? (v as T) : undefined;
const flag = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

export function loadExportPrefs(store: Store | null = browserStore()): ExportPrefs {
  const stored = read(store, EXPORT_PREFS_KEY, (raw) => (raw && typeof raw === "object" ? raw : null)) as
    | Record<string, unknown>
    | null;
  if (!stored) return EXPORT_DEFAULTS;

  const d = EXPORT_DEFAULTS;
  const format = oneOf(FORMATS, stored.format) ?? d.format;
  // A rate means something only for the format it was chosen with; a PNG has none,
  // and switching format resets it anyway.
  const fps = format === "png" ? d.fps : (oneOf(FPS_OPTIONS[format], stored.fps) ?? DEFAULT_FPS[format]);
  return {
    format,
    json: flag(stored.json) ?? d.json,
    videoEdge: oneOf(RESOLUTIONS, stored.videoEdge) ?? d.videoEdge,
    gifEdge:
      oneOf(
        RESOLUTIONS.filter((r) => r <= MAX_GIF_RESOLUTION),
        stored.gifEdge,
      ) ?? d.gifEdge,
    fps,
    bitrate: oneOf(BITRATES, stored.bitrate) ?? d.bitrate,
    shape: oneOf(EXPORT_SHAPES, stored.shape) ?? d.shape,
    sceneCaption: flag(stored.sceneCaption) ?? d.sceneCaption,
    noteCaption: flag(stored.noteCaption) ?? d.noteCaption,
    transparent: flag(stored.transparent) ?? d.transparent,
  };
}

export const saveExportPrefs = (prefs: ExportPrefs, store: Store | null = browserStore()): boolean =>
  write(store, EXPORT_PREFS_KEY, prefs);
