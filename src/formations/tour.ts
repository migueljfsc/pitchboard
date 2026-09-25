/**
 * The editor's tour: its cards, and the board it is told on.
 *
 * The board is the counter-attack template with one of everything a card talks
 * about added to it — a curved run with a wait, a link, a highlight, a drawn arrow
 * and zone — so every panel the tour opens has something in it. It is only ever
 * shown, never saved: the editor draws it in place of the board in progress and
 * hands that board back untouched when the tour closes (D101).
 *
 * Each card may name what it points at (a `data-tour` attribute) and how the editor
 * should be set up while it shows: which panel is open, which scene, who is
 * selected, whether it plays. The ids here are the board's own, so the two are kept
 * in one file.
 */

import type { Annotation, BoardDoc, Link } from "@/board/types";
import { AWAY, HOME, createBoardDoc, type TeamSpec } from "./index";
import { buildTemplate } from "./templates";

/** The editor panel a card opens; every other one is folded while it shows. */
export type TourPanel = "formations" | "selection" | "links" | "view" | "draw";

export type TourStage = {
  panel?: TourPanel;
  /** Scene index to settle on. Ignored when `play` is set, which starts from the top. */
  scene?: number;
  select?: readonly string[];
  play?: boolean;
  /** Expand this link's row in the Links panel. */
  link?: string;
  /** Select this drawing. */
  annotation?: string;
};

export const TOUR_LINK = "tour-back-four";
export const TOUR_ARROW = "tour-arrow";
export const TOUR_ZONE = "tour-zone";

/** The winger whose run into scene 3 bends, waits, and goes sharply. */
const RUNNER = "home-7";
/** The striker who receives in scene 3, and is highlighted there. */
const STRIKER = "home-9";

export const TOUR_STEPS = [
  { id: "welcome", stage: { play: true } },
  { id: "formations", anchor: "formations", stage: { panel: "formations" } },
  { id: "move", anchor: "board", stage: { panel: "selection", select: ["home-8"] } },
  { id: "scenes", anchor: "timeline", stage: { play: true } },
  { id: "runs", anchor: "selection", stage: { panel: "selection", scene: 2, select: [RUNNER] } },
  { id: "ball", anchor: "board", stage: { scene: 2 } },
  { id: "links", anchor: "links", stage: { panel: "links", link: TOUR_LINK } },
  { id: "draw", anchor: "draw", stage: { panel: "draw", scene: 2, annotation: TOUR_ARROW } },
  { id: "highlight", anchor: "selection", stage: { panel: "selection", scene: 2, select: [STRIKER] } },
  { id: "view", anchor: "view", stage: { panel: "view" } },
  { id: "present", anchor: "present", stage: {} },
  { id: "export", anchor: "export", stage: {} },
  { id: "share", anchor: "share", stage: {} },
  { id: "help", anchor: "tour", stage: {} },
] as const satisfies readonly { id: string; anchor?: string; stage: TourStage }[];

export type TourStepId = (typeof TOUR_STEPS)[number]["id"];

/**
 * The tour's board, named in the caller's language.
 *
 * The link's members are the away side's back line as its formation seeds it, so
 * the board stays right if the default away shape ever changes.
 */
export function buildTourBoard(
  labels: { board: string; scene: (n: number) => string; link: string },
  home: TeamSpec = HOME,
  away: TeamSpec = AWAY,
): BoardDoc {
  const doc = buildTemplate("counter", labels, home, away);
  const [, , third] = doc.scenes;

  const defence = createBoardDoc(home, away).links.find((l) => l.id.startsWith(`${away.id}-`));
  const link: Link = {
    id: TOUR_LINK,
    name: labels.link,
    members: defence ? [...defence.members] : [],
    style: "chain",
    showDistances: false,
  };

  const scenes = doc.scenes.map((scene) =>
    scene.id !== third.id
      ? scene
      : {
          ...scene,
          paths: { ...scene.paths, [RUNNER]: { c1: { x: 68, y: 5 }, c2: { x: 76, y: 6 } } },
          delay: { ...scene.delay, [RUNNER]: 400 },
          run: { ...scene.run, [RUNNER]: { start: "sharp" as const } },
          highlight: { [STRIKER]: home.color },
        },
  );

  const annotations: Annotation[] = [
    {
      id: TOUR_ARROW,
      kind: "arrow",
      from: doc.scenes[1].id,
      to: third.id,
      color: "#f8fafc",
      a: { x: 64, y: 54 },
      b: { x: 86, y: 46 },
      dash: "dashed",
    },
    {
      id: TOUR_ZONE,
      kind: "rect",
      from: third.id,
      to: null,
      color: "#38bdf8",
      a: { x: 88.5, y: 24 },
      b: { x: 104, y: 44 },
    },
  ];

  return { ...doc, scenes, links: link.members.length >= 2 ? [link] : [], annotations };
}
