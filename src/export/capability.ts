/**
 * Which video containers this browser can actually encode.
 *
 * Resolved by mediabunny's codec check at the size and bitrate about to be used,
 * never by user-agent sniffing — the answer depends on the resolution, and a
 * machine that encodes 720p H.264 may refuse 4K.
 *
 * mediabunny is imported dynamically so the encoder stays out of the main
 * bundle: the export dialog is the only thing that ever asks.
 */

import type { Size } from "./frame";
import type { VideoFormat } from "./types";

export async function encodableFormats(size: Size, bitrate: number): Promise<VideoFormat[]> {
  const { pickCodec } = await import("./codecs");
  const checked: VideoFormat[] = ["mp4", "webm"];
  const found = await Promise.all(checked.map((format) => pickCodec(format, size, bitrate)));
  return checked.filter((_, i) => found[i] !== null);
}
