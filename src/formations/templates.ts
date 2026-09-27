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

import type { BoardDoc, RunStyle, Scene, Sport, Vec2 } from "@/board/types";
import { pruneBallFlags } from "@/board/scenes";
import { SPORTS } from "@/board/sports";
import { createBoardDoc, sidesFor, type LineNamer, type TeamSpec } from "./index";

/** Football's templates: what the tour is built from, and what every board had before sports. */
export const TEMPLATE_IDS = [
  "buildUp",
  "counter",
  "corner",
  "press",
  "kickOff",
  "freeKick",
  "throwIn",
] as const;

/** Each sport's own, in the order its menu offers them. Ids are unique across sports. */
export const SPORT_TEMPLATES = {
  football: TEMPLATE_IDS,
  futsal: ["futsalRotation", "futsalFlyKeeper", "futsalCorner"],
  basketball: ["pickAndRoll", "fastBreak", "baselineInbound"],
  handball: ["handballFastBreak", "crossing", "sevenOnSix"],
  hockey: ["penaltyCorner", "hockeyBuildUp", "hockeyPress"],
  volleyball: ["serveReceive", "freeBall", "baseDefence"],
} as const satisfies Record<Sport, readonly string[]>;

export type TemplateId = (typeof SPORT_TEMPLATES)[Sport][number];

/** The sport a template is for. */
export function sportOfTemplate(id: TemplateId): Sport {
  const sports = Object.keys(SPORT_TEMPLATES) as Sport[];
  return sports.find((sport) => (SPORT_TEMPLATES[sport] as readonly string[]).includes(id)) ?? "football";
}

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

/**
 * Every template's scenes, positions in METRES on the board as its rulebook measures it —
 * converted to board units when it is built (D113). A football pitch is metres already.
 * Home attacks towards +x, the right-hand goal, in every sport.
 */
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

  // Tapped back from the spot, switched long to the right wing, crossed and headed in.
  kickOff: [
    { moves: { "home-9": { x: 52.5, y: 34 }, "home-10": { x: 50, y: 40 } }, ball: "home-9" },
    {
      moves: { "home-8": { x: 44, y: 34 }, "home-7": { x: 58, y: 8 }, "home-11": { x: 58, y: 60 }, "home-9": { x: 58, y: 30 } },
      ball: "home-8",
      runOn: ["home-7", "home-11"],
    },
    { moves: { "home-7": { x: 72, y: 6 }, "home-11": { x: 72, y: 60 }, "home-9": { x: 70, y: 30 } }, ball: "home-7", loft: true },
    {
      moves: { "home-7": { x: 84, y: 7 }, "home-9": { x: 94, y: 33 }, "away-3": { x: 86, y: 12 }, "away-6": { x: 95, y: 30 } },
      ball: "home-9",
      loft: true,
    },
    { ball: { x: 104.6, y: 33 }, shot: true },
  ],
  // Just outside the box: a four-man wall 9.15 m off the ball, a dummy run over it, and
  // the shot curled round to the keeper's left.
  freeKick: [
    {
      moves: {
        "home-10": { x: 80.5, y: 41 },
        "home-7": { x: 80.8, y: 38.6 },
        "home-9": { x: 93, y: 31 },
        "home-11": { x: 92, y: 45 },
        "home-5": { x: 90, y: 27 },
        "home-8": { x: 78, y: 30 },
        "away-1": { x: 104, y: 32.5 },
        "away-7": { x: 90.4, y: 36 },
        "away-8": { x: 90.7, y: 37.1 },
        "away-10": { x: 91, y: 38.3 },
        "away-9": { x: 91.3, y: 39.4 },
        "away-5": { x: 97, y: 40 },
        "away-6": { x: 97, y: 33 },
        "away-2": { x: 95, y: 46 },
        "away-3": { x: 96, y: 27 },
        "away-11": { x: 86, y: 29 },
        "away-4": { x: 88, y: 47 },
      },
      ball: "home-10",
    },
    { moves: { "home-7": { x: 84.5, y: 37.5 } }, ball: "home-10" },
    { ball: { x: 104.6, y: 31.4 }, shot: true },
  ],
  // A throw to the winger checking back, laid inside, and the full-back away down the line.
  throwIn: [
    {
      moves: {
        "home-2": { x: 62, y: 0.4 },
        "home-7": { x: 68, y: 8 },
        "home-4": { x: 57, y: 9 },
        "home-8": { x: 63, y: 16 },
        "away-11": { x: 67, y: 10 },
        "away-7": { x: 61, y: 13 },
        "away-3": { x: 76, y: 9 },
      },
      ball: "home-2",
    },
    { moves: { "home-7": { x: 63.5, y: 4.5 }, "away-11": { x: 65, y: 6.5 } }, ball: "home-7" },
    { moves: { "home-2": { x: 70, y: 2 }, "home-4": { x: 58, y: 8 } }, ball: "home-4", runOn: ["home-2"] },
    { moves: { "home-2": { x: 80, y: 3.5 }, "away-3": { x: 78, y: 7 } }, ball: "home-2" },
  ],

  // --- futsal: a 40 x 20 m court, the goal home attacks between y 8.5 and 11.5 at x 40 ---
  // Against a 2-2, the fixo plays it wide and follows his pass; the pivot sets it back for
  // him arriving, and a winger drops to cover the space he left.
  futsalRotation: [
    {
      moves: {
        "home-2": { x: 15, y: 10 },
        "home-3": { x: 19, y: 2.5 },
        "home-4": { x: 19, y: 17.5 },
        "home-5": { x: 32, y: 10 },
        "away-4": { x: 24, y: 13 },
        "away-5": { x: 24, y: 7 },
        "away-2": { x: 30, y: 13 },
        "away-3": { x: 30, y: 7 },
      },
      ball: "home-2",
    },
    { moves: { "home-2": { x: 22, y: 6 }, "home-4": { x: 16, y: 12 } }, ball: "home-3", runOn: ["home-2"] },
    { moves: { "home-2": { x: 29, y: 4 }, "home-5": { x: 31, y: 9 }, "away-3": { x: 29.5, y: 6 } }, ball: "home-5" },
    { moves: { "home-2": { x: 33, y: 5 }, "home-3": { x: 22, y: 5 } }, ball: "home-2" },
    { ball: { x: 40.5, y: 9.2 }, shot: true },
  ],
  // The keeper comes out as a fifth court player; the ball goes round the box until the far
  // pivot is free at the post.
  futsalFlyKeeper: [
    {
      moves: {
        "home-1": { x: 19, y: 10 },
        "home-3": { x: 23, y: 3 },
        "home-4": { x: 23, y: 17 },
        "home-2": { x: 32, y: 7 },
        "home-5": { x: 32, y: 13 },
        "away-4": { x: 26, y: 13 },
        "away-5": { x: 26, y: 7 },
        "away-2": { x: 34.5, y: 12.5 },
        "away-3": { x: 34.5, y: 7.5 },
      },
      ball: "home-1",
    },
    { moves: { "away-5": { x: 26, y: 5 }, "away-4": { x: 25, y: 9 } }, ball: "home-3" },
    { moves: { "home-2": { x: 31, y: 5 }, "away-3": { x: 33.5, y: 6 } }, ball: "home-2" },
    { moves: { "home-5": { x: 35.5, y: 12.5 }, "away-2": { x: 37, y: 11.5 } }, ball: "home-5" },
    { ball: { x: 40.5, y: 10.5 }, shot: true },
  ],
  // From the right-hand corner, played back to the fixo arriving at the edge of the area
  // while the pivot screens, and struck low.
  futsalCorner: [
    {
      moves: {
        "home-3": { x: 39.8, y: 0.3 },
        "home-2": { x: 28, y: 9 },
        "home-4": { x: 33, y: 6 },
        "home-5": { x: 34, y: 12 },
        "away-1": { x: 39.2, y: 10 },
        "away-2": { x: 36, y: 12.5 },
        "away-3": { x: 36, y: 7 },
        "away-4": { x: 33, y: 9.5 },
        "away-5": { x: 35.5, y: 4 },
      },
      ball: "home-3",
    },
    { moves: { "home-2": { x: 31, y: 8 }, "home-5": { x: 35, y: 11 } }, ball: "home-2" },
    { ball: { x: 40.5, y: 9.3 }, shot: true },
  ],

  // --- basketball: a 28 x 15 m court, the ring home attacks at (26.4, 7.5) ---
  // The point guard comes off a high screen and finds the centre rolling to the rim.
  pickAndRoll: [
    {
      moves: {
        "home-1": { x: 19, y: 7.5 },
        "home-5": { x: 21.8, y: 10 },
        "home-2": { x: 22.5, y: 1.5 },
        "home-3": { x: 22.5, y: 13.5 },
        "home-4": { x: 25.5, y: 12.5 },
        "away-1": { x: 20.2, y: 7.8 },
        "away-5": { x: 23, y: 9.8 },
        "away-2": { x: 23.3, y: 2.5 },
        "away-3": { x: 23.3, y: 12.5 },
        "away-4": { x: 25.6, y: 11 },
      },
      ball: "home-1",
    },
    { moves: { "home-5": { x: 20.3, y: 8.8 } }, ball: "home-1" },
    {
      moves: { "home-1": { x: 22.5, y: 5.5 }, "away-1": { x: 20.8, y: 8.6 }, "home-5": { x: 24.5, y: 8.5 }, "away-5": { x: 22.4, y: 6.4 } },
      ball: "home-1",
    },
    { moves: { "home-5": { x: 25.3, y: 7.8 } }, ball: "home-5" },
    { ball: { x: 26.4, y: 7.5 }, shot: true },
  ],
  // A defensive rebound, the outlet, and the lane filled at speed.
  fastBreak: [
    {
      moves: {
        "home-5": { x: 4.5, y: 7 },
        "home-1": { x: 6.5, y: 3 },
        "home-2": { x: 6, y: 12.5 },
        "home-3": { x: 5, y: 10.5 },
        "home-4": { x: 3, y: 4.5 },
        "away-1": { x: 8, y: 7.5 },
        "away-2": { x: 7, y: 2.5 },
        "away-3": { x: 6.5, y: 12 },
        "away-4": { x: 3.5, y: 9.5 },
        "away-5": { x: 2.2, y: 6 },
      },
      ball: "home-5",
    },
    { moves: { "home-1": { x: 9, y: 2.5 }, "home-2": { x: 13, y: 12.5 }, "home-3": { x: 12, y: 7.5 } }, ball: "home-1", runOn: ["home-2"] },
    {
      moves: { "home-1": { x: 18, y: 5 }, "home-2": { x: 21.5, y: 12 }, "home-3": { x: 19.5, y: 8.5 }, "away-1": { x: 15, y: 6 } },
      ball: "home-1",
    },
    { moves: { "home-2": { x: 24, y: 11 } }, ball: "home-2" },
    { ball: { x: 26.4, y: 7.5 }, shot: true },
  ],
  // A box set from under the basket: a down screen, and the inbound to the slip.
  baselineInbound: [
    {
      moves: {
        "home-1": { x: 27.9, y: 5 },
        "home-2": { x: 25, y: 5.2 },
        "home-3": { x: 25, y: 9.8 },
        "home-4": { x: 22.3, y: 5.2 },
        "home-5": { x: 22.3, y: 9.8 },
      },
      ball: "home-1",
    },
    { moves: { "home-4": { x: 24.5, y: 6 }, "home-2": { x: 21.5, y: 3 } }, ball: "home-1" },
    { moves: { "home-5": { x: 25.8, y: 8.5 } }, ball: "home-5" },
    { ball: { x: 26.4, y: 7.5 }, shot: true },
  ],

  // --- handball: a 40 x 20 m court, the goal home attacks on x = 40 ---
  // The keeper's throw finds a wing already away, and the wing finishes.
  handballFastBreak: [
    {
      moves: {
        "away-2": { x: 8, y: 2.5 },
        "away-3": { x: 9.5, y: 6 },
        "away-4": { x: 9, y: 10 },
        "away-5": { x: 9.5, y: 14 },
        "away-6": { x: 8, y: 17.5 },
        "away-7": { x: 6.5, y: 3 },
      },
      ball: "home-1",
    },
    { moves: { "home-2": { x: 18, y: 2.5 }, "home-7": { x: 20, y: 17.5 } }, ball: "home-1", runOn: ["home-7"] },
    { moves: { "home-7": { x: 30, y: 17 }, "home-2": { x: 29, y: 3 } }, ball: "home-7" },
    { moves: { "home-7": { x: 33.5, y: 14 }, "away-1": { x: 39, y: 11.5 } }, ball: "home-7" },
    { ball: { x: 40.5, y: 9 }, shot: true },
  ],
  // The centre back crosses with the right back, who draws the defender and feeds the pivot.
  crossing: [
    {
      moves: {
        "home-3": { x: 28, y: 5 },
        "home-4": { x: 27, y: 10 },
        "home-6": { x: 28, y: 15 },
        "home-2": { x: 37.5, y: 1.5 },
        "home-7": { x: 37.5, y: 18.5 },
        "home-5": { x: 33.5, y: 10.5 },
        "away-7": { x: 38, y: 2.5 },
        "away-6": { x: 34.5, y: 5.2 },
        "away-4": { x: 33.3, y: 8.5 },
        "away-5": { x: 33.3, y: 11.5 },
        "away-3": { x: 34.5, y: 14.8 },
        "away-2": { x: 38, y: 17.5 },
      },
      ball: "home-4",
    },
    { moves: { "home-4": { x: 29, y: 12.5 }, "home-6": { x: 28.5, y: 9 } }, ball: "home-6" },
    { moves: { "home-6": { x: 31.5, y: 8 }, "away-4": { x: 32.5, y: 8.2 }, "home-5": { x: 34, y: 9.5 } }, ball: "home-5" },
    { ball: { x: 40.5, y: 10.8 }, shot: true },
  ],
  // The keeper comes off for a seventh court player, a second pivot, against a flat six.
  sevenOnSix: [
    {
      moves: {
        "home-3": { x: 27.5, y: 4.5 },
        "home-4": { x: 26.5, y: 10 },
        "home-6": { x: 27.5, y: 15.5 },
        "home-2": { x: 37.5, y: 1.5 },
        "home-7": { x: 37.5, y: 18.5 },
        "home-5": { x: 33.8, y: 8.5 },
        "home-1": { x: 33.8, y: 12 },
        "away-7": { x: 38, y: 2.5 },
        "away-6": { x: 34.5, y: 5.2 },
        "away-4": { x: 33.3, y: 8.5 },
        "away-5": { x: 33.3, y: 11.5 },
        "away-3": { x: 34.5, y: 14.8 },
        "away-2": { x: 38, y: 17.5 },
      },
      ball: "home-4",
    },
    { moves: { "home-6": { x: 28.5, y: 14.5 } }, ball: "home-6" },
    { moves: { "home-1": { x: 34.2, y: 12.5 }, "away-5": { x: 33.4, y: 10.5 } }, ball: "home-1" },
    { ball: { x: 40.5, y: 11.2 }, shot: true },
  ],

  // --- field hockey: a 91.4 x 55 m pitch, the goal home attacks on x = 91.4 ---
  // Injected from the back line, stopped at the top of the circle, and struck.
  penaltyCorner: [
    {
      moves: {
        "home-7": { x: 91.4, y: 15.7 },
        "home-9": { x: 77, y: 27 },
        "home-10": { x: 76.5, y: 28.5 },
        "home-8": { x: 77.5, y: 22 },
        "home-11": { x: 77.5, y: 33 },
        "home-6": { x: 75.5, y: 18 },
        "away-1": { x: 91, y: 27.5 },
        "away-2": { x: 91.2, y: 23.5 },
        "away-5": { x: 91.2, y: 25.2 },
        "away-6": { x: 91.2, y: 29.8 },
        "away-4": { x: 91.2, y: 31.5 },
        "away-3": { x: 43, y: 27.5 },
        "away-8": { x: 43, y: 38 },
        "away-10": { x: 43, y: 17 },
        "away-7": { x: 40, y: 45 },
        "away-9": { x: 40, y: 27.5 },
        "away-11": { x: 40, y: 10 },
      },
      ball: "home-7",
    },
    { moves: { "home-9": { x: 77.3, y: 27 }, "away-2": { x: 84.5, y: 25.5 }, "away-5": { x: 86.5, y: 27.5 } }, ball: "home-9" },
    { moves: { "home-10": { x: 76.8, y: 28.3 } }, ball: "home-10" },
    { ball: { x: 92, y: 26.5 }, shot: true },
  ],
  // The keeper plays out: the centre backs split, a midfielder drops, and the ball goes wide.
  hockeyBuildUp: [
    { moves: { "home-5": { x: 8, y: 18 }, "home-6": { x: 8, y: 37 }, "home-8": { x: 20, y: 27.5 } }, ball: "home-1" },
    { moves: { "home-2": { x: 25, y: 5 } }, ball: "home-5" },
    { moves: { "home-8": { x: 22, y: 25 }, "home-4": { x: 35, y: 12 } }, ball: "home-8" },
    { moves: { "home-2": { x: 33, y: 5 } }, ball: "home-2" },
    { moves: { "home-7": { x: 50, y: 7 } }, ball: "home-7" },
  ],
  // The front three close the keeper's short options and win it back high up.
  hockeyPress: [
    { moves: { "away-5": { x: 84, y: 38 }, "away-6": { x: 84, y: 17 } }, ball: "away-1" },
    { moves: { "home-9": { x: 78, y: 27.5 }, "home-7": { x: 74, y: 14 }, "home-11": { x: 74, y: 41 }, "away-6": { x: 83, y: 16 } }, ball: "away-6" },
    { moves: { "home-7": { x: 81, y: 15 }, "home-9": { x: 80, y: 22 } }, ball: "away-6" },
    { moves: { "home-7": { x: 82, y: 16 } }, ball: "home-7" },
  ],

  // --- volleyball: a 24 x 15 m board, the court's lines 3 m in, the net at x = 12 ---
  // The serve is passed in a W, set to the outside, and spiked.
  serveReceive: [
    {
      moves: {
        "away-1": { x: 22.5, y: 10.5 },
        "home-4": { x: 9, y: 4.5 },
        "home-3": { x: 8.5, y: 7.5 },
        "home-2": { x: 9, y: 10.5 },
        "home-5": { x: 5.5, y: 5.5 },
        "home-6": { x: 5.5, y: 9.5 },
        "home-1": { x: 11.2, y: 9 },
      },
      ball: "away-1",
    },
    { moves: { "home-6": { x: 6, y: 8.5 } }, ball: "home-6", loft: true },
    { moves: { "home-1": { x: 11.3, y: 8.5 } }, ball: "home-1", loft: true },
    { moves: { "home-4": { x: 10.8, y: 4.2 } }, ball: "home-4", loft: true },
    { ball: { x: 18, y: 10.5 }, shot: true },
  ],
  // An easy ball over the net, and a quick attack through the middle.
  freeBall: [
    { ball: "away-3" },
    { moves: { "home-6": { x: 6.5, y: 7.5 } }, ball: "home-6", loft: true },
    { moves: { "home-1": { x: 11.3, y: 8 } }, ball: "home-1", loft: true },
    { moves: { "home-3": { x: 11.3, y: 7.2 } }, ball: "home-3", loft: true },
    { ball: { x: 16.5, y: 5 }, shot: true },
  ],
  // A double block on the opponent's attack, the back court spread round it, and the dig.
  baseDefence: [
    {
      moves: {
        "away-4": { x: 13, y: 11 },
        "home-2": { x: 11.6, y: 10.8 },
        "home-3": { x: 11.6, y: 9.8 },
        "home-4": { x: 9.5, y: 4 },
        "home-1": { x: 7, y: 11 },
        "home-6": { x: 4.5, y: 7.5 },
        "home-5": { x: 6.5, y: 4 },
      },
      ball: "away-4",
    },
    { moves: { "home-1": { x: 7, y: 10.8 } }, ball: "home-1", shot: true },
    { moves: { "home-2": { x: 10.5, y: 8.5 } }, ball: "home-2", loft: true },
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
  labels: { board: string; scene: (n: number) => string; line?: LineNamer },
  home: TeamSpec = sidesFor(sportOfTemplate(id))[0],
  away: TeamSpec = sidesFor(sportOfTemplate(id))[1],
): BoardDoc {
  const sport = sportOfTemplate(id);
  const base = createBoardDoc(
    home,
    away,
    undefined,
    { board: labels.board, scene: labels.scene(1), line: labels.line },
    sport,
  );
  // Metres as written into board units (D113); a football pitch is metres already.
  const unit = 1 / SPORTS[sport].metresPerUnit;
  const at = (p: Vec2): Vec2 => ({ x: p.x * unit, y: p.y * unit });
  const first = base.scenes[0];
  let positions = { ...first.positions };

  const scenes: Scene[] = STEPS[id].map((step, i) => {
    const moves = Object.fromEntries(Object.entries(step.moves ?? {}).map(([k, p]) => [k, at(p)]));
    positions = { ...positions, ...moves };
    const scene: Scene = {
      id: `scene-${i + 1}`,
      name: labels.scene(i + 1),
      transitionMs: i === 0 ? 0 : 1400,
      holdMs: 700,
      positions: structuredClone(positions),
      paths: {},
      carrier: typeof step.ball === "string" ? step.ball : null,
    };
    if (step.ball && typeof step.ball !== "string") scene.ballPos = at(step.ball);
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
