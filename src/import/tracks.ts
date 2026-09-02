/**
 * `tracks.json` — the contract with football-tracks.
 *
 * The TypeScript mirror of that repo's `schema/tracks.schema.json`, which is normative.
 * Nothing here knows what a video is; a file arrives with positions already in pitch
 * metres, and where they came from — a computer-vision pipeline, a hand annotation, a
 * vendor's data — is deliberately none of this module's business.
 *
 * Validated rather than trusted. The file is produced by another program and arrives
 * over a file picker, so it is untrusted input in exactly the sense `storage.ts` means.
 */

import { z } from "zod";

/**
 * Which side a track is on.
 *
 * `home` and `away` are the two sides; the keepers are called out separately because a
 * keeper wears neither kit and the producer knows which is which. `unknown` is a track
 * whose side could not be told — kept rather than guessed at, and dropped on import.
 */
export const TEAM_LABELS = ["home", "away", "gkHome", "gkAway", "referee", "unknown"] as const;

const sample = z.object({
  /** Absolute frame index in the source video. */
  f: z.number().int().min(0),
  x: z.number().finite(),
  y: z.number().finite(),
  conf: z.number().min(0).max(1).optional(),
});

const track = z.object({
  id: z.number().int(),
  team: z.enum(TEAM_LABELS),
  /**
   * Shirt number, or null when it could not be read.
   *
   * Null is an answer, not a gap: a player whose number was never legible imports as a
   * generic token, and that is correct. A GUESSED number would attach a run to the
   * wrong player, and nothing downstream could tell.
   */
  number: z.number().int().min(1).max(99).nullable().optional(),
  numberConfidence: z.number().min(0).max(1).optional(),
  /** Sparse and ordered by frame. Gaps are expected and are not to be invented. */
  samples: z.array(sample).min(1),
});

export const tracksSchema = z.object({
  version: z.literal(1),
  source: z.object({
    clip: z.string().min(1),
    fps: z.number().positive(),
    startFrame: z.number().int().min(0),
    endFrame: z.number().int().min(0),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  }),
  pitch: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
  }),
  tracks: z.array(track),
  ball: z.unknown().nullable().optional(),
});

export type TracksFile = z.infer<typeof tracksSchema>;
export type Track = z.infer<typeof track>;
export type Sample = z.infer<typeof sample>;
export type TeamLabel = (typeof TEAM_LABELS)[number];
