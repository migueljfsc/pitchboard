/**
 * Runtime validation for BoardDoc.
 *
 * Imported by both the app and the Cloudflare Worker, so client and server cannot
 * disagree about what a valid document is. Do not add a second validator.
 */

import { z } from "zod";
import type { BoardDoc } from "./types";
import { BALL_ID } from "./types";

const vec2 = z.object({ x: z.number().finite(), y: z.number().finite() });

const pathCurve = z.object({ c1: vec2, c2: vec2 });

const player = z.object({
  id: z.string().min(1),
  number: z.number().int().min(0).max(99),
  label: z.string().max(40),
});

const team = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  color: z.string().min(1),
  textColor: z.string().min(1),
  players: z.array(player).max(30),
  hidden: z.boolean().optional(),
});

const scene = z.object({
  id: z.string().min(1),
  name: z.string().max(60),
  transitionMs: z.number().int().min(0).max(60_000),
  holdMs: z.number().int().min(0).max(60_000),
  positions: z.record(z.string(), vec2),
  paths: z.record(z.string(), pathCurve.nullable()),
  carrier: z.string().nullable(),
  ballPos: vec2.optional(),
  ballPath: pathCurve.nullable().optional(),
});

const link = z.object({
  id: z.string().min(1),
  name: z.string().max(60),
  members: z.array(z.string().min(1)).min(2).max(11),
  style: z.enum(["chain", "polygon", "filled"]),
  color: z.string().min(1),
  showDistances: z.boolean(),
  hidden: z.boolean().optional(),
});

/**
 * Structural schema. The cross-field invariants that make a document actually
 * renderable are applied by `boardDocSchema` below.
 */
const boardDocShape = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(120),
  pitch: z.object({
    length: z.number().min(50).max(150),
    width: z.number().min(30).max(100),
  }),
  teams: z.tuple([team, team]),
  scenes: z.array(scene).min(1).max(60),
  links: z.array(link).max(20),
});

export const boardDocSchema = boardDocShape.superRefine((doc, ctx) => {
  const playerIds = new Set(doc.teams.flatMap((t) => t.players.map((p) => p.id)));

  // Duplicate ids across teams would make positions ambiguous.
  const totalPlayers = doc.teams.reduce((n, t) => n + t.players.length, 0);
  if (playerIds.size !== totalPlayers) {
    ctx.addIssue({ code: "custom", message: "duplicate player id across teams", path: ["teams"] });
  }

  doc.scenes.forEach((s, i) => {
    for (const id of playerIds) {
      if (!(id in s.positions)) {
        ctx.addIssue({
          code: "custom",
          message: `scene is missing a position for player ${id}`,
          path: ["scenes", i, "positions"],
        });
      }
    }

    for (const id of Object.keys(s.paths)) {
      if (id !== BALL_ID && !(id in s.positions)) {
        ctx.addIssue({
          code: "custom",
          message: `path references ${id}, which has no position in this scene`,
          path: ["scenes", i, "paths"],
        });
      }
    }

    if (s.carrier !== null && !playerIds.has(s.carrier)) {
      ctx.addIssue({
        code: "custom",
        message: `carrier ${s.carrier} is not a player`,
        path: ["scenes", i, "carrier"],
      });
    }

    // The ball is derived while carried, and explicit while loose. Exactly one.
    const hasBallPos = s.ballPos !== undefined;
    if ((s.carrier === null) !== hasBallPos) {
      ctx.addIssue({
        code: "custom",
        message:
          s.carrier === null
            ? "a scene with no carrier must give ballPos"
            : "a scene with a carrier must not give ballPos",
        path: ["scenes", i, "ballPos"],
      });
    }
  });

  doc.links.forEach((l, i) => {
    l.members.forEach((m, j) => {
      if (!playerIds.has(m)) {
        ctx.addIssue({
          code: "custom",
          message: `link member ${m} is not a player`,
          path: ["links", i, "members", j],
        });
      }
    });
  });
});

/** Throws on invalid input. Use `boardDocSchema.safeParse` where a result is wanted. */
export function parseBoardDoc(input: unknown): BoardDoc {
  return boardDocSchema.parse(input) as BoardDoc;
}
