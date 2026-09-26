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

/**
 * Kit pattern drawn over the team colour on every token.
 *
 * Screen-oriented, like the shirt number is: "vertical" means vertical in the
 * frame, whatever the board is doing underneath. Stripes are a way of telling two
 * sides apart, not a picture of a shirt seen from above.
 */
export type TeamPattern = "solid" | "vertical" | "horizontal";

/**
 * The goalkeeper's kit, and which player wears it.
 *
 * A keeper plays in a different shirt from his outfield team-mates, and a board that paints
 * him in theirs loses the one player every coach looks for first. One player per side, by id,
 * so he keeps it wherever he is dragged; the importer names him where the video fielded a
 * keeper, and the coach can name anyone else. Unnamed, the keeper is whoever wears 1 -- which
 * is where every formation puts him -- so a kit chosen for a drawn board lands on the right man.
 */
export type TeamKeeper = {
  player?: string;
  color: string;
  textColor: string;
};

export type Team = {
  id: string;
  name: string;
  /** Token fill. */
  color: string;
  /** Number/label colour, chosen for contrast against `color`. */
  textColor: string;
  /** Absent means solid — every board written before patterns existed. */
  pattern?: TeamPattern;
  players: Player[];
  /** Hidden teams stay in the document but are not drawn or selectable. */
  hidden?: boolean;
  /**
   * Preset the side was built from, e.g. "4-3-3".
   *
   * On the document rather than in editor state so a board that arrives by
   * import or share still knows its own shape — which is what lets positions be
   * reset without also resetting names, links and scenes.
   */
  formation?: string;
  /** Absent means the keeper wears the team's kit, as every board did before this existed. */
  keeper?: TeamKeeper;
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
  /**
   * Per-entity wait before setting off into this scene, in milliseconds.
   *
   * What lets one scene hold a sequence — the winger goes, then the full-back
   * overlaps — instead of two scenes that exist only to order them. The scene
   * still stretches to fit its slowest mover, now measured from when each of
   * them actually starts. Ignored in flow mode, exactly as `travel` is.
   */
  delay?: Record<string, number>;
  /**
   * Entities whose run into this scene is drawn with no arrow. They still
   * travel — this hides the indicator, not the movement. `BALL_ID` suppresses
   * the pass line.
   */
  hiddenRuns?: string[];
  /**
   * Players nobody SAW at this scene, drawn faded.
   *
   * A board imported from video holds every player in every scene, and a player the tracker
   * had not found yet -- or had lost -- stands where he was first or last seen. Drawn solid he
   * reads as a man standing still in the play, which a coach reported as exactly that: two
   * players *"static, but always visible to the camera"*. Faded, he reads as what he is, a
   * place-holder until he matters (D87).
   *
   * Written by the importer from the tracks behind the board; cleared for a player the moment
   * a coach drags him, because moving a token is saying where he is. Absent means everyone was
   * seen, which is every board drawn by hand.
   */
  unseen?: string[];
  /**
   * Pace for the travel INTO this scene, in metres per second, overriding
   * `flow.speed`. Flow mode only, and meaningless on scene 0 — nothing travels
   * into it. Absent means the board's pace, so a document written before
   * per-scene pacing reads exactly as it did.
   */
  speed?: number;
  /**
   * The ball's travel into this scene is a strike at goal rather than a pass.
   * Presentation of the same carrier change, drawn with the double line the
   * coaching convention uses.
   */
  shot?: boolean;
  /**
   * The ball's travel into this scene leaves the ground — a cross, a chip, a
   * clipped diagonal. Like `shot`, it describes the travel and not the scene, so
   * it means nothing where the ball does not fly (D45).
   */
  loft?: boolean;
  /**
   * Entities glowing in this scene, each with the colour of its halo. The ball
   * may be one, as it may be in `hiddenRuns`.
   *
   * A record rather than a list of ids, because a highlight carries a value where
   * a hidden run does not — the same distinction `travel` and `delay` already make
   * on this type.
   *
   * PER SCENE, AND NEVER CARRIED FORWARD. What a highlight says is "watch these
   * two, here", and that is a claim about one moment: copying it into the scenes
   * after it says something the coach did not (D100). A drag carries because a
   * position is a fact that persists until something changes it; attention is not.
   */
  highlight?: Record<string, string>;
  /**
   * How dark the rest of the board goes around this scene's highlights, 0..1. Absent is
   * `DEFAULT_SPOTLIGHT`, which is every scene written before the choice existed. Means
   * nothing on a scene with no highlight, and like one it is never carried forward.
   */
  spotlight?: number;
  /**
   * How each entity's run into this scene starts and finishes, where it is not the default.
   *
   * Absent is a gradual start and a gradual stop — the ease every run had before the choice
   * existed — so a document written before it reads exactly as it did. `end: "through"` is a
   * player who does not stop here: he passes his mark at pace and runs straight on into the
   * next scene, skipping this scene's hold while everyone else keeps it. Ignored in flow mode,
   * where every run is already continuous, exactly as `travel` and `delay` are.
   */
  run?: Record<string, RunStyle>;
  /**
   * Where the camera looks in this scene: a point on the pitch, in metres, and how far
   * in. Absent is the whole board, which is what every scene was before the choice
   * existed. Playback, Present, exports and shared links follow it, moving smoothly
   * between scenes; the editor keeps its own working zoom and shows this on request.
   */
  camera?: SceneCamera;
};

/** A scene's camera: the point on the pitch it centres on, and its zoom (1 is the whole board). */
export type SceneCamera = { at: Vec2; zoom: number };

/** How a run sets off: easing up from a standstill, or at full pace from the first step. */
export type RunStart = "gradual" | "sharp";
/** How a run finishes: easing to a stop, stopping dead, or running on into the next scene. */
export type RunEnd = "gradual" | "sharp" | "through";
/** A run's shape. Only what differs from gradual is stored. */
export type RunStyle = { start?: Exclude<RunStart, "gradual">; end?: Exclude<RunEnd, "gradual"> };

export type LinkStyle = "chain" | "polygon" | "filled";
/** How a link's edges are stroked. Absent is solid. */
export type LinkLine = "solid" | "dotted";
/** Heads on a link's edges, pointing in member order. Absent is none. */
export type LinkArrows = "none" | "forward" | "both";

export type Link = {
  id: string;
  /** "Back 4", "Midfield 3". */
  name: string;
  /** Ordered — order defines the chain sequence and the polygon perimeter. */
  members: string[];
  style: LinkStyle;
  /**
   * Colour override. Absent means the link follows its members' kit, so
   * recolouring a team recolours its units — see `linkColor`.
   */
  color?: string;
  showDistances: boolean;
  /**
   * Line and heads. Absent is a solid line with no heads, which is what every link
   * was before either existed — so no migration is owed.
   */
  line?: LinkLine;
  arrows?: LinkArrows;
  /**
   * Dashes march along the edges, in member order, as the clock runs. Read off the
   * render time, so it moves in playback and in an export and holds still on a paused
   * board. Meaningless on a solid line.
   */
  animate?: boolean;
  /** Hidden links stay in the document but are not drawn. */
  hidden?: boolean;
  /**
   * Never dimmed: a scene's spotlight cuts round it as it does round a highlight, without
   * the glow. Absent is dimmed with everything else. It does not darken a scene by itself —
   * only a highlight does (D106).
   */
  lit?: boolean;
  /**
   * Scene id this link first appears on. Absent means the first scene.
   *
   * Both ends are optional, unlike an annotation's, which are required — a link
   * written before ranges existed has neither, and neither means "every scene",
   * which is exactly what those links have always done. So no migration is owed
   * and every share link published before this still opens saying what it said.
   * The rule itself is in `range.ts`; see D47.
   */
  from?: string;
  /** Last scene id it appears on. Null or absent runs to the end of the timeline. */
  to?: string | null;
};

/**
 * Annotations — the coach's drawing on top of the tactic.
 *
 * Unlike links they are inert: fixed geometry, no dependence on where anyone is
 * standing. What they do have is a scene range, so a zone can matter during the
 * press and vanish once the ball is won.
 *
 * `dashed` is a pass and `wavy` a dribble, following the convention every
 * coaching diagram uses; `solid` is a plain run or a bare line.
 */
export type AnnotationDash = "solid" | "dashed" | "wavy";

type AnnotationBase = {
  id: string;
  /** What the coach calls it. Absent falls back to the text, then the kind. */
  name?: string;
  /** Scene id this first appears on. */
  from: string;
  /** Last scene id it appears on; null runs to the end of the timeline. */
  to: string | null;
  color: string;
  /** Hidden annotations stay in the document but are not drawn. */
  hidden?: boolean;
  /**
   * Never dimmed, as a link's `lit`. Meaningless on text, which is above the darkness
   * already (D106).
   */
  lit?: boolean;
};

/** Two-point shapes share `a`/`b`, which keeps drag-to-create uniform. */
type Segment = { a: Vec2; b: Vec2 };

/**
 * `via` are corners between `a` and `b`, in order. A path with corners is straight
 * from one to the next and ignores `curve`: bending and cornering are two ways of
 * shaping the same line, and adding the first corner drops the bend. Absent or empty
 * is the single segment every arrow was before corners existed.
 */
type Path = { curve?: PathCurve | null; dash: AnnotationDash; via?: Vec2[] };

export type Annotation =
  | (AnnotationBase & Segment & Path & { kind: "arrow" })
  | (AnnotationBase & Segment & Path & { kind: "line" })
  /**
   * `filled: false` is an outline alone. Absent is filled, which is what every zone
   * was before the choice existed — so old documents keep their look and no
   * migration is owed.
   */
  | (AnnotationBase & Segment & { kind: "rect"; filled?: boolean })
  /** `a` and `b` are the bounding box, not centre and radii. */
  | (AnnotationBase & Segment & { kind: "ellipse"; filled?: boolean })
  | (AnnotationBase & { kind: "pen"; points: Vec2[] })
  /** A closed zone of any number of corners, in perimeter order. `filled` as for a box. */
  | (AnnotationBase & { kind: "polygon"; points: Vec2[]; filled?: boolean })
  /**
   * A ball drawn onto the board: a prop for a drill or a set piece, not the match
   * ball. It never moves on its own and nothing passes it. Drawn at the size of the
   * real one, so it follows `tokenScale`; `color` is carried like every shape's but
   * a ball is always drawn as a ball.
   */
  | (AnnotationBase & { kind: "ball"; at: Vec2 })
  /** `size` multiplies TEXT_SIZE; absent is 1, so a label sized before the
   *  control existed keeps the size it was drawn at. */
  | (AnnotationBase & {
      kind: "text";
      at: Vec2;
      text: string;
      size?: number;
      /**
       * Box width in metres. Absent means the label is one line as long as it needs to be,
       * which is what every label was before boxes existed — so old documents keep their
       * shape and no migration is owed.
       */
      width?: number;
      /**
       * Panel painted behind the words. Absent is no panel at all, which is what every label
       * was before one existed — so old documents keep their look and no migration is owed.
       */
      bg?: string;
      /** Opacity of that panel, 0..1. Absent is the default; meaningless without `bg`. */
      bgOpacity?: number;
      /**
       * How the lines sit inside the box. Absent is centred, which is what every label was
       * before the choice existed — so no migration is owed. The box itself stays centred on
       * `at` whichever way the lines are aligned.
       */
      align?: TextAlign;
    });

export type TextAlign = "left" | "right";

export type AnnotationKind = Annotation["kind"];

/**
 * The grass: a lighter or darker shade of the one green, and how real it looks.
 *
 * A shade rather than a colour, because a coach asking for "a different pitch" wants his
 * stadium's green at night or in the sun, not a purple one -- and a board's tokens, lines and
 * kits were all chosen against green. On the document rather than the view, so an export and a
 * shared board look the way their author left them.
 */
export type Grass = {
  /** -1 darkest to 1 lightest; absent or 0 is the default green. */
  shade?: number;
  /** "stripes" is the plain mow every board has had; "natural" adds the texture of real turf. */
  texture?: "stripes" | "natural";
};

/**
 * What the importer answered for one scene: the video frame it was cut at, who it said had the
 * ball, and where it put everyone, in metres rounded to the centimetre.
 */
export type OriginScene = {
  frame: number;
  carrier: string | null;
  positions: Record<string, [number, number]>;
};

/**
 * What the importer answered for one player: the track he was built from and the frames it
 * spans, the side it put him on, and his shirt number.
 *
 * `track` is the id in the source file, or `id * 1000 + n` for the n-th piece of a track the
 * importer split (`splitImpossible`); `from`/`to` say which piece either way.
 */
export type OriginPlayer = {
  track: number;
  from: number;
  to: number;
  side: "home" | "away";
  number: number;
};

/**
 * Where a board built from video came from, and what the importer said about it (D88).
 *
 * A coach's corrections are the only labels anybody has on his club, his broadcaster and his
 * camera, and without this none of them can be read: nothing else in the document says which
 * token is which track or which scene is which frame. So the importer's own answers are kept,
 * keyed by scene id and player id -- both survive reordering, and a scene or player the coach
 * adds has no entry, which is right: it was never measured. football-tracks' `ft learn` diffs
 * the board against this and keeps what changed.
 *
 * Dropped from share links, which are for showing a play, not for teaching a model.
 */
export type Origin = {
  /** football-tracks' name for the clip, which is where `ft learn` finds its files. */
  clip: string;
  fps: number;
  scenes: Record<string, OriginScene>;
  players: Record<string, OriginPlayer>;
};

export type BoardDoc = {
  version: 1;
  name: string;
  pitch: { length: number; width: number };
  /**
   * Multiplier on token and ball size, default 1. Lives on the document rather
   * than the view because it changes the artefact — an export must reproduce it,
   * and a shared board should arrive looking as its author left it.
   */
  tokenScale?: number;
  /**
   * Seamless playback. Present means the per-scene timings are set aside for one
   * continuous flow: every transition runs at `speed`, nothing holds between
   * scenes, and only the last frame is held — for `endHoldMs`, before the loop.
   *
   * The scenes keep their own `transitionMs`, `holdMs` and `travel` untouched,
   * so turning this off gives back exactly the timing that was tuned.
   */
  flow?: { /** Metres per second. */ speed: number; endHoldMs: number };
  teams: [Team, Team];
  /** At least one. */
  scenes: Scene[];
  links: Link[];
  /** Optional: a board drawn before annotations existed simply has none. */
  annotations?: Annotation[];
  /** Present on a board imported from video, and only there. */
  origin?: Origin;
  /** Absent means the default green, mown in stripes. */
  grass?: Grass;
};

/** Which part of the pitch is on screen. */
export type PitchHalf = "full" | "left" | "right";

/** How the board is framed. Presentation only — it never touches the document. */
export type PitchView = {
  half: PitchHalf;
  /** Quarter turn, so the pitch runs top-to-bottom with +x attacking upwards. */
  rotated: boolean;
  /**
   * The angled camera — see board/projection.ts.
   *
   * Implies `rotated`: the angle exists to put you behind the home goal looking
   * at the away one, and teams[0] defends x=0, which is the bottom of a vertical
   * board. Everything the flat board edits is edited here too (D91).
   */
  tilt?: boolean;
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
  /** Which crop is shown. The renderer clips to it, so a half is a crop rather
   *  than the full pitch merely re-centred. */
  half: PitchHalf;
};

/**
 * Everything drawBoard needs beyond the document and the time.
 *
 * Selection and hover are passed in explicitly rather than read from React, which
 * is what keeps the renderer pure and usable from the export worker.
 */
/** The tool a pointer drag is currently bound to. */
/**
 * What the pointer does on the board. `pan` is the default: players are still picked
 * up and moved, and a drag on empty grass moves the view. `select` makes that drag
 * sweep a selection box instead. Everything else draws a shape.
 */
export type Tool = "pan" | "select" | AnnotationKind;

/** The tool the editor starts with and goes back to — after a shape, and on Esc. */
export const DEFAULT_TOOL: Tool = "pan";

/** Does this tool draw a shape, rather than pick things up or move the view? */
export const isDrawTool = (tool: Tool): tool is AnnotationKind =>
  tool !== "pan" && tool !== "select";

/**
 * Turf textures kept between draws, by whoever draws a board many times: the live canvas, a
 * video export. A memo and not an input -- `drawBoard` paints the same pixels with it or
 * without it, it is only faster the second time (D89). Its values are canvases; declared as
 * `object` so this file needs no DOM types, which the Node scripts compile it without.
 */
export type TurfCache = Map<string, object>;

export type RenderView = Viewport & {
  /** Canvas size in CSS pixels. drawBoard paints the full surround itself so a
   *  single call yields a complete frame — the export worker depends on that. */
  width: number;
  height: number;
  /** False during export: suppresses handles, marquee and hover chrome. */
  interactive: boolean;
  turf?: TurfCache;
  /**
   * Render through the angled camera. The viewport fields are still filled in and
   * still describe the flat board — the tilted path builds its own ground-layer
   * viewport and reads neither the scale nor the offsets.
   */
  tilt?: boolean;
  selection?: ReadonlySet<string>;
  hover?: string | null;
  /** Editor only: draw and handle-edit the run into this scene, wherever the
   *  scrubber currently sits. Ignored on export. */
  editScene?: number;
  /**
   * Editor only: scenes to outline faintly behind the live board, so a position
   * can be placed against where everyone else was or is about to be.
   *
   * Indices rather than a before/after flag — the renderer is told what to draw
   * and never works out which scenes those are. Ignored on export.
   */
  ghosts?: readonly number[];
  /** Marquee rectangle in pitch metres, while dragging one. */
  marquee?: { a: Vec2; b: Vec2 } | null;
  /** Editor only: the annotation whose handles are showing. */
  annotationSelection?: string | null;
  /** Editor only: the shape currently being dragged out, not yet committed. */
  draft?: Annotation | null;
  /** Editor only: the lines a dragged player has snapped to — constant x or y. */
  guides?: readonly ({ x: number } | { y: number })[];
  /**
   * Editor only: the box a dragged drawing covers, in pitch metres. Draws a ruler along two
   * edges of the pitch with the box's span shaded and its centre marked on both, for placing
   * a drawing by the metre. Flat board only.
   */
  ruler?: { x: number; y: number; w: number; h: number } | null;
  /** Editor only: players whose whole path through every scene is drawn faintly. */
  trail?: readonly string[];
  /**
   * Look through the scenes' own cameras (`Scene.camera`). Always on for an export
   * and for a shared board; in the editor, during playback or when previewing.
   */
  sceneCamera?: boolean;

  /**
   * Export only: leave the surround unpainted, so a PNG has the pitch on a
   * transparent background. The frame is no longer complete in one call, which
   * is exactly what was asked for.
   */
  transparent?: boolean;
  /**
   * Export only: a caption in the corner of the frame — a title, and optionally
   * the name of the scene being played into, which changes as the clip runs.
   */
  caption?: { title: string; scene: boolean } | null;
};

/** The ball is addressed by this id wherever an entity id is expected. */
export const BALL_ID = "ball";
