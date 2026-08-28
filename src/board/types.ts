/**
 * BoardDoc is the single source of truth for a tactics board.
 *
 * Every coordinate in this file is in PITCH METRES on a 105 x 68 pitch, origin at
 * the top-left corner. Never pixels. `Viewport` converts at the edges; see
 * docs/architecture.md section 2.
 */

export type Vec2 = { x: number; y: number };

/** Cubic bezier control points. Endpoints come from the two scenes it spans. */
export type PathCurve = { c1: Vec2; c2: Vec2 };

export type Player = {
  id: string;
  /** Shirt number shown on the token. */
  number: number;
  /** Surname or free text, rendered under the token. */
  label: string;
};

export type Team = {
  id: string;
  name: string;
  /** Token fill. */
  color: string;
  /** Number/label colour, chosen for contrast against `color`. */
  textColor: string;
  players: Player[];
  /** Hidden teams stay in the document but are not drawn or selectable. */
  hidden?: boolean;
};

export type Scene = {
  id: string;
  name: string;
  /** Travel time INTO this scene. Meaningless on scene 0 — nothing to travel from. */
  transitionMs: number;
  /** Still time at this scene. */
  holdMs: number;
  /** entityId -> position. Every player in both teams must have an entry. */
  positions: Record<string, Vec2>;
  /** entityId -> curve travelled INTO this scene. Absent or null means a straight tween. */
  paths: Record<string, PathCurve | null>;
  /** Player holding the ball, or null when the ball is free. */
  carrier: string | null;
  /** Ball position. Present exactly when `carrier` is null. */
  ballPos?: Vec2;
  /** Curve the ball travels along into this scene. */
  ballPath?: PathCurve | null;
  /**
   * Per-entity travel time into this scene, in milliseconds, overriding
   * `transitionMs`. Lets one player cover their run faster or slower than the
   * rest of the scene. The scene lasts as long as its slowest mover.
   */
  travel?: Record<string, number>;
};

export type LinkStyle = "chain" | "polygon" | "filled";

export type Link = {
  id: string;
  /** "Back 4", "Midfield 3". */
  name: string;
  /** Ordered — order defines the chain sequence and the polygon perimeter. */
  members: string[];
  style: LinkStyle;
  color: string;
  showDistances: boolean;
  /** Hidden links stay in the document but are not drawn. */
  hidden?: boolean;
};

export type BoardDoc = {
  version: 1;
  name: string;
  pitch: { length: number; width: number };
  teams: [Team, Team];
  /** At least one. */
  scenes: Scene[];
  links: Link[];
};

/** Which part of the pitch is on screen. */
export type PitchHalf = "full" | "left" | "right";

/** How the board is framed. Presentation only — it never touches the document. */
export type PitchView = {
  half: PitchHalf;
  /** Quarter turn, so the pitch runs top-to-bottom with +x attacking upwards. */
  rotated: boolean;
};

export const DEFAULT_PITCH_VIEW: PitchView = { half: "full", rotated: false };

/**
 * Pitch metres -> screen pixels. `scale` is CSS pixels per metre.
 *
 * Both framings are plain affine maps, so one flag covers rotation:
 *   upright:  screen = (ox + x*s,  oy + y*s)
 *   rotated:  screen = (ox + y*s,  oy - x*s)
 * The half-pitch crop is folded into the offsets, so nothing else needs to know
 * about it.
 *
 * devicePixelRatio lives in the canvas transform, NEVER here — see the DPR trap
 * in AGENTS.md.
 */
export type Viewport = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotated: boolean;
};

/**
 * Everything drawBoard needs beyond the document and the time.
 *
 * Selection and hover are passed in explicitly rather than read from React, which
 * is what keeps the renderer pure and usable from the export worker.
 */
export type RenderView = Viewport & {
  /** Canvas size in CSS pixels. drawBoard paints the full surround itself so a
   *  single call yields a complete frame — the export worker depends on that. */
  width: number;
  height: number;
  /** False during export: suppresses handles, marquee and hover chrome. */
  interactive: boolean;
  selection?: ReadonlySet<string>;
  hover?: string | null;
  /** Editor only: draw and handle-edit the run into this scene, wherever the
   *  scrubber currently sits. Ignored on export. */
  editScene?: number;
  /** Marquee rectangle in pitch metres, while dragging one. */
  marquee?: { a: Vec2; b: Vec2 } | null;
};

/** The ball is addressed by this id wherever an entity id is expected. */
export const BALL_ID = "ball";
