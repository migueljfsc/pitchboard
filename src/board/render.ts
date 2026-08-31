/**
 * drawBoard — the one renderer.
 *
 * PURE. No DOM, no React, no Date.now(), no Math.random(), no module-level mutable
 * state. Given (doc, t, view) it emits the same pixels in any thread. The editor
 * calls it on a visible canvas; the export worker calls it on an OffscreenCanvas at
 * 1920x1080. That is what makes preview/export divergence structurally impossible,
 * so if you need a value in here, put it in BoardDoc or RenderView.
 *
 * Everything inside the transform block is in pitch metres, including line widths
 * and font sizes.
 */

import type {
  Annotation,
  BoardDoc,
  PitchHalf,
  RenderView,
  TeamPattern,
  Vec2,
  Viewport,
} from "./types";
import { BALL_ID } from "./types";
import {
  BALL_RADIUS,
  DEFAULT_THEME,
  PITCH,
  PITCH_PADDING,
  TEAM_NAME_OFFSET,
  TOKEN_RADIUS,
  ballRadius,
  drawPitch,
  tokenRadius,
  tokenScaleOf,
  type Ctx,
  type PitchTheme,
} from "./pitch";
import {
  LOFT_APEX,
  LOFT_GROWTH,
  ballAt,
  ballLift,
  displayCurve,
  frameAt,
  transitionInto,
  type Frame,
  type Resolved,
} from "./timeline";
import { ballCurve, ballTravelBetween, isRunHidden } from "./scenes";
import { linkColor, linkGeometry, type LinkGeometry } from "./links";
import {
  DASH_PATTERN,
  HEAD_LENGTH,
  HEAD_WIDTH,
  MARK_WIDTH,
  TEXT_BG_PAD,
  ZONE_ALPHA,
  annotationHandles,
  boundsOf,
  strokePoints,
  TEXT_LINE_H,
  textBgAlpha,
  textExtent,
  textLines,
  textSize,
  visibleAt,
  wavy,
  type AnnotationHandle,
} from "./annotations";
import {
  buildArcTable,
  clamp,
  fitViewport,
  halfRange,
  cubicAt,
  cubicTangent,
  reparameterise,
  toScreen,
  viewMatrix,
  type Bezier,
} from "./geometry";
import {
  GROUND_SQUASH,
  drawDepthShading,
  projectionFor,
  warpGround,
  type Projected,
  type Projection,
} from "./projection";

export { TOKEN_RADIUS, BALL_RADIUS };
export type { Frame };

/** Steps used to stroke a curved path. Purely cosmetic; the maths is exact. */
const PATH_STEPS = 24;

export function drawBoard(
  ctx: Ctx,
  doc: BoardDoc,
  t: number,
  view: RenderView,
  theme: PitchTheme = DEFAULT_THEME,
): void {
  const frame = frameAt(doc, t);

  ctx.save();

  // Surround first, so one call yields a complete frame.
  ctx.fillStyle = theme.surround;
  ctx.fillRect(0, 0, view.width, view.height);

  // The angled camera is a different composition of the same drawing, so it
  // branches here rather than threading a flag through every call below. It needs
  // an OffscreenCanvas for the ground layer; without one, fall back to the flat
  // board rather than failing to draw a frame at all.
  if (view.tilt && typeof OffscreenCanvas !== "undefined") {
    drawTilted(ctx, doc, frame, view, theme);
    ctx.restore();
    return;
  }

  // Compose with whatever transform the caller set (the editor sets a DPR scale),
  // then work in metres from here down. One matrix covers upright and rotated.
  ctx.transform(...viewMatrix(view));

  clipToHalf(ctx, doc, view.half);

  drawPitch(ctx, doc.pitch, theme);
  drawTeamNames(ctx, doc, view.rotated);

  // Annotations split across the stack. A shaded zone is background — it belongs
  // under the play, or it drowns it. Arrows, freehand and text are the coach
  // talking over the top, and go above everything.
  const marks = annotationsFor(doc, frame, view);
  for (const ann of marks) if (isZone(ann)) drawZone(ctx, ann);

  // Links sit under the tokens so a connector never covers a shirt number.
  drawLinks(ctx, doc, frame, view.rotated);
  drawPaths(ctx, doc, frame, view);

  drawGhosts(ctx, doc, view, view.rotated);

  const scale = tokenScaleOf(doc);

  for (const team of doc.teams) {
    if (team.hidden) continue;
    for (const player of team.players) {
      const p = frame.positions[player.id];
      if (!p) continue;
      drawToken(ctx, p, player.number, player.label, team.color, team.textColor, {
        selected: view.selection?.has(player.id) ?? false,
        hovered: view.interactive && view.hover === player.id,
        rotated: view.rotated,
        scale,
        pattern: team.pattern,
      });
    }
  }

  // No ball until one is given to somebody (D44). A lofted one grows: from above
  // there is nowhere for height to go but into the size of the thing (D45).
  if (frame.ball) {
    const lift = ballLift(frame.resolved, doc);
    drawBall(ctx, frame.ball, ballRadius(doc) * (1 + LOFT_GROWTH * lift), {
      selected: view.selection?.has(BALL_ID) ?? false,
      hovered: view.interactive && view.hover === BALL_ID,
    });
  }

  for (const ann of marks) if (!isZone(ann)) drawMark(ctx, ann, view.rotated);

  if (view.interactive && view.annotationSelection) {
    const selected = marks.find((a) => a.id === view.annotationSelection);
    if (selected) drawAnnotationChrome(ctx, selected, view.rotated);
  }

  if (view.interactive && view.marquee) {
    drawMarquee(ctx, view.marquee.a, view.marquee.b);
  }

  ctx.restore();
}

/**
 * Clip to the crop, so a half view shows half a pitch rather than the whole one
 * nudged sideways. Without this the neighbouring half simply spills into whatever
 * canvas width is left over.
 *
 * Assumes the metre-space transform is already applied.
 */
function clipToHalf(ctx: Ctx, doc: BoardDoc, half: PitchHalf): void {
  if (half === "full") return;

  const [x0, x1] = halfRange(half, doc.pitch.length);
  const pad = PITCH_PADDING;
  ctx.beginPath();
  ctx.rect(half === "left" ? x0 - pad : x0, -pad, x1 - x0 + pad, doc.pitch.width + pad * 2);
  ctx.clip();
}

// ------------------------------------------------------------- the 3D view

/**
 * The same board, through the angled camera — see board/projection.ts.
 *
 * Two passes, because a tilted board is two different kinds of thing:
 *
 *   the GROUND, which lies on the grass and takes the perspective — markings,
 *   zones, links, runs, the coach's arrows. Drawn flat and top-down into a layer
 *   of its own by the ordinary code above, then warped as one image. Nothing in
 *   `drawPitch` or the annotation drawing had to learn about perspective, and the
 *   line widths taper for free because the whole layer is scaled.
 *
 *   the BILLBOARDS, which stand up off it and do not — players, the ball, text.
 *   Projected point by point and drawn upright at a depth-derived size. This is
 *   `upright` one level out: there, text refuses to turn with a rotated board;
 *   here, a token refuses to lie down on a tilted one.
 */
function drawTilted(
  ctx: Ctx,
  doc: BoardDoc,
  frame: Frame,
  view: RenderView,
  theme: PitchTheme,
): void {
  const [x0, x1] = halfRange(view.half, doc.pitch.length);
  const across = doc.pitch.width + PITCH_PADDING * 2;
  const along = x1 - x0 + PITCH_PADDING * 2;

  // The caller's transform carries the device pixel ratio, and the ground layer is
  // a real canvas that has to be allocated in device pixels. Reading it back here
  // is the only way to keep DPR out of RenderView, where it would become a second
  // source of truth for the same number.
  const m = ctx.getTransform();
  const proj = projectionFor(across, along, view.width, view.height, Math.hypot(m.a, m.b) || 1);

  const ground = new OffscreenCanvas(proj.sourceW, proj.sourceH);
  const gctx = ground.getContext("2d");
  if (!gctx) return;

  // The layer is exactly the content rect, so fitViewport seats it corner to
  // corner with no letterbox — the trapezoid IS the board, and the surround
  // already painted underneath shows everywhere the trapezoid is not.
  const groundView = fitViewport(proj.sourceW, proj.sourceH, doc.pitch.length, doc.pitch.width, {
    half: view.half,
    rotated: true,
  });
  gctx.setTransform(...viewMatrix(groundView));
  clipToHalf(gctx, doc, view.half);

  const marks = annotationsFor(doc, frame, view);

  drawPitch(gctx, doc.pitch, theme);
  drawTeamNames(gctx, doc, true, TEAM_NAME_OFFSET_3D);
  for (const ann of marks) if (isZone(ann)) drawZone(gctx, ann);
  drawLinks(gctx, doc, frame, true);
  drawPaths(gctx, doc, frame, view);

  // Arrows and freehand ride the grass here, rather than floating over the players
  // as they do on the flat board. A mark that ignores the perspective reads as a
  // sticker on the lens. Text is the exception, below — squashed type is simply
  // unreadable, and a label is the one annotation nobody imagines painted on turf.
  for (const ann of marks) if (!isZone(ann) && ann.kind !== "text") drawMark(gctx, ann, true);

  warpGround(ctx, ground, proj);
  drawDepthShading(ctx, proj);

  // The crop has to be applied twice. The ground layer took it in metre space like
  // the flat board does, but billboards are drawn straight onto the destination and
  // would otherwise ignore it — leaving the far half's players standing in the
  // surround above a half-pitch view.
  ctx.save();
  clipToProjectedHalf(ctx, doc, view.half, groundView, proj);
  drawGoal(ctx, doc, groundView, proj, -1, theme);
  drawBillboards(ctx, doc, frame, view, proj, groundView, marks);
  drawGoal(ctx, doc, groundView, proj, 1, theme);
  ctx.restore();
}

/**
 * The crop, as the camera sees it.
 *
 * A trapezoid rather than a rectangle, and only four corners are needed to get
 * there: the crop is axis-aligned in metre space, and the projection maps straight
 * lines to straight lines.
 */
function clipToProjectedHalf(
  ctx: Ctx,
  doc: BoardDoc,
  half: PitchHalf,
  groundView: Viewport,
  proj: Projection,
): void {
  if (half === "full") return;

  const [x0, x1] = halfRange(half, doc.pitch.length);
  const pad = PITCH_PADDING;
  const near = half === "left" ? x0 - pad : x0;
  const far = near + (x1 - x0 + pad);

  const corners: Vec2[] = [
    { x: near, y: -pad },
    { x: near, y: doc.pitch.width + pad },
    { x: far, y: doc.pitch.width + pad },
    { x: far, y: -pad },
  ];

  ctx.beginPath();
  corners.forEach((corner, i) => {
    const p = projectPitch(corner, groundView, proj);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.clip();
}

/** Where a pitch position lands on screen once the camera has had it. */
function projectPitch(p: Vec2, groundView: Viewport, proj: Projection, up = 0): Projected {
  const s = toScreen(p, groundView);
  return proj.project(s.x, s.y, up);
}

// ----------------------------------------------------------------- the goals

/** A pitch position with a height above it, in metres. */
type Vec3 = Vec2 & { up: number };

/** Net mesh, in metres. A real net is far finer than anything that reads here. */
const NET_MESH = 0.62;

/**
 * Post and crossbar thickness, in metres. Real ones are 12 cm, but the frame has
 * to carry the shape of the goal against its own netting, so it is drawn heavier.
 */
const FRAME_WIDTH = 0.18;

/** How far the back of the net drops below the crossbar, as a fraction of it. */
const NET_DROP = 0.62;

/**
 * Where a team's name sits behind its goal in the 3D view, in metres.
 *
 * Further out than on the flat board, because the goal now has a height and eats
 * the space. The net's back edge lands about 2.5 m up-screen from the goal line —
 * `goalDepth * cos(TILT)` back, plus the dropped top lifted by `sin(TILT)` — and
 * the flat 4.3 m puts the type straight through it. There is about a metre of room
 * to play with before PITCH_PADDING runs out and the name leaves the grass.
 */
const TEAM_NAME_OFFSET_3D = 5.0;

/**
 * A goal, with height — the only thing on the board that is genuinely 3D.
 *
 * It cannot come from the ground layer, because the ground layer is a picture of
 * the pitch and a goal stands up off it. So the eight corners are projected
 * individually, with `up` in metres, and the panels between them drawn as netting.
 *
 * Depth order is the reason this is a function taking one end at a time rather
 * than a loop drawing both. The far goal is behind every player on the pitch and
 * the near one is in front of all of them — the camera is behind the home goal, so
 * the whole board is seen THROUGH that net. Drawing them at the two extremes of
 * the billboard pass is a complete depth sort, since no player is ever outside the
 * goal lines.
 */
function drawGoal(
  ctx: Ctx,
  doc: BoardDoc,
  groundView: Viewport,
  proj: Projection,
  dir: 1 | -1,
  theme: PitchTheme,
): void {
  const P = PITCH;
  const line = dir === 1 ? 0 : doc.pitch.length;
  const back = line - dir * P.goalDepth;
  const cy = doc.pitch.width / 2;
  const near = cy - P.goalWidth / 2;
  const far = cy + P.goalWidth / 2;
  const high = P.goalHeight;
  const low = P.goalHeight * NET_DROP;

  const at = (p: Vec3): Projected => {
    const s = toScreen(p, groundView);
    return proj.project(s.x, s.y, p.up);
  };
  const v3 = (x: number, y: number, up: number): Vec3 => ({ x, y, up });

  // Netting first, then the frame over the top of it.
  const panels: [Vec3, Vec3, Vec3, Vec3][] = [
    // Back.
    [v3(back, near, 0), v3(back, far, 0), v3(back, far, low), v3(back, near, low)],
    // Sides, which the drop makes trapezoids rather than rectangles.
    [v3(line, near, 0), v3(back, near, 0), v3(back, near, low), v3(line, near, high)],
    [v3(line, far, 0), v3(back, far, 0), v3(back, far, low), v3(line, far, high)],
    // Roof.
    [v3(line, near, high), v3(back, near, low), v3(back, far, low), v3(line, far, high)],
  ];
  for (const panel of panels) drawNetPanel(ctx, at, panel);

  const bar = (a: Vec3, b: Vec3, color: string) => {
    const pa = at(a);
    const pb = at(b);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, (FRAME_WIDTH * (pa.scale + pb.scale)) / 2);
    ctx.lineCap = "round";
    ctx.stroke();
  };

  // The back of the frame is the net's support, not the goal, so it stays quiet.
  const support = "rgba(255,255,255,0.32)";
  bar(v3(back, near, 0), v3(back, near, low), support);
  bar(v3(back, far, 0), v3(back, far, low), support);
  bar(v3(back, near, low), v3(back, far, low), support);
  bar(v3(line, near, high), v3(back, near, low), support);
  bar(v3(line, far, high), v3(back, far, low), support);

  // Posts and crossbar last: they are the part anyone is actually looking at.
  bar(v3(line, near, 0), v3(line, near, high), theme.line);
  bar(v3(line, far, 0), v3(line, far, high), theme.line);
  bar(v3(line, near, high), v3(line, far, high), theme.line);
}

/**
 * One flat panel of netting, as a grid between four corners.
 *
 * The corners run round the panel, so `u` follows the first edge and `v` the
 * second. Every panel here is planar, and the projection maps straight lines to
 * straight lines, so a strand is two projected endpoints rather than a sampled
 * curve — the perspective comes out right for free.
 */
function drawNetPanel(
  ctx: Ctx,
  at: (p: Vec3) => Projected,
  [c00, c10, c11, c01]: [Vec3, Vec3, Vec3, Vec3],
): void {
  const mix = (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    up: a.up + (b.up - a.up) * t,
  });
  const point = (u: number, v: number): Vec3 =>
    mix(mix(c00, c10, u), mix(c01, c11, u), v);

  const span = (a: Vec3, b: Vec3) => Math.hypot(b.x - a.x, b.y - a.y, b.up - a.up);
  const steps = (a: Vec3, b: Vec3, c: Vec3, e: Vec3) =>
    Math.max(2, Math.round((span(a, b) + span(c, e)) / 2 / NET_MESH));
  const cols = steps(c00, c10, c01, c11);
  const rows = steps(c00, c01, c10, c11);

  // A translucent fill under the strands, so the net reads as fabric rather than
  // as a wireframe floating over the grass.
  ctx.beginPath();
  for (const [i, corner] of [c00, c10, c11, c01].entries()) {
    const p = at(corner);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i <= cols; i++) {
    const a = at(point(i / cols, 0));
    const b = at(point(i / cols, 1));
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let j = 0; j <= rows; j++) {
    const a = at(point(0, j / rows));
    const b = at(point(1, j / rows));
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.17)";
  ctx.lineWidth = Math.max(0.5, FRAME_WIDTH * 0.3 * at(point(0.5, 0.5)).scale);
  ctx.stroke();
}

/**
 * Draw in metres, anchored to a projected point and never turned.
 *
 * Inside `draw` one unit is one metre and the axes are the SCREEN's, not the
 * pitch's — so +y is down the frame whatever the board is doing underneath. That
 * is what makes a token a circle rather than the ellipse the ground would give it,
 * and it is why the existing entity drawing can be reused here unchanged.
 */
function billboard(ctx: Ctx, anchor: Vec2, at: Projected, draw: () => void): void {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.scale(at.scale, at.scale);
  ctx.translate(-anchor.x, -anchor.y);
  draw();
  ctx.restore();
}

/**
 * Contact shadow under a billboard.
 *
 * Squashed by cos(TILT), because it is the one part of a token that really does
 * lie on the ground. Without it the players read as floating above the pitch
 * rather than standing on it — which, with a taper this mild, is most of what
 * sells the angle.
 */
function drawGroundShadow(ctx: Ctx, p: Vec2, radius: number): void {
  ctx.save();
  ctx.translate(p.x, p.y + radius * 0.18);
  ctx.scale(1, GROUND_SQUASH);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.12, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.fill();
  ctx.restore();
}

/** Players, the ball and text labels — everything that stands up off the grass. */
function drawBillboards(
  ctx: Ctx,
  doc: BoardDoc,
  frame: Frame,
  view: RenderView,
  proj: Projection,
  groundView: Viewport,
  marks: Annotation[],
): void {
  const scale = tokenScaleOf(doc);

  // Behind everything standing, and unsorted: a ghost is reference, not an object
  // on the pitch competing for depth. A billboard's axes are the screen's, so it
  // is never rotated in here.
  drawGhosts(ctx, doc, view, false, (p, draw) =>
    billboard(ctx, p, projectPitch(p, groundView, proj), draw),
  );

  const standing: { at: Projected; draw: () => void }[] = [];

  for (const team of doc.teams) {
    if (team.hidden) continue;
    for (const player of team.players) {
      const p = frame.positions[player.id];
      if (!p) continue;
      const at = projectPitch(p, groundView, proj);
      standing.push({
        at,
        draw: () =>
          billboard(ctx, p, at, () => {
            drawGroundShadow(ctx, p, TOKEN_RADIUS * scale);
            drawToken(ctx, p, player.number, player.label, team.color, team.textColor, {
              selected: view.selection?.has(player.id) ?? false,
              hovered: view.interactive && view.hover === player.id,
              rotated: false,
              scale,
              pattern: team.pattern,
            });
          }),
      });
    }
  }

  const ball = frame.ball;
  if (ball) {
    const ballR = ballRadius(doc);
    // Here the height is real, so the ball is projected at it and the shadow stays
    // on the grass — the gap between them is what says how high it is. Depth is
    // sorted by where it stands, not by where it has got to in the air.
    const ground = projectPitch(ball, groundView, proj);
    const lift = ballLift(frame.resolved, doc);
    const air = lift > 0 ? projectPitch(ball, groundView, proj, LOFT_APEX * lift) : ground;
    standing.push({
      at: ground,
      draw: () => {
        billboard(ctx, ball, ground, () => drawGroundShadow(ctx, ball, ballR));
        billboard(ctx, ball, air, () =>
          drawBall(ctx, ball, ballR, {
            selected: view.selection?.has(BALL_ID) ?? false,
            hovered: view.interactive && view.hover === BALL_ID,
          }),
        );
      },
    });
  }

  // Nearest last. A billboard standing on the grass has to cover the one behind
  // it, and draw order is the only depth test there is.
  standing.sort((a, b) => a.at.y - b.at.y);
  for (const item of standing) item.draw();

  // Text over the top of the players, as it is on the flat board.
  for (const ann of marks) {
    if (ann.kind !== "text") continue;
    const at = projectPitch(ann.at, groundView, proj);
    billboard(ctx, ann.at, at, () => drawAnnotationText(ctx, ann, false));
  }
}

/**
 * How solid a ghost is. Present enough to place a token against, faint enough
 * that it is never mistaken for one.
 */
const GHOST_ALPHA = 0.4;

/**
 * A player as another scene has them: an outline, never a token.
 *
 * Hollow on purpose. A faded token still reads as a token, and the one thing a
 * ghost must not look like is something you can pick up and drag.
 */
function drawGhost(
  ctx: Ctx,
  p: Vec2,
  number: number,
  color: string,
  rotated: boolean,
  scale: number,
): void {
  const radius = TOKEN_RADIUS * scale;

  ctx.save();
  ctx.globalAlpha = GHOST_ALPHA;

  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.16 * scale;
  ctx.stroke();

  upright(ctx, p, rotated, () => {
    ctx.font = `600 ${1.1 * scale}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(String(number), 0, 0.05 * scale);
  });

  ctx.restore();
}

/**
 * Everyone as one or more other scenes have them, under the live board.
 *
 * Positions are read STRAIGHT FROM THE SCENE, not resolved: a ghost is a scene at
 * rest, so there is nothing to interpolate and no frame worth building. The ball
 * is the exception, because a carried ball has no stored position — a hold at that
 * scene is what `ballAt` wants, and it is two fields.
 *
 * `wrap` is how a ghost reaches the surface. Flat, it draws where it stands; under
 * the angled camera it has to go through `billboard` like every other upright
 * thing, or it lands squashed into the grass.
 */
function drawGhosts(
  ctx: Ctx,
  doc: BoardDoc,
  view: RenderView,
  rotated: boolean,
  wrap: (at: Vec2, draw: () => void) => void = (_, draw) => draw(),
): void {
  if (!view.interactive || !view.ghosts?.length) return;

  const scale = tokenScaleOf(doc);
  const radius = ballRadius(doc);

  for (const index of view.ghosts) {
    const scene = doc.scenes[index];
    if (!scene) continue;

    for (const team of doc.teams) {
      if (team.hidden) continue;
      for (const player of team.players) {
        const p = scene.positions[player.id];
        if (!p) continue;
        wrap(p, () => drawGhost(ctx, p, player.number, team.color, rotated, scale));
      }
    }

    const ball = ballAt({ from: scene, to: scene, u: 1, moving: false, index }, doc);
    if (!ball) continue;
    wrap(ball, () => {
      ctx.save();
      ctx.globalAlpha = GHOST_ALPHA;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = BALL_PATH_COLOR;
      ctx.lineWidth = 0.14;
      ctx.stroke();
      ctx.restore();
    });
  }
}

/**
 * Each team's name in the grass behind the goal it defends.
 *
 * teams[0] defends x=0 and teams[1] defends x=length — the same convention
 * facingOf uses, and how createBoardDoc lays a board out.
 *
 * The name always runs PARALLEL to the goal line — the only orientation that fits
 * the band behind the goal. On a horizontal board the two are mirrored so they
 * face each other across the pitch, like signage at either end of a ground. On a
 * vertical board both stay upright, because mirroring there would leave one of
 * them upside down.
 */
function drawTeamNames(
  ctx: Ctx,
  doc: BoardDoc,
  rotated: boolean,
  offset = TEAM_NAME_OFFSET,
): void {
  doc.teams.forEach((team, i) => {
    const name = team.name.trim();
    if (team.hidden || !name) return;

    const at = {
      x: i === 0 ? -offset : doc.pitch.length + offset,
      y: doc.pitch.width / 2,
    };

    ctx.save();
    ctx.translate(at.x, at.y);
    // Vertical: the outer matrix already turns -90 degrees, so +90 nets to zero
    // and both names sit straight across their goal.
    // Horizontal: a quarter turn each way, mirroring the pair.
    ctx.rotate(rotated ? Math.PI / 2 : i === 0 ? -Math.PI / 2 : Math.PI / 2);

    ctx.font = "700 2.1px Inter, system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 0.5;
    ctx.strokeText(name, 0, 0);
    // Always white: a dark kit colour disappears into the grass here.
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(name, 0, 0);
    ctx.restore();
  });
}

/**
 * Draw text upright regardless of board rotation.
 *
 * The metre-space transform carries a -90 degree turn when the pitch is vertical,
 * which would stand every shirt number on its side. Counter-rotating leaves the
 * local axes aligned with the screen, so `draw` can position relative to the
 * anchor exactly as it would on an upright board.
 */
function upright(ctx: Ctx, at: Vec2, rotated: boolean, draw: () => void): void {
  ctx.save();
  ctx.translate(at.x, at.y);
  if (rotated) ctx.rotate(Math.PI / 2);
  draw();
  ctx.restore();
}

// ---------------------------------------------------------------- links

/** Ids of players on hidden teams. Shared by rendering and hit-testing. */
export function concealedPlayers(doc: BoardDoc): Set<string> {
  const out = new Set<string>();
  for (const team of doc.teams) {
    if (team.hidden) for (const p of team.players) out.add(p.id);
  }
  return out;
}

/**
 * Connectors between grouped players, recomputed from their current interpolated
 * positions so the shape deforms live as the animation runs.
 */
function drawLinks(ctx: Ctx, doc: BoardDoc, frame: Frame, rotated: boolean): void {
  const concealed = concealedPlayers(doc);

  for (const link of doc.links) {
    if (link.hidden) continue;
    // A link whose players are all on a hidden team goes with them.
    if (link.members.every((m) => concealed.has(m))) continue;
    const g = linkGeometry(link, frame.resolved, doc);
    if (!g) continue;
    const color = linkColor(doc, link);

    ctx.beginPath();
    ctx.moveTo(g.points[0].x, g.points[0].y);
    for (let i = 1; i < g.points.length; i++) ctx.lineTo(g.points[i].x, g.points[i].y);
    if (g.closed) ctx.closePath();

    if (link.style === "filled") {
      ctx.fillStyle = withAlpha(color, 0.22);
      ctx.fill();
    }

    // A dark under-stroke first: a blue or black kit colour is nearly invisible
    // against the grass on its own.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.52;
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 0.36;
    ctx.stroke();

    if (link.showDistances) drawDistances(ctx, g, rotated);
  }
}

/** Edge lengths in metres, drawn upright — rotating them with the edge reads badly. */
function drawDistances(ctx: Ctx, g: LinkGeometry, rotated: boolean): void {
  for (const edge of g.edges) {
    upright(ctx, edge.mid, rotated, () => {
      const text = `${edge.metres.toFixed(1)}m`;
      ctx.font = "600 1.05px Inter, system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = 0.5;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, 0, 0);
    });
  }
}

/**
 * Apply alpha to a colour. Handles the #rgb and #rrggbb the palette uses; anything
 * else is passed through, losing the alpha but never throwing.
 */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (!hex.startsWith("#")) return hex;

  const body = hex.slice(1);
  const full = body.length === 3 ? body.split("").map((c) => c + c).join("") : body;
  if (full.length !== 6) return hex;

  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ---------------------------------------------------------- annotations

const isZone = (ann: Annotation): boolean => ann.kind === "rect" || ann.kind === "ellipse";

/**
 * The drawing to paint this frame.
 *
 * Visibility is keyed off the scene being played INTO, not the scene selected in
 * the editor — the two part company during playback, and the animation is what
 * the viewer is watching. A transition into scene i counts as scene i, matching
 * how paths are stored.
 *
 * The draft — the shape currently being dragged out — is appended on top. It is
 * not in the document yet, so it cannot come from `visibleAt`.
 */
function annotationsFor(doc: BoardDoc, frame: Frame, view: RenderView): Annotation[] {
  const list = visibleAt(doc, frame.resolved.index);
  const draft = view.interactive ? view.draft : null;
  if (!draft) return list;
  return [...list.filter((a) => a.id !== draft.id), draft];
}

/** A shaded area of pitch. Translucent enough to read markings through. */
function drawZone(ctx: Ctx, ann: Annotation): void {
  const { x, y, w, h } = boundsOf(ann);
  if (w <= 0 || h <= 0) return;

  ctx.beginPath();
  if (ann.kind === "ellipse") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(x, y, w, h);
  }

  ctx.fillStyle = withAlpha(ann.color, ZONE_ALPHA);
  ctx.fill();
  ctx.lineWidth = MARK_WIDTH * 0.7;
  ctx.strokeStyle = ann.color;
  ctx.stroke();
}

/** Arrows, lines, freehand and text — everything drawn over the play. */
function drawMark(ctx: Ctx, ann: Annotation, rotated: boolean): void {
  if (ann.kind === "text") {
    drawAnnotationText(ctx, ann, rotated);
    return;
  }

  const raw = strokePoints(ann);
  if (raw.length < 2) return;

  const dash = ann.kind === "arrow" || ann.kind === "line" ? ann.dash : "solid";
  const points = dash === "wavy" ? wavy(raw) : raw;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (dash === "dashed") ctx.setLineDash(DASH_PATTERN);

  // Dark under-stroke first, for the same reason links have one: a dark colour
  // is nearly invisible against the grass on its own.
  strokePolyline(ctx, points, "rgba(0,0,0,0.35)", MARK_WIDTH + 0.16);
  strokePolyline(ctx, points, ann.color, MARK_WIDTH);
  ctx.restore();

  if (ann.kind === "arrow") drawHead(ctx, points, ann.color);
}

function strokePolyline(ctx: Ctx, points: Vec2[], color: string, width: number): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * Solid triangle at the tip.
 *
 * Direction comes from the last vertex at least half a head-length back: the
 * final two samples of a curve can be a fraction of a millimetre apart, and
 * normalising that gives a head pointing anywhere at all.
 */
function drawHead(ctx: Ctx, points: Vec2[], color: string): void {
  const tip = points[points.length - 1];
  let i = points.length - 2;
  while (i > 0 && Math.hypot(tip.x - points[i].x, tip.y - points[i].y) < HEAD_LENGTH / 2) i--;

  const back = points[i];
  const len = Math.hypot(tip.x - back.x, tip.y - back.y);
  if (len === 0) return;

  const dx = (tip.x - back.x) / len;
  const dy = (tip.y - back.y) / len;
  const bx = tip.x - dx * HEAD_LENGTH;
  const by = tip.y - dy * HEAD_LENGTH;
  const half = HEAD_WIDTH / 2;

  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(bx - dy * half, by + dx * half);
  ctx.lineTo(bx + dy * half, by - dx * half);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.16;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.stroke();
}

function drawAnnotationText(
  ctx: Ctx,
  ann: Extract<Annotation, { kind: "text" }>,
  rotated: boolean,
): void {
  if (!ann.text.trim()) return;
  // Every measurement scales with the label, so a bigger one is the same drawing
  // at a larger size rather than big type in a thin outline.
  const size = textSize(ann);
  // Wrapped by the same function the box and the hit test use, never by ctx.measureText:
  // measuring here and estimating there would put the selection box somewhere other than
  // the words inside it.
  const lines = textLines(ann);
  const lineHeight = size * TEXT_LINE_H;
  // Centred on `at` as a block, so adding a second line grows the label evenly in both
  // directions rather than pushing the first one upwards.
  const top = -((lines.length - 1) * lineHeight) / 2;
  const alpha = textBgAlpha(ann);
  // The dark halo exists to lift the words off the grass. A panel already does that,
  // and a black outline on a light panel is only grime — so it goes once the panel is
  // solid enough to be doing the job itself.
  const halo = ann.bg === undefined || alpha < 0.5;

  upright(ctx, ann.at, rotated, () => {
    // Inside `upright` the axes are the text's own, which is what `textExtent` measures
    // in — so the panel needs no separate rotated case the way `boundsOf` does.
    if (ann.bg !== undefined) {
      const { w, h } = textExtent(ann);
      const pad = size * TEXT_BG_PAD;
      ctx.save();
      ctx.fillStyle = withAlpha(ann.bg, alpha);
      ctx.beginPath();
      ctx.roundRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2, pad * 0.8);
      ctx.fill();
      ctx.restore();
    }

    ctx.font = `700 ${size}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    lines.forEach((line, i) => {
      if (!line) return;
      const y = top + i * lineHeight;
      if (halo) {
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.lineWidth = size * 0.2;
        ctx.strokeText(line, 0, y);
      }
      ctx.fillStyle = ann.color;
      ctx.fillText(line, 0, y);
    });
  });
}

/**
 * Editor chrome for the selected shape: a dotted box and its grab handles.
 *
 * `rotated` reaches the geometry rather than the canvas: a label turns with the
 * board while staying upright, so its box and its width handle have to turn with
 * it. Everything else is drawn in pitch space and ignores the flag.
 */
function drawAnnotationChrome(ctx: Ctx, ann: Annotation, rotated: boolean): void {
  const { x, y, w, h } = boundsOf(ann, rotated);

  ctx.save();
  ctx.setLineDash([0.7, 0.7]);
  ctx.strokeStyle = "rgba(251,191,36,0.7)";
  ctx.lineWidth = 0.14;
  ctx.strokeRect(x - 0.7, y - 0.7, w + 1.4, h + 1.4);
  ctx.restore();

  for (const handle of annotationHandles(ann, rotated)) drawAnnotationHandle(ctx, handle);
}

/**
 * One grab point of the selected shape.
 *
 * Square when it resizes, round when it moves — on the board itself that shape is
 * the only cue that a text label can be widened at all, since nothing else says so.
 * Drawn at the radius it is hit-tested at rather than smaller, so the target is the
 * size it looks, and ringed dark-then-white because amber alone is a colour the
 * drawing underneath is free to be using too.
 */
function drawAnnotationHandle(ctx: Ctx, handle: AnnotationHandle): void {
  const { x, y } = handle.at;

  ctx.beginPath();
  if (handle.which === "w") {
    const side = HANDLE_RADIUS * 1.9;
    ctx.rect(x - side / 2, y - side / 2, side, side);
  } else {
    ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2);
  }

  // Widest stroke first: each later one is centred on the same path, so they nest
  // into a rim rather than replacing each other.
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.lineWidth = 0.26;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 0.13;
  ctx.stroke();
  ctx.fillStyle = "#fbbf24";
  ctx.fill();
}

// ---------------------------------------------------------------- paths

/**
 * Motion paths for the transition into the current scene.
 *
 * Shown while moving, and for a selected entity even at rest so its run can be
 * edited. Suppressed entirely for export unless the animation is under way.
 */
function drawPaths(ctx: Ctx, doc: BoardDoc, frame: Frame, view: RenderView): void {
  const clear = tokenRadius(doc);
  const r = frame.resolved;

  // While the animation runs, show every run in flight.
  if (r.moving) {
    const scene = doc.scenes[r.index];
    for (const team of doc.teams) {
      if (team.hidden) continue;
      for (const player of team.players) {
        if (isRunHidden(scene, player.id)) continue;
        const b = displayCurve(player.id, r);
        if (b) drawPath(ctx, b, team.color, false, clear);
      }
    }
    drawBallPath(ctx, doc, r);
    return;
  }

  // At rest, the editor still shows the selected players' runs into the scene
  // being edited, so a curve can be shaped without scrubbing to find it.
  if (!view.interactive || view.editScene === undefined) return;
  const edit = transitionInto(doc, view.editScene);
  if (!edit) return;
  const scene = doc.scenes[view.editScene];

  for (const team of doc.teams) {
    if (team.hidden) continue;
    for (const player of team.players) {
      if (!view.selection?.has(player.id)) continue;
      if (isRunHidden(scene, player.id)) continue;
      const b = displayCurve(player.id, edit);
      if (b) drawPath(ctx, b, team.color, true, clear);
    }
  }

  // The ball line is not gated on selection: a pass or a shot is the point of
  // the scene, and having to select the ball to see one hides the thing being
  // explained. Its handles ARE, like every other set.
  drawBallPath(ctx, doc, edit);
  if (view.selection?.has(BALL_ID) && !isRunHidden(scene, BALL_ID)) {
    const b = ballCurve(doc, edit);
    if (b) drawHandles(ctx, b);
  }
}

/** White reads over grass, both kits and the ball itself. */
const BALL_PATH_COLOR = "#ffffff";
/** Thinner than a drawn mark: the ball's line is a statement of fact about the
 *  play, not something the coach drew, and it should not shout over the runs. */
const BALL_PATH_WIDTH = 0.24;
/** Half the gap between the two rails of a shot. */
export const SHOT_OFFSET = 0.22;
/**
 * How far the shaft runs INTO the arrowhead before stopping, in metres.
 *
 * The head is a triangle narrowing to the tip, so it only hides what is inside
 * it. A shaft drawn all the way to the tip emerges from under the head where the
 * triangle becomes narrower than the shaft is wide — on a shot that is two rails
 * appearing to overshoot the arrow and run on to the ball. Ending the shaft
 * inside the head instead leaves the arrow as the terminus, with enough overlap
 * that no gap opens between them.
 */
export const SHAFT_INTO_HEAD = 0.35;

/**
 * The ball's own journey into a scene — the pass, or the shot.
 *
 * Players get an arrow per run and the ball had none, which left the one event
 * the tactic is usually about with no indicator at all.
 *
 * Only drawn when the ball travels of its own accord. A player running with it
 * carries it a long way and that is their run, not a pass — see
 * `ballTravelBetween`. Dashed is reserved for a pass between team-mates, which
 * is what the convention means; a turnover, a release or a loose ball is drawn
 * solid, and a shot is the double line struck from a burst at the contact point.
 */
function drawBallPath(ctx: Ctx, doc: BoardDoc, r: Resolved): void {
  if (isRunHidden(doc.scenes[r.index], BALL_ID)) return;

  // One definition of the curve, shared with the hit-test that bends it.
  const b = ballCurve(doc, r);
  if (!b) return;
  const travel = ballTravelBetween(doc, r.from, r.to);
  const start = b.p0;
  const end = b.p1;

  const table = buildArcTable(b);
  const sample = (length: number): Vec2[] => {
    const to = clamp(length / table.total, 0, 1);
    const out: Vec2[] = [];
    for (let i = 0; i <= PATH_STEPS; i++) {
      out.push(cubicAt(b, reparameterise(table, (i / PATH_STEPS) * to)));
    }
    return out;
  };

  // Stop short of the destination so the head is not buried under the ball.
  const clear = ballRadius(doc) * 2;
  const tipAt = table.total > clear * 2 ? table.total - clear : table.total;
  const points = sample(tipAt);

  // The shaft stops inside the head rather than at the tip. Floored at a
  // fraction of the line so a short travel keeps a visible shaft instead of
  // collapsing to a bare arrowhead.
  const shaft = sample(Math.max(tipAt * 0.2, tipAt - HEAD_LENGTH + SHAFT_INTO_HEAD));

  const shot = r.to.shot === true;
  const rails = shot
    ? [offsetPolyline(shaft, SHOT_OFFSET), offsetPolyline(shaft, -SHOT_OFFSET)]
    : [shaft];

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (travel === "pass" && !shot) ctx.setLineDash(DASH_PATTERN);
  for (const rail of rails) strokePolyline(ctx, rail, "rgba(0,0,0,0.4)", BALL_PATH_WIDTH + 0.12);
  for (const rail of rails) strokePolyline(ctx, rail, BALL_PATH_COLOR, BALL_PATH_WIDTH);
  ctx.restore();

  drawHead(ctx, points, BALL_PATH_COLOR);
  if (shot) drawStrike(ctx, start, points[1] ?? end);
}

/** Displace a polyline sideways by a constant, perpendicular to its direction. */
function offsetPolyline(points: Vec2[], by: number): Vec2[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const c = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    if (len === 0) return p;
    return { x: p.x - ((c.y - a.y) / len) * by, y: p.y + ((c.x - a.x) / len) * by };
  });
}

/** A burst behind the contact point, so a shot reads as struck rather than rolled. */
function drawStrike(ctx: Ctx, at: Vec2, towards: Vec2): void {
  const angle = Math.atan2(towards.y - at.y, towards.x - at.x);
  if (!Number.isFinite(angle)) return;

  ctx.save();
  ctx.strokeStyle = BALL_PATH_COLOR;
  ctx.lineWidth = 0.22;
  ctx.lineCap = "round";
  ctx.beginPath();
  // Fanned backwards from the direction of travel, and kept short: the ball
  // starts a token's length ahead of whoever struck it, so a longer tick lands
  // on their shirt.
  for (const spread of [-1.15, 0, 1.15]) {
    const a = angle + Math.PI + spread;
    ctx.moveTo(at.x + Math.cos(a) * 0.5, at.y + Math.sin(a) * 0.5);
    ctx.lineTo(at.x + Math.cos(a) * 1.15, at.y + Math.sin(a) * 1.15);
  }
  ctx.stroke();
  ctx.restore();
}

function drawPath(ctx: Ctx, b: Bezier, color: string, withHandles: boolean, clear: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.28;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.75;

  // Stop short of the destination so the arrowhead is not buried in the token.
  const table = buildArcTable(b);
  const trim = table.total > clear * 2 ? 1 - clear / table.total : 1;

  ctx.beginPath();
  for (let i = 0; i <= PATH_STEPS; i++) {
    const p = cubicAt(b, reparameterise(table, (i / PATH_STEPS) * trim));
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  const tip = cubicAt(b, reparameterise(table, trim));
  drawArrowhead(ctx, tip, cubicTangent(b, reparameterise(table, trim)), color);
  ctx.globalAlpha = 1;

  if (withHandles) drawHandles(ctx, b);
}

function drawArrowhead(ctx: Ctx, tip: Vec2, dir: Vec2, color: string): void {
  const len = 1.5;
  const half = 0.7;
  const nx = -dir.y;
  const ny = dir.x;
  const baseX = tip.x - dir.x * len;
  const baseY = tip.y - dir.y * len;

  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(baseX + nx * half, baseY + ny * half);
  ctx.lineTo(baseX - nx * half, baseY - ny * half);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Bezier control points, shown only while the entity is selected. */
function drawHandles(ctx: Ctx, b: Bezier): void {
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(251,191,36,0.5)";
  ctx.lineWidth = 0.08;
  ctx.setLineDash([0.4, 0.3]);
  ctx.beginPath();
  ctx.moveTo(b.p0.x, b.p0.y);
  ctx.lineTo(b.c1.x, b.c1.y);
  ctx.moveTo(b.p1.x, b.p1.y);
  ctx.lineTo(b.c2.x, b.c2.y);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const c of [b.c1, b.c2]) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 0.08;
    ctx.stroke();
  }
}

export const HANDLE_RADIUS = 0.55;

// ---------------------------------------------------------------- entities

type TokenState = {
  selected: boolean;
  hovered: boolean;
  rotated?: boolean;
  scale?: number;
  /** Kit pattern. Document data rather than view state, but it rides here to
   *  keep drawToken from growing an eighth positional argument. */
  pattern?: TeamPattern;
};

/**
 * Bands across the token's diameter, alternating from the edge inwards.
 *
 * Five gives colour-white-colour-white-colour: two stripes, symmetric, with the
 * kit colour still holding the middle where the shirt number sits. Four would put
 * a seam down the centre of the number and seven is mush at this size.
 */
const STRIPE_BANDS = 5;

const STRIPE_COLOR = "rgba(255,255,255,0.92)";

const isStriped = (state: TokenState): boolean =>
  state.pattern !== undefined && state.pattern !== "solid";

/**
 * Kit stripes, clipped to the token.
 *
 * Inside `upright`, so they follow the screen exactly as the shirt number does.
 * A stripe is there to tell two sides apart at a glance, and one that turned with
 * the board would read as vertical on one framing and horizontal on another.
 */
function drawStripes(ctx: Ctx, p: Vec2, radius: number, state: TokenState): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.clip();

  upright(ctx, p, state.rotated ?? false, () => {
    const band = (radius * 2) / STRIPE_BANDS;
    ctx.fillStyle = STRIPE_COLOR;
    for (let i = 1; i < STRIPE_BANDS; i += 2) {
      const at = -radius + i * band;
      if (state.pattern === "vertical") ctx.fillRect(at, -radius, band, radius * 2);
      else ctx.fillRect(-radius, at, radius * 2, band);
    }
  });

  ctx.restore();
}

function drawToken(
  ctx: Ctx,
  p: Vec2,
  number: number,
  label: string,
  color: string,
  textColor: string,
  state: TokenState,
): void {
  // Rings, strokes and type all scale with the token, so a bigger board is the
  // same drawing at a larger size rather than fat tokens with tiny numbers.
  const k = state.scale ?? 1;
  const radius = TOKEN_RADIUS * k;

  // Selection and hover rings sit outside the token so they never cover the number.
  if (state.selected || state.hovered) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 0.42 * k, 0, Math.PI * 2);
    ctx.strokeStyle = state.selected ? "#fbbf24" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = (state.selected ? 0.26 : 0.18) * k;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Stripes go between the fill and the rim, so the rim stays a clean circle over
  // the ends of the bands rather than being cut by them. Clipping to the token
  // replaces the current path, so the circle has to be laid down again — which is
  // why a plain kit skips both and draws exactly what it always did.
  if (isStriped(state)) {
    drawStripes(ctx, p, radius, state);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  }

  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.1 * k;
  ctx.stroke();

  // Text is anchored to the token but never turns with the board.
  upright(ctx, p, state.rotated ?? false, () => {
    ctx.font = `600 ${1.25 * k}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // A two-digit number is nearly as wide as the token, so there is no solid
    // middle to sit it on — it crosses the stripes whatever they are. The same
    // dark rim the label wears over mow stripes is what keeps it readable, and a
    // plain kit does not need it.
    if (isStriped(state)) {
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 0.26 * k;
      ctx.lineJoin = "round";
      ctx.strokeText(String(number), 0, 0.05 * k);
    }

    ctx.fillStyle = textColor;
    ctx.fillText(String(number), 0, 0.05 * k);

    if (label) {
      ctx.font = `500 ${1 * k}px Inter, system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "top";
      // A dark rim keeps the label readable over both mow stripes and white lines.
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 0.22 * k;
      ctx.lineJoin = "round";
      ctx.strokeText(label, 0, radius + 0.3 * k);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, 0, radius + 0.3 * k);
    }
  });
}

function drawBall(ctx: Ctx, p: Vec2, radius: number, state: TokenState): void {
  const k = radius / BALL_RADIUS;
  if (state.selected || state.hovered) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 0.3 * k, 0, Math.PI * 2);
    ctx.strokeStyle = state.selected ? "#fbbf24" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = 0.16 * k;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 0.1;
  ctx.stroke();

  drawBallPanels(ctx, p, radius, k);
}

/**
 * The black centre panel and its seams — a football rather than a white dot.
 *
 * Drawn rather than set as an emoji: `drawBoard` has to emit the same pixels in a
 * worker as on screen (the first invariant), and a colour-emoji glyph is whatever
 * font the machine happens to carry — Apple's, Noto's or Segoe's, at whatever
 * baseline. Five lines and a pentagon are the same everywhere and stay sharp at
 * export resolution.
 *
 * It turns with the board on a vertical pitch. A pentagon has no up, so nothing
 * is lost by letting it.
 */
function drawBallPanels(ctx: Ctx, p: Vec2, radius: number, k: number): void {
  const inner = radius * 0.4;
  const corner = (i: number): Vec2 => {
    // Point-up, so the seams fall symmetrically about the vertical.
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return { x: Math.cos(a), y: Math.sin(a) };
  };

  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const c = corner(i);
    const x = p.x + c.x * inner;
    const y = p.y + c.y * inner;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = BALL_PANEL_COLOR;
  ctx.fill();

  // Out to the rim from each corner. The circle's own stroke crops them, which is
  // what makes them read as seams rather than as spokes.
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const c = corner(i);
    ctx.moveTo(p.x + c.x * inner, p.y + c.y * inner);
    ctx.lineTo(p.x + c.x * radius, p.y + c.y * radius);
  }
  ctx.strokeStyle = BALL_PANEL_COLOR;
  ctx.lineWidth = 0.085 * k;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
}

/** Near-black rather than black: the same ink the darkest kit uses. */
const BALL_PANEL_COLOR = "#18181b";

function drawMarquee(ctx: Ctx, a: Vec2, b: Vec2): void {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);

  ctx.fillStyle = "rgba(251,191,36,0.12)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 0.12;
  ctx.setLineDash([0.6, 0.4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}
