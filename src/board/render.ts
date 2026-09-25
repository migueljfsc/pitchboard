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
  LinkArrows,
  PitchHalf,
  RenderView,
  Scene,
  Team,
  TeamPattern,
  Vec2,
} from "./types";
import { BALL_ID } from "./types";
import { keeperOf } from "./players";
import {
  BALL_RADIUS,
  themeFor,
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
  UNSEEN_ALPHA,
  absoluteMs,
  ballAt,
  ballLift,
  displayCurve,
  runsThrough,
  frameAt,
  highlightAt,
  transitionInto,
  type Frame,
  type Resolved,
} from "./timeline";
import { DEFAULT_SPOTLIGHT, ballCurve, ballTravelBetween, isRunHidden } from "./scenes";
import { linkColor, linkGeometry, linksOn, type LinkEdge, type LinkGeometry } from "./links";
import {
  DASH_PATTERN,
  HEAD_LENGTH,
  HEAD_WIDTH,
  MARK_WIDTH,
  TEXT_BG_PAD,
  ZONE_ALPHA,
  annotationHandles,
  boundsOf,
  isStanding,
  polylineLength,
  strokePoints,
  trimEnd,
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
  halfRange,
  cubicAt,
  cubicTangent,
  easeInOutCubic,
  reparameterise,
  viewMatrix,
  type Bezier,
} from "./geometry";
import { cameraTransform, screenMapping } from "./camera";
import {
  GROUND_SQUASH,
  cameraFor,
  drawDepthShading,
  projectPitch,
  warpGround,
  type Camera,
  type Projected,
} from "./projection";

export { TOKEN_RADIUS, BALL_RADIUS };
export type { Frame };

/**
 * The shirt a player is drawn in: the keeper's kit if he is his side's keeper, the team's
 * otherwise. A keeper's kit is plain; stripes are how two SIDES are told apart (D90).
 */
function kitOf(team: Team, id: string): { color: string; textColor: string; pattern?: TeamPattern } {
  const keeper = team.keeper;
  if (keeper && keeperOf(team) === id) return { color: keeper.color, textColor: keeper.textColor };
  return { color: team.color, textColor: team.textColor, pattern: team.pattern };
}

/** Steps used to stroke a curved path. Purely cosmetic; the maths is exact. */
const PATH_STEPS = 24;

export function drawBoard(
  ctx: Ctx,
  doc: BoardDoc,
  t: number,
  view: RenderView,
  theme: PitchTheme = themeFor(doc),
): void {
  const frame = frameAt(doc, t);

  ctx.save();

  // Surround first, so one call yields a complete frame.
  if (!view.transparent) {
    ctx.fillStyle = theme.surround;
    ctx.fillRect(0, 0, view.width, view.height);
    drawVignette(ctx, view.width, view.height);
  }

  // The scene's own camera, as one more screen transform on top of whatever the
  // caller set — so the board is redrawn at the new scale, never stretched, and a
  // 3D ground layer is allocated at the resolution it will be seen at.
  if (view.sceneCamera) {
    // Only the 3D ground layer's resolution depends on it; a context that cannot
    // report its transform gets the plain one.
    const m = ctx.getTransform?.();
    const deviceScale = m ? Math.hypot(m.a, m.b) || 1 : 1;
    const mapping = screenMapping(doc, view, view.width, view.height, deviceScale);
    const zoom = cameraTransform(frame.resolved, doc, view.width, view.height, mapping);
    if (zoom.z !== 1 || zoom.x !== 0 || zoom.y !== 0) {
      ctx.transform(zoom.z, 0, 0, zoom.z, zoom.x, zoom.y);
    }
  }

  // The angled camera is a different composition of the same drawing, so it
  // branches here rather than threading a flag through every call below. It needs
  // an OffscreenCanvas for the ground layer; without one, fall back to the flat
  // board rather than failing to draw a frame at all.
  if (view.tilt && typeof OffscreenCanvas !== "undefined") {
    drawTilted(ctx, doc, frame, view, theme, t);
    ctx.restore();
    drawCaption(ctx, doc, frame, view);
    return;
  }

  // Compose with whatever transform the caller set (the editor sets a DPR scale),
  // then work in metres from here down. One matrix covers upright and rotated.
  ctx.transform(...viewMatrix(view));

  clipToHalf(ctx, doc, view.half);

  drawPitch(ctx, doc.pitch, theme, true, view.turf);
  drawTeamNames(ctx, doc, view.rotated);

  // Annotations split across the stack. A shaded zone is background — it belongs
  // under the play, or it drowns it. Arrows, freehand and text are the coach
  // talking over the top, and go above everything.
  const marks = annotationsFor(doc, frame, view);
  for (const ann of marks) if (isZone(ann)) drawZone(ctx, ann);

  // Links sit under the tokens so a connector never covers a shirt number.
  drawLinks(ctx, doc, frame, view.rotated, t);
  drawTrail(ctx, doc, view, view.rotated);
  drawPaths(ctx, doc, frame, view);

  drawGhosts(ctx, doc, view, view.rotated);

  const scale = tokenScaleOf(doc);

  // Under the tokens, in one pass — see halosOn.
  const halos = halosOn(doc, frame);
  for (const halo of halos) {
    drawPool(ctx, halo.at, poolRadius(halo, scale), halo.strength);
    drawHighlight(ctx, halo.at, TOKEN_RADIUS * scale, halo.color, halo.strength);
  }

  for (const team of doc.teams) {
    if (team.hidden) continue;
    for (const player of team.players) {
      const p = frame.positions[player.id];
      if (!p) continue;
      const kit = kitOf(team, player.id);
      drawToken(ctx, p, player.number, player.label, kit.color, kit.textColor, {
        selected: view.selection?.has(player.id) ?? false,
        hovered: view.interactive && view.hover === player.id,
        rotated: view.rotated,
        scale,
        pattern: kit.pattern,
        alpha: frame.visibility[player.id],
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
      shadow: true,
    });
  }

  for (const ann of marks) if (!isZone(ann)) drawMark(ctx, ann, view.rotated, ballRadius(doc));

  // Over everything the board says, under the editor's own chrome.
  drawSpotlight(
    ctx,
    halos.map((h) => ({ at: h.at, r: poolRadius(h, scale), strength: h.strength })),
    spotlightDim(frame.resolved),
  );

  if (view.interactive && view.annotationSelection) {
    const selected = marks.find((a) => a.id === view.annotationSelection);
    if (selected) drawAnnotationChrome(ctx, selected, view.rotated, ballRadius(doc));
  }

  if (view.interactive && view.marquee) {
    drawMarquee(ctx, view.marquee.a, view.marquee.b);
  }
  if (view.interactive && view.guides?.length) drawGuides(ctx, doc, view.guides);

  ctx.restore();
  drawCaption(ctx, doc, frame, view);
}

/**
 * The export's caption, in screen space in the lower-left corner: a title, and
 * under it the scene being played into.
 *
 * Sized off the frame's height so it reads the same at 960 and at 3840. On a
 * dark plate, because it can land on grass, lines or players alike.
 */
function drawCaption(ctx: Ctx, doc: BoardDoc, frame: Frame, view: RenderView): void {
  const caption = view.caption;
  if (!caption) return;
  const title = caption.title.trim();
  const scene = caption.scene ? (doc.scenes[frame.resolved.index]?.name.trim() ?? "") : "";
  if (!title && !scene) return;

  const unit = Math.max(10, view.height * 0.028);
  const pad = unit * 0.6;
  const margin = unit;
  const lines: { text: string; font: string; size: number; color: string }[] = [];
  if (title) {
    lines.push({
      text: title,
      font: `700 ${unit}px Inter, system-ui, -apple-system, sans-serif`,
      size: unit,
      color: "#ffffff",
    });
  }
  if (scene) {
    lines.push({
      text: scene,
      font: `500 ${unit * 0.75}px Inter, system-ui, -apple-system, sans-serif`,
      size: unit * 0.75,
      color: "rgba(255,255,255,0.8)",
    });
  }

  ctx.save();
  let w = 0;
  for (const line of lines) {
    ctx.font = line.font;
    w = Math.max(w, ctx.measureText(line.text).width);
  }
  const gap = unit * 0.3;
  const h = lines.reduce((sum, l) => sum + l.size, 0) + gap * (lines.length - 1);
  const x = margin;
  const y = view.height - margin - h - pad * 2;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.roundRect(x, y, w + pad * 2, h + pad * 2, unit * 0.3);
  ctx.fill();

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let at = y + pad;
  for (const line of lines) {
    ctx.font = line.font;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, x + pad, at);
    at += line.size + gap;
  }
  ctx.restore();
}

/**
 * Darken the surround towards the edges of the frame.
 *
 * Wherever the board does not fill the canvas — beside a vertical or 3D pitch, or
 * around a letterboxed export — a flat band of one colour reads as dead space. A
 * falloff puts the light on the pitch and lets the edges recede.
 */
function drawVignette(ctx: Ctx, width: number, height: number): void {
  const cx = width / 2;
  const cy = height / 2;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
  glow.addColorStop(0, "rgba(40,64,52,0.35)");
  glow.addColorStop(0.55, "rgba(0,0,0,0)");
  glow.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
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
  t: number,
): void {
  // The caller's transform carries the device pixel ratio, and the ground layer is
  // a real canvas that has to be allocated in device pixels. Reading it back here
  // is the only way to keep DPR out of RenderView, where it would become a second
  // source of truth for the same number.
  const m = ctx.getTransform();
  // The one camera, built where the hit-tests build theirs. The layer is exactly
  // the content rect, so it seats corner to corner with no letterbox — the
  // trapezoid IS the board, and the surround already painted underneath shows
  // everywhere the trapezoid is not.
  const cam = cameraFor(doc.pitch, view.half, view.width, view.height, Math.hypot(m.a, m.b) || 1);
  const { proj, groundView } = cam;

  const ground = new OffscreenCanvas(proj.sourceW, proj.sourceH);
  const gctx = ground.getContext("2d");
  if (!gctx) return;

  gctx.setTransform(...viewMatrix(groundView));
  clipToHalf(gctx, doc, view.half);

  const marks = annotationsFor(doc, frame, view);

  drawPitch(gctx, doc.pitch, theme, false, view.turf);
  drawTeamNames(gctx, doc, true, TEAM_NAME_OFFSET_3D);
  for (const ann of marks) if (isZone(ann)) drawZone(gctx, ann);
  drawLinks(gctx, doc, frame, true, t);
  drawTrail(gctx, doc, view, true);
  drawPaths(gctx, doc, frame, view);

  // Arrows and freehand ride the grass here, rather than floating over the players
  // as they do on the flat board. A mark that ignores the perspective reads as a
  // sticker on the lens. Text is the exception, below — squashed type is simply
  // unreadable, and a label is the one annotation nobody imagines painted on turf.
  for (const ann of marks) {
    if (!isZone(ann) && !isStanding(ann)) drawMark(gctx, ann, true, ballRadius(doc));
  }

  if (view.interactive) {
    // The selected shape, with its grab points: they are pitch geometry lying in
    // this layer, so they warp with the grass and can be grabbed like anything else
    // on it. A text label is a billboard and gets its chrome below, inside its own
    // billboard, where its handles sit around the words (D91).
    const selected = view.annotationSelection
      ? marks.find((a) => a.id === view.annotationSelection)
      : undefined;
    if (selected && !isStanding(selected)) drawAnnotationChrome(gctx, selected, true);

    // The marquee is a region of the PITCH here rather than of the screen, so it
    // lies on the grass and warps with it — and `entitiesInRect` needs no 3D of
    // its own, because the corners were already turned back into metres.
    if (view.marquee) drawMarquee(gctx, view.marquee.a, view.marquee.b);
    if (view.guides?.length) drawGuides(gctx, doc, view.guides);
  }

  warpGround(ctx, ground, proj);
  drawDepthShading(ctx, proj);

  // The crop has to be applied twice. The ground layer took it in metre space like
  // the flat board does, but billboards are drawn straight onto the destination and
  // would otherwise ignore it — leaving the far half's players standing in the
  // surround above a half-pitch view.
  ctx.save();
  clipToProjectedHalf(ctx, doc, view.half, cam);
  drawGoal(ctx, doc, cam, -1, theme);
  drawBillboards(ctx, doc, frame, view, cam, marks);
  drawGoal(ctx, doc, cam, 1, theme);

  // In screen space, over the goals and everything standing: the pools are cut
  // around each highlighted player where he is drawn, sized by his depth.
  const scale = tokenScaleOf(doc);
  const halos = halosOn(doc, frame);
  const holes = halos.flatMap((h) => {
    const at = projectPitch(h.at, cam);
    if (!Number.isFinite(at.scale) || at.scale <= 0) return [];
    return [{ at: { x: at.x, y: at.y }, r: poolRadius(h, scale) * at.scale, strength: h.strength }];
  });
  drawSpotlight(ctx, holes, spotlightDim(frame.resolved));
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
  cam: Camera,
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
    const p = projectPitch(corner, cam);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.clip();
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
  cam: Camera,
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

  const at = (p: Vec3): Projected => projectPitch(p, cam, p.up);
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
  cam: Camera,
  marks: Annotation[],
): void {
  const scale = tokenScaleOf(doc);

  // Behind everything standing, and unsorted: a ghost is reference, not an object
  // on the pitch competing for depth. A billboard's axes are the screen's, so it
  // is never rotated in here.
  drawGhosts(ctx, doc, view, false, (p, draw) =>
    billboard(ctx, p, projectPitch(p, cam), draw),
  );

  // Billboarded like everything else that must stay round: a halo drawn into the
  // ground layer would land as an ellipse squashed into the grass. Under the
  // standing tokens, and unsorted, for the same reason the ghosts are.
  for (const halo of halosOn(doc, frame)) {
    billboard(ctx, halo.at, projectPitch(halo.at, cam), () => {
      drawPool(ctx, halo.at, poolRadius(halo, scale), halo.strength);
      drawHighlight(ctx, halo.at, TOKEN_RADIUS * scale, halo.color, halo.strength);
    });
  }

  const standing: { at: Projected; draw: () => void }[] = [];

  for (const team of doc.teams) {
    if (team.hidden) continue;
    for (const player of team.players) {
      const p = frame.positions[player.id];
      if (!p) continue;
      const at = projectPitch(p, cam);
      standing.push({
        at,
        draw: () =>
          billboard(ctx, p, at, () => {
            drawGroundShadow(ctx, p, TOKEN_RADIUS * scale);
            const kit = kitOf(team, player.id);
            drawToken(ctx, p, player.number, player.label, kit.color, kit.textColor, {
              selected: view.selection?.has(player.id) ?? false,
              hovered: view.interactive && view.hover === player.id,
              rotated: false,
              scale,
              pattern: kit.pattern,
              alpha: frame.visibility[player.id],
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
    const ground = projectPitch(ball, cam);
    const lift = ballLift(frame.resolved, doc);
    const air = lift > 0 ? projectPitch(ball, cam, LOFT_APEX * lift) : ground;
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

  // A drawn ball stands among the players rather than over them: it is a thing
  // on the pitch, and a player in front of it hides it.
  const drawnR = ballRadius(doc);
  for (const ann of marks) {
    if (ann.kind !== "ball") continue;
    const at = projectPitch(ann.at, cam);
    standing.push({
      at,
      draw: () =>
        billboard(ctx, ann.at, at, () => {
          drawGroundShadow(ctx, ann.at, drawnR);
          drawBall(ctx, ann.at, drawnR, { selected: false, hovered: false });
          if (view.interactive && view.annotationSelection === ann.id) {
            drawAnnotationChrome(ctx, ann, false, drawnR);
          }
        }),
    });
  }

  // Nearest last. A billboard standing on the grass has to cover the one behind
  // it, and draw order is the only depth test there is.
  standing.sort((a, b) => a.at.y - b.at.y);
  for (const item of standing) item.draw();

  // Text over the top of the players, as it is on the flat board.
  for (const ann of marks) {
    if (ann.kind !== "text") continue;
    const at = projectPitch(ann.at, cam);
    billboard(ctx, ann.at, at, () => {
      drawAnnotationText(ctx, ann, false);
      // Inside the billboard, so the outline and handles sit where the words
      // really are — and unrotated, because a billboard's axes are the screen's.
      if (view.interactive && view.annotationSelection === ann.id) {
        drawAnnotationChrome(ctx, ann, false);
      }
    });
  }
}

/**
 * How solid a ghost is. Present enough to place a token against, faint enough
 * that it is never mistaken for one.
 */
const GHOST_ALPHA = 0.4;

/** A ghost's size as a share of a token's. */
const GHOST_SIZE = 0.78;

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
  // Smaller than a token, so an outline of another scene is never taken for a
  // player nobody saw -- who is drawn full size, filled and dashed (D87).
  const radius = TOKEN_RADIUS * scale * GHOST_SIZE;

  ctx.save();
  ctx.globalAlpha = GHOST_ALPHA;

  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.14 * scale;
  ctx.stroke();

  upright(ctx, p, rotated, () => {
    ctx.font = `600 ${0.9 * scale}px Inter, system-ui, -apple-system, sans-serif`;
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

// ------------------------------------------------------------ highlights

/** How far the glow reaches past the token, in token radii. Exported for the tests. */
export const HALO_REACH = 2.6;
/** Alpha at the token's edge, at full strength. */
const HALO_ALPHA = 0.7;

/** A halo resolved for one entity: where it sits, what colour, how bright. */
type Halo = { at: Vec2; color: string; strength: number; ball?: boolean };

/**
 * Every glow on this frame, players first and the ball last.
 *
 * A list rather than a draw call per token, because tokens overlap and a halo
 * drawn beside its own token would sit on top of a neighbour drawn a moment
 * earlier. They all go down in one pass underneath.
 *
 * The ball gets a token-sized halo rather than a ball-sized one: the mark says
 * "look here" and means the same thing whatever it is marking.
 */
function halosOn(doc: BoardDoc, frame: Frame): Halo[] {
  const out: Halo[] = [];

  for (const team of doc.teams) {
    if (team.hidden) continue;
    for (const player of team.players) {
      const glow = highlightAt(player.id, frame.resolved);
      const at = frame.positions[player.id];
      if (glow && at) out.push({ at, color: glow.color, strength: glow.strength });
    }
  }

  const ball = frame.ball;
  if (ball) {
    const glow = highlightAt(BALL_ID, frame.resolved);
    if (glow) out.push({ at: ball, color: glow.color, strength: glow.strength, ball: true });
  }

  return out;
}

/**
 * The glow marking a key player for this scene.
 *
 * A soft falloff rather than a ring: the board already draws a ring for selection
 * and another for hover, and a third would read as a third selection state rather
 * than as emphasis.
 *
 * NO PULSE. `drawBoard` is handed `t` and could animate one deterministically, but
 * a glow that changes every frame is precisely what makes a GIF's palette crawl
 * (D29) — and it would be drawing attention to itself rather than to the player.
 */
function drawHighlight(ctx: Ctx, p: Vec2, radius: number, color: string, strength: number): void {
  const outer = radius * HALO_REACH;
  const glow = ctx.createRadialGradient(p.x, p.y, radius * 0.55, p.x, p.y, outer);
  glow.addColorStop(0, withAlpha(color, HALO_ALPHA * strength));
  glow.addColorStop(0.45, withAlpha(color, HALO_ALPHA * 0.4 * strength));
  glow.addColorStop(1, withAlpha(color, 0));

  ctx.beginPath();
  ctx.arc(p.x, p.y, outer, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();
}

// ------------------------------------------------------------- the spotlight
//
// A highlight used to be a glow under the token and nothing else, and on a busy
// board it read as one more colour among many. Now the rest of the board goes dark
// and each highlighted player stands in a pool of light that follows him.

/** A pool's radius, in token-scale metres. The ball's is smaller, as the ball is. */
const POOL_RADIUS = 3.2;
const BALL_POOL_RADIUS = 2;
/** How bright the pool is at its centre. Faint: the darkness around it does the work. */
const POOL_LIGHT = 0.1;

const poolRadius = (halo: Halo, scale: number): number =>
  (halo.ball ? BALL_POOL_RADIUS : POOL_RADIUS) * scale;

/**
 * How dark to make the board: each end of the transition's own setting, where that
 * scene has a highlight at all, crossed on the same easing as the highlights — so it
 * darkens as a highlighted scene arrives, lifts as it leaves, and moves from one
 * scene's depth to the next without a step. During a hold it is that scene's.
 */
function spotlightDim(r: Resolved): number {
  const depth = (s: Scene): number =>
    s.highlight && Object.keys(s.highlight).length > 0 ? (s.spotlight ?? DEFAULT_SPOTLIGHT) : 0;
  const e = easeInOutCubic(r.u);
  return depth(r.from) * (1 - e) + depth(r.to) * e;
}

/** The light itself: a faint white wash on the grass under a highlighted player. */
function drawPool(ctx: Ctx, p: Vec2, radius: number, strength: number): void {
  const light = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
  light.addColorStop(0, `rgba(255,255,255,${POOL_LIGHT * strength})`);
  light.addColorStop(0.6, `rgba(255,255,255,${POOL_LIGHT * 0.6 * strength})`);
  light.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = light;
  ctx.fill();
}

/** A cut in the darkness: where it is, how wide, and how far through it goes. */
type Hole = { at: Vec2; r: number; strength: number };

/** Far enough out to cover any frame, in metres or in pixels alike. */
const COVER = 1e5;

/**
 * Darken everything drawn so far, except around each hole.
 *
 * On a layer of its own, because holes have to be cut OUT of the darkness —
 * soft-edged, and where two overlap the overlap stays lit. Painting darkness with
 * holes in a single path cannot do both: nonzero and even-odd winding each darken
 * the place two pools meet. The layer is drawn in the context's own coordinates, so
 * this works in metres on the flat board and in pixels under the camera.
 *
 * Without an OffscreenCanvas (the tests, or an old browser) the holes are hard-edged
 * and even-odd — the same composition, cruder at the edges.
 */
function drawSpotlight(ctx: Ctx, holes: Hole[], dim: number): void {
  if (dim <= 0.001 || holes.length === 0) return;
  const fill = `rgba(0,0,0,${dim})`;

  const size = (ctx as { canvas?: { width?: unknown; height?: unknown } }).canvas;
  const w = size?.width;
  const h = size?.height;
  const layered =
    typeof OffscreenCanvas !== "undefined" && typeof w === "number" && typeof h === "number" && w > 0 && h > 0;
  const layer = layered ? new OffscreenCanvas(w, h).getContext("2d") : null;

  if (!layer) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-COVER, -COVER, COVER * 2, COVER * 2);
    for (const hole of holes) {
      ctx.moveTo(hole.at.x + hole.r, hole.at.y);
      ctx.arc(hole.at.x, hole.at.y, hole.r, 0, Math.PI * 2);
    }
    ctx.fillStyle = fill;
    ctx.fill("evenodd");
    ctx.restore();
    return;
  }

  layer.setTransform(ctx.getTransform());
  layer.fillStyle = fill;
  layer.fillRect(-COVER, -COVER, COVER * 2, COVER * 2);
  layer.globalCompositeOperation = "destination-out";
  for (const hole of holes) {
    const { x, y } = hole.at;
    const cut = layer.createRadialGradient(x, y, hole.r * 0.45, x, y, hole.r);
    cut.addColorStop(0, `rgba(0,0,0,${hole.strength})`);
    cut.addColorStop(1, "rgba(0,0,0,0)");
    layer.beginPath();
    layer.arc(x, y, hole.r, 0, Math.PI * 2);
    layer.fillStyle = cut;
    layer.fill();
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer.canvas, 0, 0);
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
 *
 * Only the ones this scene shows. `resolved.index` is the scene being travelled
 * into, which is the same instant annotations switch on, so a link and a zone
 * ranged to the same scene arrive together (D47).
 */
/** A link's line, under-stroke included, in metres. */
const LINK_WIDTH = 0.36;
const LINK_UNDER = 0.52;
/** A link's heads: smaller than a drawn arrow's, as its line is thinner. */
const LINK_HEAD_LENGTH = 1.5;
const LINK_HEAD_WIDTH = 1.1;
/** Room between a head's point and the token it points at. */
const LINK_HEAD_GAP = 0.15;
/** Dots rather than dashes: a near-zero dash with a round cap is a dot the line's width. */
const LINK_DASH: [number, number] = [0.01, 0.75];
/** How fast marching dashes travel, in metres per second of board time. */
const LINK_MARCH = 1.6;

/** One edge of a link as stroked: the shaft, and where its heads point. */
type LinkStroke = { shaft: [Vec2, Vec2]; heads: { tip: Vec2; back: Vec2 }[] };

/**
 * An edge with its heads.
 *
 * The heads stop short of what is drawn at either end — the token, and the name
 * under it — and the shaft stops inside each head, as a drawn arrow's does. `clearA`
 * and `clearB` are how far out from each centre that is, along this edge. An edge
 * too short for its heads is drawn bare rather than as heads overlapping.
 */
function linkStroke(
  a: Vec2,
  b: Vec2,
  arrows: LinkArrows,
  clearA: number,
  clearB: number,
): LinkStroke {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const heads = arrows === "both" ? 2 : arrows === "forward" ? 1 : 0;
  const room = clearB + (heads === 2 ? clearA : 0) + LINK_HEAD_LENGTH * heads;
  if (heads === 0 || len <= room) return { shaft: [a, b], heads: [] };

  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;
  const along = (from: Vec2, d: number): Vec2 => ({ x: from.x + dx * d, y: from.y + dy * d });
  const into = LINK_HEAD_LENGTH - SHAFT_INTO_HEAD;

  const out: LinkStroke = {
    shaft: [heads === 2 ? along(a, clearA + into) : a, along(b, -(clearB + into))],
    heads: [{ tip: along(b, -clearB), back: a }],
  };
  if (heads === 2) out.heads.push({ tip: along(a, clearA), back: b });
  return out;
}

/** Estimates for a player's name, as multiples of the token scale — see `drawToken`. */
const NAME_CHAR_W = 0.58;
const NAME_TOP = 0.3;
const NAME_HEIGHT = 0.95;
const NAME_PAD = 0.05;

/**
 * How far from a player's centre a head pointing at him along `dir` has to stop:
 * clear of the token, and clear of his name if the edge arrives through it.
 *
 * The name hangs below the token in SCREEN space, whatever the board's orientation
 * (`upright`), so `dir` is turned into that frame before the box is tested. Arriving
 * from below and stopping at the token puts the head under the name, which is drawn
 * over it — and a two-way link reads as a one-way one.
 */
function headClearance(
  dir: Vec2,
  label: string,
  radius: number,
  k: number,
  rotated: boolean,
): number {
  const clear = radius + LINK_HEAD_GAP;
  if (!label) return clear;

  // `upright` turns +90° on a rotated board, so pitch (x, y) is screen (y, -x).
  const ux = rotated ? dir.y : dir.x;
  const uy = rotated ? -dir.x : dir.y;
  const half = (label.length * NAME_CHAR_W * k) / 2 + NAME_PAD;
  const top = radius + NAME_TOP * k - NAME_PAD;
  const bottom = radius + (NAME_TOP + NAME_HEIGHT) * k + NAME_PAD;

  // Where the ray out of the centre leaves the name's box, by slabs.
  const slab = (u: number, lo: number, hi: number): [number, number] => {
    if (Math.abs(u) < 1e-9) return lo <= 0 && 0 <= hi ? [-Infinity, Infinity] : [Infinity, -Infinity];
    const t1 = lo / u;
    const t2 = hi / u;
    return [Math.min(t1, t2), Math.max(t1, t2)];
  };
  const [x0, x1] = slab(ux, -half, half);
  const [y0, y1] = slab(uy, top, bottom);
  const enter = Math.max(x0, y0);
  const exit = Math.min(x1, y1);
  if (enter > exit || exit <= 0) return clear;
  return Math.max(clear, exit);
}

function drawLinks(ctx: Ctx, doc: BoardDoc, frame: Frame, rotated: boolean, t: number): void {
  const concealed = concealedPlayers(doc);
  const radius = tokenRadius(doc);
  const k = tokenScaleOf(doc);
  const labels = new Map<string, string>();
  for (const team of doc.teams) for (const p of team.players) labels.set(p.id, p.label);

  const stroke = (e: LinkEdge, arrows: LinkArrows): LinkStroke => {
    const len = e.metres || 1;
    const dir = { x: (e.b.x - e.a.x) / len, y: (e.b.y - e.a.y) / len };
    const back = { x: -dir.x, y: -dir.y };
    // Each end is approached from the other: the head at b points along dir, so the
    // ray out of b's centre that it has to clear runs back towards a.
    const clearA = headClearance(dir, labels.get(e.from) ?? "", radius, k, rotated);
    const clearB = headClearance(back, labels.get(e.to) ?? "", radius, k, rotated);
    return linkStroke(e.a, e.b, arrows, clearA, clearB);
  };

  for (const link of linksOn(doc, frame.resolved.index)) {
    // A link whose players are all on a hidden team goes with them.
    if (link.members.every((m) => concealed.has(m))) continue;
    const g = linkGeometry(link, frame.resolved, doc);
    if (!g) continue;
    const color = linkColor(doc, link);
    const arrows = link.arrows ?? "none";

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g.points[0].x, g.points[0].y);
    for (let i = 1; i < g.points.length; i++) ctx.lineTo(g.points[i].x, g.points[i].y);
    if (g.closed) ctx.closePath();

    if (link.style === "filled") {
      ctx.fillStyle = withAlpha(color, 0.22);
      ctx.fill();
    }

    // Headed edges are stroked one by one, each trimmed to its heads. Unheaded, the
    // outline stays one path, so its corners join rather than overlap.
    const strokes = arrows === "none" ? [] : g.edges.map((e) => stroke(e, arrows));
    if (strokes.length > 0) {
      ctx.beginPath();
      for (const { shaft } of strokes) {
        ctx.moveTo(shaft[0].x, shaft[0].y);
        ctx.lineTo(shaft[1].x, shaft[1].y);
      }
    }

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (link.line === "dotted") {
      ctx.setLineDash(LINK_DASH);
      // Negative, so the dashes travel from the first member towards the last.
      const period = LINK_DASH[0] + LINK_DASH[1];
      if (link.animate) ctx.lineDashOffset = -((t * LINK_MARCH) % period);
    }

    // A dark under-stroke first: a blue or black kit colour is nearly invisible
    // against the grass on its own.
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = LINK_UNDER;
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = LINK_WIDTH;
    ctx.stroke();

    // Solid whatever the line is: a dashed rim reads as a broken head.
    if (link.line === "dotted") ctx.setLineDash([]);
    for (const { heads } of strokes) {
      for (const h of heads) {
        drawTriangleHead(ctx, h.tip, h.back, color, LINK_HEAD_LENGTH, LINK_HEAD_WIDTH, 0.14);
      }
    }
    ctx.restore();

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

const isZone = (ann: Annotation): boolean =>
  ann.kind === "rect" || ann.kind === "ellipse" || ann.kind === "polygon";

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
  if (ann.kind === "polygon") {
    ctx.lineJoin = "round";
    ctx.moveTo(ann.points[0].x, ann.points[0].y);
    for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
    ctx.closePath();
  } else if (ann.kind === "ellipse") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(x, y, w, h);
  }

  if (!("filled" in ann) || ann.filled !== false) {
    ctx.fillStyle = withAlpha(ann.color, ZONE_ALPHA);
    // Even-odd, as the hit test is: a polygon crossing itself is shaded where it is inside.
    if (ann.kind === "polygon") ctx.fill("evenodd");
    else ctx.fill();
  }
  ctx.lineWidth = MARK_WIDTH * 0.7;
  ctx.strokeStyle = ann.color;
  ctx.stroke();
}

/** Arrows, lines, freehand and text — everything drawn over the play. */
function drawMark(ctx: Ctx, ann: Annotation, rotated: boolean, ballR: number): void {
  if (ann.kind === "text") {
    drawAnnotationText(ctx, ann, rotated);
    return;
  }
  // The match ball's own drawing, shadow and all, so a drawn ball is a ball and
  // not a symbol for one. Never selected or hovered as an entity: its chrome is a
  // shape's.
  if (ann.kind === "ball") {
    drawBall(ctx, ann.at, ballR, { selected: false, hovered: false, shadow: true });
    return;
  }

  const raw = strokePoints(ann);
  if (raw.length < 2) return;

  const dash = ann.kind === "arrow" || ann.kind === "line" ? ann.dash : "solid";
  const points = dash === "wavy" ? wavy(raw) : raw;
  // An arrow's shaft stops inside its head, for the reason `SHAFT_INTO_HEAD` gives.
  // The head is still aimed and placed from the whole line.
  const shaft = ann.kind === "arrow" ? trimShaft(points, HEAD_LENGTH) : points;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (dash === "dashed") ctx.setLineDash(DASH_PATTERN);

  // Dark under-stroke first, for the same reason links have one: a dark colour
  // is nearly invisible against the grass on its own.
  strokePolyline(ctx, shaft, "rgba(0,0,0,0.35)", MARK_WIDTH + 0.16);
  strokePolyline(ctx, shaft, ann.color, MARK_WIDTH);
  ctx.restore();

  if (ann.kind === "arrow") drawHead(ctx, points, ann.color);
}

/**
 * A shaft that ends inside a head of length `head` rather than at its tip. Floored
 * at a fraction of the line, so a short arrow keeps a visible shaft instead of
 * collapsing to a bare head.
 */
function trimShaft(points: Vec2[], head: number): Vec2[] {
  const total = polylineLength(points);
  const cut = Math.min(head - SHAFT_INTO_HEAD, total * 0.8);
  return trimEnd(points, cut);
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
  drawTriangleHead(ctx, tip, points[i], color, HEAD_LENGTH, HEAD_WIDTH, 0.16);
}

/** A filled triangle with its point at `tip`, aimed away from `back`, dark-rimmed. */
function drawTriangleHead(
  ctx: Ctx,
  tip: Vec2,
  back: Vec2,
  color: string,
  length: number,
  width: number,
  rim: number,
): void {

  const len = Math.hypot(tip.x - back.x, tip.y - back.y);
  if (len === 0) return;

  const dx = (tip.x - back.x) / len;
  const dy = (tip.y - back.y) / len;
  const bx = tip.x - dx * length;
  const by = tip.y - dy * length;
  const half = width / 2;

  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(bx - dy * half, by + dx * half);
  ctx.lineTo(bx + dy * half, by - dx * half);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = rim;
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
function drawAnnotationChrome(
  ctx: Ctx,
  ann: Annotation,
  rotated: boolean,
  ballR?: number,
): void {
  const { x, y, w, h } = boundsOf(ann, rotated, ballR);

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

  // The middle of an edge is not a point of the shape but an offer of one: smaller
  // and hollow, so it never reads as a corner that is already there.
  if (handle.which === "m") {
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_RADIUS * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fill();
    ctx.strokeStyle = "rgba(251,191,36,0.95)";
    ctx.lineWidth = 0.14;
    ctx.stroke();
    return;
  }

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

  // A player running on through this scene is already on his next run during its
  // hold, while the timeline says nobody is moving (D98). His arrow is the next
  // scene's, and it shows the moment he sets off — but not at the instant the
  // scene comes to rest, which is where the editor parks and where he is still
  // on his mark.
  const next = transitionInto(doc, r.index + 1);
  if (next && absoluteMs(r, doc) > absoluteMs({ ...r, ms: undefined }, doc)) {
    const scene = doc.scenes[r.index + 1];
    for (const team of doc.teams) {
      if (team.hidden) continue;
      for (const player of team.players) {
        if (!runsThrough(doc, player.id, r.index) || isRunHidden(scene, player.id)) continue;
        const b = displayCurve(player.id, next);
        if (b) drawPath(ctx, b, team.color, false, clear);
      }
    }
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
  /** How solid the token is drawn: 1, or `UNSEEN_ALPHA` for a player nobody saw (D87). */
  alpha?: number;
  /** The ball only: a shadow on the grass, where no 3D view is casting one. */
  shadow?: boolean;
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

  if (state.alpha !== undefined && state.alpha < 1) {
    // The ring is about the editor, not about the player, so it stays at full
    // strength on a player nobody saw.
    drawFocusRing(ctx, p, radius, 0.42 * k, k, state);
    ctx.save();
    ctx.globalAlpha *= state.alpha;
    drawToken(ctx, p, number, label, color, textColor, {
      ...state,
      alpha: 1,
      selected: false,
      hovered: false,
    });
    ctx.restore();

    // A faded fill alone turns every kit into the colour of wet grass, and the two
    // sides stop reading as sides. The kit's own colour as a dashed rim keeps him
    // on his team and says the place is uncertain -- as strong as the fade is deep,
    // so a player the play is reaching sharpens rather than switching style.
    const doubt = clamp((1 - state.alpha) / (1 - UNSEEN_ALPHA), 0, 1);
    ctx.save();
    ctx.globalAlpha *= doubt * UNSEEN_RIM_ALPHA;
    ctx.setLineDash([0.5 * k, 0.32 * k]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.18 * k;
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Selection and hover rings sit outside the token so they never cover the number.
  drawFocusRing(ctx, p, radius, 0.42 * k, k, state);

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

/** How strong the dashed rim of a player nobody saw is drawn, fully faded. */
const UNSEEN_RIM_ALPHA = 0.9;

/**
 * The editor's ring around a selected or hovered entity.
 *
 * Selection wears a soft amber glow under its ring: a thin ring alone vanished
 * against the white of the centre circle and the touchlines. Hover is a plain
 * white ring, bright enough to promise what a click will pick up.
 */
function drawFocusRing(
  ctx: Ctx,
  p: Vec2,
  radius: number,
  gap: number,
  k: number,
  state: TokenState,
): void {
  if (!state.selected && !state.hovered) return;
  const ring = radius + gap;

  if (state.selected) {
    const glow = ctx.createRadialGradient(p.x, p.y, radius, p.x, p.y, ring + 1.1 * k);
    glow.addColorStop(0, "rgba(251,191,36,0.5)");
    glow.addColorStop(1, "rgba(251,191,36,0)");
    ctx.beginPath();
    ctx.arc(p.x, p.y, ring + 1.1 * k, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, ring, 0, Math.PI * 2);
  ctx.strokeStyle = state.selected ? "#fbbf24" : "rgba(255,255,255,0.8)";
  ctx.lineWidth = (state.selected ? 0.28 : 0.2) * k;
  ctx.stroke();
}

function drawBall(ctx: Ctx, p: Vec2, radius: number, state: TokenState): void {
  const k = radius / BALL_RADIUS;
  drawFocusRing(ctx, p, radius, 0.3 * k, k * 0.6, state);

  // Sitting on the grass: a soft shadow down and to the right of it, the way the light falls
  // on the rest of the board. The 3D view casts its own, at the ball's real height.
  if (state.shadow) {
    ctx.beginPath();
    ctx.ellipse(p.x + radius * 0.18, p.y + radius * 0.3, radius * 1.02, radius * 0.82, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();
  }

  // Round, not flat: lit from the upper left and falling to grey at the rim.
  const lit = ctx.createRadialGradient(
    p.x - radius * 0.38,
    p.y - radius * 0.42,
    radius * 0.1,
    p.x,
    p.y,
    radius,
  );
  lit.addColorStop(0, "#ffffff");
  lit.addColorStop(0.55, "#f1f2f4");
  lit.addColorStop(1, "#c3c8d0");
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = lit;
  ctx.fill();

  drawBallPanels(ctx, p, radius, k);

  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 0.07 * k;
  ctx.stroke();

  // A glint, which is most of what makes a small circle read as a sphere.
  ctx.beginPath();
  ctx.ellipse(p.x - radius * 0.36, p.y - radius * 0.42, radius * 0.2, radius * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fill();
}

/**
 * The panels of a real football -- a black pentagon in the middle and the edges of the five
 * around it, joined by seams -- turning as the ball rolls (D89).
 *
 * Drawn rather than set as an emoji: `drawBoard` has to emit the same pixels in a worker as on
 * screen (the first invariant), and a colour-emoji glyph is whatever font the machine happens
 * to carry. The turn is a function of where the ball IS, not of time or of a counter, so the
 * same frame is the same picture everywhere and a moving ball still rolls.
 */
function drawBallPanels(ctx: Ctx, p: Vec2, radius: number, k: number): void {
  const turn = (p.x * 0.8 + p.y * 0.55) / radius;
  const pentagon = (cx: number, cy: number, r: number, spin: number) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = spin - Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.clip();

  const inner = radius * 0.34;
  ctx.fillStyle = BALL_PANEL_COLOR;
  pentagon(p.x, p.y, inner, turn);
  ctx.fill();

  // The five around it, seen edge-on at the rim, so only part of each shows inside the circle.
  for (let i = 0; i < 5; i++) {
    const a = turn - Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / 5;
    pentagon(p.x + Math.cos(a) * radius * 0.93, p.y + Math.sin(a) * radius * 0.93, radius * 0.3, a);
    ctx.fill();
  }

  // Seams from each corner of the middle panel out towards the rim.
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = turn - Math.PI / 2 + (i * 2 * Math.PI) / 5;
    ctx.moveTo(p.x + Math.cos(a) * inner, p.y + Math.sin(a) * inner);
    ctx.lineTo(p.x + Math.cos(a) * radius * 0.72, p.y + Math.sin(a) * radius * 0.72);
  }
  ctx.strokeStyle = "rgba(24,24,27,0.55)";
  ctx.lineWidth = 0.045 * k;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.restore();
}

/** Near-black rather than black: the same ink the darkest kit uses. */
const BALL_PANEL_COLOR = "#18181b";

/**
 * The lines a dragged player snapped to, across the whole pitch: a constant `x` is
 * a line level across the pitch, a constant `y` a channel along it.
 */
function drawGuides(
  ctx: Ctx,
  doc: BoardDoc,
  guides: readonly ({ x: number } | { y: number })[],
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(251,191,36,0.75)";
  ctx.lineWidth = 0.1;
  ctx.setLineDash([0.5, 0.35]);
  for (const g of guides) {
    ctx.beginPath();
    if ("x" in g) {
      ctx.moveTo(g.x, 0);
      ctx.lineTo(g.x, doc.pitch.width);
    } else {
      ctx.moveTo(0, g.y);
      ctx.lineTo(doc.pitch.length, g.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A player's whole path through every scene, faint, with each scene's stop
 * numbered — so a run over several scenes can be read and checked at once.
 * Drawn from the stored scenes, like a ghost, not from the frame being played.
 */
function drawTrail(ctx: Ctx, doc: BoardDoc, view: RenderView, rotated: boolean): void {
  if (!view.interactive || !view.trail?.length) return;
  const scale = tokenScaleOf(doc);

  for (const id of view.trail) {
    const team = doc.teams.find((t) => t.players.some((p) => p.id === id));
    if (!team || team.hidden) continue;

    const points: Vec2[] = [];
    for (let k = 0; k < doc.scenes.length; k++) {
      const at = doc.scenes[k].positions[id];
      if (!at) continue;
      const r = k > 0 ? transitionInto(doc, k) : null;
      const b = r ? displayCurve(id, r) : null;
      if (b) {
        for (let i = 1; i <= PATH_STEPS; i++) points.push(cubicAt(b, i / PATH_STEPS));
      } else {
        points.push(at);
      }
    }
    if (points.length < 2) continue;

    ctx.save();
    ctx.globalAlpha = TRAIL_ALPHA;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([0.6, 0.45]);
    strokePolyline(ctx, points, team.color, 0.22);
    ctx.setLineDash([]);

    // Each scene's stop, numbered — where two scenes share a place, one mark.
    const stops = new Map<string, { at: Vec2; scenes: number[] }>();
    doc.scenes.forEach((scene, k) => {
      const at = scene.positions[id];
      if (!at) return;
      const key = `${at.x.toFixed(2)},${at.y.toFixed(2)}`;
      const stop = stops.get(key) ?? { at, scenes: [] };
      stop.scenes.push(k + 1);
      stops.set(key, stop);
    });
    for (const { at, scenes } of stops.values()) {
      ctx.beginPath();
      ctx.arc(at.x, at.y, 0.28 * scale, 0, Math.PI * 2);
      ctx.fillStyle = team.color;
      ctx.fill();
      upright(ctx, at, rotated, () => {
        ctx.font = `600 ${0.85 * scale}px Inter, system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 0.22;
        // A run of consecutive scenes reads as a range; anything else, as a list.
        const consecutive = scenes.every((n, i) => i === 0 || n === scenes[i - 1] + 1);
        const label =
          scenes.length > 2 && consecutive
            ? `${scenes[0]}–${scenes[scenes.length - 1]}`
            : scenes.join(",");
        ctx.strokeText(label, 0.45 * scale, -0.5 * scale);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, 0.45 * scale, -0.5 * scale);
      });
    }
    ctx.restore();
  }
}

/** How strongly the whole-match trail is drawn: present, and never mistaken for a run. */
const TRAIL_ALPHA = 0.7;

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
