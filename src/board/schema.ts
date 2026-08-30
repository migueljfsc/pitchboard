/**
 * Runtime validation for BoardDoc.
 *
 * Imported by both the app and the Cloudflare Worker, so client and server cannot
 * disagree about what a valid document is. Do not add a second validator.
 */

import { z } from "zod";
import type { BoardDoc } from "./types";
import { BALL_ID } from "./types";
import { TEXT_SCALE_MAX, TEXT_SCALE_MIN, TEXT_WIDTH_MAX, TEXT_WIDTH_MIN } from "./annotations";
import { MAX_FLOW_SPEED, MIN_FLOW_SPEED } from "./timeline";

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
  pattern: z.enum(["solid", "vertical", "horizontal"]).optional(),
  players: z.array(player).max(30),
  hidden: z.boolean().optional(),
  formation: z.string().min(1).max(20).optional(),
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
  travel: z.record(z.string(), z.number().int().min(0).max(60_000)).optional(),
  hiddenRuns: z.array(z.string().min(1)).max(64).optional(),
  speed: z.number().min(MIN_FLOW_SPEED).max(MAX_FLOW_SPEED).optional(),
  shot: z.boolean().optional(),
});

const link = z.object({
  id: z.string().min(1),
  name: z.string().max(60),
  members: z.array(z.string().min(1)).min(2).max(11),
  style: z.enum(["chain", "polygon", "filled"]),
  color: z.string().min(1).optional(),
  showDistances: z.boolean(),
  hidden: z.boolean().optional(),
});

const annotationBase = {
  id: z.string().min(1),
  name: z.string().max(60).optional(),
  /** Scene ids, checked against the real scene list by the refinement below. */
  from: z.string().min(1),
  to: z.string().min(1).nullable(),
  color: z.string().min(1),
  hidden: z.boolean().optional(),
};

const dash = z.enum(["solid", "dashed", "wavy"]);
const curve = pathCurve.nullable().optional();

const annotation = z.discriminatedUnion("kind", [
  z.object({ ...annotationBase, kind: z.literal("arrow"), a: vec2, b: vec2, curve, dash }),
  z.object({ ...annotationBase, kind: z.literal("line"), a: vec2, b: vec2, curve, dash }),
  z.object({ ...annotationBase, kind: z.literal("rect"), a: vec2, b: vec2 }),
  z.object({ ...annotationBase, kind: z.literal("ellipse"), a: vec2, b: vec2 }),
  // Capped: a freehand stroke is simplified on commit, and every point of it
  // ends up in the share URL.
  z.object({ ...annotationBase, kind: z.literal("pen"), points: z.array(vec2).min(2).max(400) }),
  z.object({
    ...annotationBase,
    kind: z.literal("text"),
    at: vec2,
    // Raised from 120 when labels gained a box: a wrapped note is a sentence or two, not a
    // caption. Still bounded, because every character of it ends up in the share URL.
    text: z.string().max(400),
    size: z.number().min(TEXT_SCALE_MIN).max(TEXT_SCALE_MAX).optional(),
    width: z.number().min(TEXT_WIDTH_MIN).max(TEXT_WIDTH_MAX).optional(),
  }),
]);

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
  tokenScale: z.number().min(0.5).max(2.5).optional(),
  flow: z
    .object({
      speed: z.number().min(MIN_FLOW_SPEED).max(MAX_FLOW_SPEED),
      endHoldMs: z.number().int().min(0).max(60_000),
    })
    .optional(),
  teams: z.tuple([team, team]),
  scenes: z.array(scene).min(1).max(60),
  links: z.array(link).max(20),
  annotations: z.array(annotation).max(200).optional(),
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

  const sceneIds = new Set(doc.scenes.map((s) => s.id));
  doc.annotations?.forEach((a, i) => {
    for (const key of ["from", "to"] as const) {
      const id = a[key];
      if (id !== null && !sceneIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: `annotation ${key} references scene ${id}, which does not exist`,
          path: ["annotations", i, key],
        });
      }
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
