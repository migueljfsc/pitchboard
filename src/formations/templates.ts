/**
 * Small ready-made boards to start from instead of a blank one.
 *
 * Each is the default board — home in a 4-3-3 attacking towards +x, away in a
 * 4-4-2 — with a handful of players moved per scene and the ball given out. Kept
 * as data rather than as saved files so they follow the schema as it changes and
 * are named in whatever language the board is made in.
 *
 * Home ids are `home-N`, away `away-N`, by shirt number, as `buildTeam` mints them.
 */

import type { BoardDoc, RunStyle, Scene, Vec2 } from "@/board/types";
import { pruneBallFlags } from "@/board/scenes";
import { AWAY, HOME, createBoardDoc, type TeamSpec } from "./index";

export const TEMPLATE_IDS = ["buildUp", "counter", "corner", "press"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** One scene of a template: who moves where, and who has the ball. */
type Step = {
  moves?: Record<string, Vec2>;
  /** A player's id, or a place on the pitch for a loose ball. */
  ball?: string | Vec2;
  shot?: boolean;
  loft?: boolean;
  /** Runs that do not stop at this scene (D98). */
  runOn?: string[];
};

const STEPS: Record<TemplateId, Step[]> = {
  // The keeper plays out: centre-backs split, the 8 drops, and the ball goes wide.
  buildUp: [
    { moves: { "home-5": { x: 11, y: 16 }, "home-6": { x: 11, y: 52 }, "home-8": { x: 24, y: 34 } }, ball: "home-1" },
    { moves: { "home-2": { x: 34, y: 6 }, "home-8": { x: 27, y: 28 } }, ball: "home-5" },
    { moves: { "home-7": { x: 44, y: 14 }, "home-4": { x: 38, y: 22 } }, ball: "home-2" },
    { moves: { "home-2": { x: 50, y: 7 }, "home-9": { x: 55, y: 30 } }, ball: "home-7" },
  ],
  // Won in midfield and away in three passes, the striker running on throughout.
  counter: [
    {
      moves: { "home-8": { x: 32, y: 34 }, "away-8": { x: 36, y: 38 }, "away-4": { x: 40, y: 50 } },
      ball: "home-8",
    },
    {
      moves: { "home-10": { x: 52, y: 44 }, "home-9": { x: 62, y: 34 }, "home-7": { x: 62, y: 12 }, "home-11": { x: 62, y: 56 } },
      ball: "home-10",
      runOn: ["home-9"],
    },
    {
      moves: { "home-9": { x: 84, y: 36 }, "home-10": { x: 66, y: 44 }, "home-7": { x: 80, y: 14 } },
      ball: "home-9",
    },
    { ball: { x: 104.6, y: 31 }, shot: true },
  ],
  // An in-swinging corner to the near post, flicked on at goal.
  corner: [
    {
      moves: {
        "home-7": { x: 104.2, y: 1 },
        "home-9": { x: 95, y: 34 },
        "home-5": { x: 94, y: 40 },
        "home-6": { x: 93, y: 28 },
        "home-11": { x: 90, y: 46 },
        "home-10": { x: 86, y: 34 },
        "away-2": { x: 99, y: 42 },
        "away-5": { x: 100, y: 36 },
        "away-6": { x: 100, y: 30 },
        "away-3": { x: 98, y: 24 },
        "away-8": { x: 95, y: 36 },
        "away-4": { x: 94, y: 44 },
        "away-7": { x: 94, y: 28 },
      },
      ball: "home-7",
    },
    { moves: { "home-5": { x: 99.5, y: 29 }, "home-9": { x: 99, y: 37 } }, ball: "home-5", loft: true },
    { ball: { x: 104.6, y: 35.5 }, shot: true },
  ],
  // The away keeper plays short and the front three jump the press.
  press: [
    { moves: { "away-5": { x: 95, y: 46 }, "away-6": { x: 95, y: 22 } }, ball: "away-1" },
    {
      moves: {
        "home-9": { x: 88, y: 28 },
        "home-7": { x: 86, y: 14 },
        "home-11": { x: 86, y: 50 },
        "home-8": { x: 72, y: 34 },
        "home-10": { x: 74, y: 46 },
        "home-4": { x: 70, y: 22 },
      },
      ball: "away-6",
    },
    { moves: { "home-9": { x: 93, y: 23 }, "home-4": { x: 80, y: 18 }, "away-6": { x: 94, y: 20 } }, ball: "away-6" },
  ],
};

/**
 * A template as a board, named in the caller's language.
 *
 * `labels.scene(n)` names the n-th scene, 1-based; the teams keep the specs given,
 * so their names follow the locale the same way a new board's do.
 */
export function buildTemplate(
  id: TemplateId,
  labels: { board: string; scene: (n: number) => string },
  home: TeamSpec = HOME,
  away: TeamSpec = AWAY,
): BoardDoc {
  const base = createBoardDoc(home, away, undefined, { board: labels.board, scene: labels.scene(1) });
  const first = base.scenes[0];
  let positions = { ...first.positions };

  const scenes: Scene[] = STEPS[id].map((step, i) => {
    positions = { ...positions, ...(step.moves ?? {}) };
    const scene: Scene = {
      id: `scene-${i + 1}`,
      name: labels.scene(i + 1),
      transitionMs: i === 0 ? 0 : 1400,
      holdMs: 700,
      positions: structuredClone(positions),
      paths: {},
      carrier: typeof step.ball === "string" ? step.ball : null,
    };
    if (step.ball && typeof step.ball !== "string") scene.ballPos = { ...step.ball };
    if (step.shot) scene.shot = true;
    if (step.loft) scene.loft = true;
    if (step.runOn?.length) {
      scene.run = Object.fromEntries(step.runOn.map((r): [string, RunStyle] => [r, { end: "through" }]));
    }
    return scene;
  });

  // `pruneBallFlags` drops a shot or loft that the travel cannot carry, so a
  // template edited into an impossible one fails quietly rather than invalidly.
  // No links: the ones a formation seeds describe its shape, and a template has
  // pulled that shape apart — a back four chained across a corner is noise.
  return pruneBallFlags({ ...base, scenes, links: [] });
}
