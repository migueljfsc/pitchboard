/**
 * The format ladder.
 *
 * Its own module so the capability probe can be lazily imported without dragging
 * the muxers in with it — the dialog asks what is possible long before anything
 * is encoded.
 */

import { Quality, getFirstEncodableVideoCodec, type VideoCodec } from "mediabunny";

import type { Size } from "./frame";
import type { VideoFormat } from "./types";

/**
 * Codecs tried per container, in order. The first the browser can actually
 * encode wins — resolved by capability check, never by user-agent sniffing.
 */
export const CODECS: Record<VideoFormat, VideoCodec[]> = {
  mp4: ["avc"],
  webm: ["vp9", "vp8"],
};

export function pickCodec(
  format: VideoFormat,
  size: Size,
  bitrate: number,
): Promise<VideoCodec | null> {
  return getFirstEncodableVideoCodec(CODECS[format], {
    width: size.width,
    height: size.height,
    quality: new Quality({ bitrate }),
  });
}
