/**
 * The landing page's hero: a move written for showing live links, not for starting from.
 *
 * The templates keep no links (a formation's shape pulled apart by a move is noise), and the
 * one that did get links back here dragged two midfielders across the pitch, which stretched
 * a "Midfield 4" into a diagonal nobody would draw. This is the move links are for instead: a
 * 4-4-2 block sliding across as a unit while the attack works the ball down the flank, so the
 * two lines bend and compress but never stop being lines.
 *
 * Football metres, home attacking +x. Only the away block's two lines are linked.
 */

import type { BoardDoc, PathCurve, Scene, Vec2 } from "@/board/types";
import { pruneBallFlags } from "@/board/scenes";
import { createBoardDoc, sidesFor } from "@/formations";

type Step = {
  moves: Record<string, [number, number]>;
  ball: string | Vec2;
  curves?: Record<string, PathCurve>;
  loft?: boolean;
  shot?: boolean;
};

const STEPS: Step[] = [
  // Settled possession in their half; the block sits compact and central.
  {
    moves: {
      "home-1": [22, 34], "home-2": [52, 8], "home-5": [40, 24], "home-6": [40, 44], "home-3": [52, 60],
      "home-4": [58, 22], "home-8": [52, 34], "home-10": [60, 48],
      "home-7": [72, 10], "home-9": [76, 34], "home-11": [72, 58],
      "away-3": [89, 15], "away-6": [89, 28], "away-5": [89, 40], "away-2": [89, 53],
      "away-11": [78, 16], "away-7": [78, 28], "away-8": [78, 40], "away-4": [78, 52],
      "away-10": [66, 26], "away-9": [66, 40],
    },
    ball: "home-8",
  },
  // Ball out to the right; the whole block slides with it.
  {
    moves: {
      "home-4": [62, 19], "home-2": [60, 6], "home-8": [56, 30],
      "away-3": [88, 11], "away-6": [88, 22], "away-5": [89, 34], "away-2": [89, 46],
      "away-11": [76, 12], "away-7": [75, 22], "away-8": [76, 33], "away-4": [77, 44],
      "away-10": [66, 20], "away-9": [65, 32],
    },
    ball: "home-4",
  },
  // The full-back overlaps; their full-back steps out, and the line behind him covers across.
  {
    moves: {
      "home-2": [80, 5], "home-7": [82, 17], "home-9": [86, 30], "home-11": [82, 46], "home-4": [66, 16],
      "away-3": [84, 7], "away-6": [90, 18], "away-5": [91, 29], "away-2": [90, 41],
      "away-11": [79, 10], "away-7": [78, 20], "away-8": [78, 31], "away-4": [79, 42],
      "away-10": [70, 18], "away-9": [68, 30],
    },
    ball: "home-2",
    curves: { "home-11": { c1: { x: 78, y: 58 }, c2: { x: 80, y: 51 } } },
  },
  // Crossed in; the back four drop towards their goal as it flies.
  {
    moves: {
      "home-9": [95, 31], "home-11": [92, 43], "home-7": [88, 20],
      "away-3": [88, 8], "away-6": [96, 24], "away-5": [97, 33], "away-2": [95, 42],
      "away-11": [84, 12], "away-7": [85, 24], "away-8": [86, 34], "away-4": [85, 44],
    },
    ball: "home-9",
    loft: true,
  },
  // Headed at goal.
  { moves: { "away-1": [101, 31] }, ball: { x: 104.6, y: 30 }, shot: true },
];

export function heroBoard(labels: { board: string; scene: (n: number) => string }): BoardDoc {
  const base = createBoardDoc(...sidesFor("football"), undefined, { board: labels.board, scene: labels.scene(1) });
  let positions = { ...base.scenes[0].positions };

  const scenes: Scene[] = STEPS.map((step, i) => {
    const moves = Object.fromEntries(Object.entries(step.moves).map(([id, [x, y]]) => [id, { x, y }]));
    positions = { ...positions, ...moves };
    const scene: Scene = {
      id: `scene-${i + 1}`,
      name: labels.scene(i + 1),
      transitionMs: i === 0 ? 0 : 1300,
      holdMs: 450,
      positions: structuredClone(positions),
      paths: { ...step.curves },
      carrier: typeof step.ball === "string" ? step.ball : null,
    };
    if (typeof step.ball !== "string") scene.ballPos = step.ball;
    if (step.loft) scene.loft = true;
    if (step.shot) scene.shot = true;
    return scene;
  });

  const links = base.links.filter((l) => l.id === "away-back-4" || l.id === "away-midfield-4");
  return pruneBallFlags({ ...base, scenes, links });
}
