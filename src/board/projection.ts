/**
 * The 3D view — one fixed camera, looking down the pitch from behind the home goal.
 *
 * PURE, on the same terms as drawBoard: given the same extents and canvas size it
 * returns the same numbers in any thread. No DOM, no time, no module-level mutable
 * state.
 *
 * The pitch stays a plane, so this is a homography rather than 3D. Two constants
 * describe the camera and they do separate jobs:
 *
 *   TILT             how far off vertical — controls FORESHORTENING, how squashed
 *                    the length of the pitch is.
 *   CAMERA_DISTANCE  how far back — controls TAPER, how much wider the near
 *                    touchline is than the far one.
 *
 * The reference look is a big tilt on a long lens: strongly foreshortened, barely
 * tapered. Measured off a Football Manager frame, the near half of the pitch is
 * only ~17% taller on screen than the far half, while the length as a whole is
 * compressed to ~73% of its orthographic size. Pull CAMERA_DISTANCE in and the
 * near touchline splays out into something that reads as a fisheye.
 *
 * One property is worth knowing before reading `warpGround`: a source ROW maps to
 * a destination ROW, scaled horizontally about the centre. Rows never shear or
 * rotate, because the camera is level and only pitched. That is what lets the
 * ground layer be warped with axis-aligned drawImage strips instead of a triangle
 * mesh — and it is why there are no seams to hide.
 */

import type { PitchHalf, PitchView, Vec2, Viewport } from "./types";
import { PITCH_PADDING, type Ctx } from "./pitch";
import { fitViewport, halfRange, toPitch, toScreen } from "./geometry";

/** Camera tilt off vertical, in degrees. 0 would be the flat top-down board. */
export const TILT = 43;

/**
 * Camera distance from the pitch centre, in half-lengths of the visible content.
 * See the header — this is the lens, not the angle.
 */
export const CAMERA_DISTANCE = 8.6;

const RAD = (TILT * Math.PI) / 180;
const SIN = Math.sin(RAD);

/**
 * How much the ground is squashed along the camera axis, = cos(TILT).
 *
 * Exported because a billboard's contact shadow lies on the ground and has to be
 * squashed by the same amount, or it reads as floating.
 */
export const GROUND_SQUASH = Math.cos(RAD);

/**
 * Ceiling on the ground layer, in device pixels per edge.
 *
 * The layer is allocated per frame, so an uncapped 4K export would churn ~80 MB a
 * frame for resolution that the warp only ever downsamples.
 */
const MAX_SOURCE_EDGE = 4096;

/**
 * Destination pixels per warp strip.
 *
 * The horizontal scale is constant within a strip and taken at its midpoint, so
 * this is the stair-step on a near-vertical touchline. At 2 px it is under a tenth
 * of a pixel across a full-height board — well inside the antialiasing.
 */
const STRIP_PX = 2;

export type Projection = {
  /** Ground layer, in device pixels. */
  sourceW: number;
  sourceH: number;
  /** Ground layer resolution, device pixels per metre. */
  sourceScale: number;
  /** Destination canvas, in CSS pixels. */
  width: number;
  height: number;
  /** Top and bottom of the projected board in the destination, CSS pixels. */
  top: number;
  bottom: number;
  /** The across-screen extent the layer covers, in metres. */
  contentAcross: number;
  /** Destination y for a normalised source row `v` in [0,1]; 0 is the far end. */
  rowY: (v: number) => number;
  /** Destination pixels per metre at source row `v` — the depth scale. */
  depthScale: (v: number) => number;
  /**
   * A point in ground-layer pixels, projected into destination CSS pixels.
   *
   * `up` lifts it off the pitch, in metres — the goal frames are the only thing on
   * the board with a height, and it is what makes them read as objects standing on
   * the grass rather than shapes painted on it.
   */
  project: (sx: number, sy: number, up?: number) => Projected;
  /**
   * A destination point in CSS pixels back to ground-layer pixels — `project` at
   * `up = 0`, run backwards. NaN above the horizon, where there is no ground.
   */
  unproject: (x: number, y: number) => { sx: number; sy: number };
};

/** Where a ground point landed, and how big a metre is once it gets there. */
export type Projected = { x: number; y: number; scale: number };

/**
 * Normalise a framing before it is fitted.
 *
 * Tilt implies a vertical board, so the flat viewport underneath a tilted one is
 * always the rotated map — which matters on the fallback path, where a browser
 * without OffscreenCanvas draws the flat board instead.
 */
export const framingOf = (view: PitchView): PitchView =>
  view.tilt ? { ...view, rotated: true } : view;

/**
 * Width / height of the projected board, independent of canvas size.
 *
 * The export path needs this before it has a canvas to fit into: a tilted board
 * is far closer to square than the 105 x 68 it is drawn from, and sizing an export
 * off the flat aspect would band it with dead surround.
 */
export function tiltedAspect(contentAcross: number, contentAlong: number): number {
  const d = CAMERA_DISTANCE * (contentAlong / 2);
  const near = 1 / (d - (contentAlong / 2) * SIN);
  const far = 1 / (d + (contentAlong / 2) * SIN);
  // The near edge is the widest, so it is what has to fit.
  const rawW = contentAcross * near;
  const rawH = (contentAlong / 2) * GROUND_SQUASH * (near + far);
  return rawW / rawH;
}

/**
 * Build the camera for a board of `contentAcross` x `contentAlong` metres shown on
 * a `width` x `height` CSS-pixel canvas.
 *
 * `contentAlong` runs up the screen and away from the camera — the pitch is always
 * vertical in 3D, because the whole point of the angle is that you are standing
 * behind the home goal looking at the far one.
 */
export function projectionFor(
  contentAcross: number,
  contentAlong: number,
  width: number,
  height: number,
  deviceScale: number,
): Projection {
  const d = CAMERA_DISTANCE * (contentAlong / 2);

  // Metres from the centre along the camera axis, positive toward the near end.
  const bOf = (v: number) => (v - 0.5) * contentAlong;
  const kOf = (v: number) => 1 / (d - bOf(v) * SIN);
  const rawYOf = (v: number) => bOf(v) * GROUND_SQUASH * kOf(v);

  const y0 = rawYOf(0);
  const rawH = rawYOf(1) - y0;
  const rawW = contentAcross * kOf(1);

  const fit = Math.min(width / rawW, height / rawH);
  const top = (height - rawH * fit) / 2;

  const rowY = (v: number) => top + (rawYOf(v) - y0) * fit;
  const depthScale = (v: number) => kOf(v) * fit;

  // 1:1 at the near edge and downsampling everywhere else. The scale only varies
  // by the taper, so there is no minification worth mipmapping for.
  const sourceScale = Math.min(
    depthScale(1) * deviceScale,
    MAX_SOURCE_EDGE / Math.max(contentAcross, contentAlong),
  );
  const sourceW = Math.max(1, Math.round(contentAcross * sourceScale));
  const sourceH = Math.max(1, Math.round(contentAlong * sourceScale));

  return {
    sourceW,
    sourceH,
    sourceScale,
    width,
    height,
    top,
    bottom: rowY(1),
    contentAcross,
    rowY,
    depthScale,
    project: (sx, sy, up = 0) => {
      if (up !== 0) {
        // Height does two things at once, and both fall out of the same camera:
        // it brings the point closer (a smaller divisor, so it grows), and it
        // lifts it up the frame by sin(TILT). At up = 0 this reduces exactly to
        // the ground case below.
        const b = bOf(sy / sourceH);
        const depth = d - b * SIN - up * GROUND_SQUASH;
        const scale = fit / depth;
        return {
          x: width / 2 + (sx / sourceW - 0.5) * contentAcross * scale,
          y: top + ((b * GROUND_SQUASH - up * SIN) / depth - y0) * fit,
          scale,
        };
      }

      const v = sy / sourceH;
      const scale = depthScale(v);
      return {
        // As a fraction of the layer, not via sourceScale: the layer's pixel size
        // is rounded to whole pixels, and dividing by the unrounded scale would
        // leave the billboards a twentieth of a pixel off the ground under them.
        // The warp measures its strips the same way, so the two agree by
        // construction rather than to within a rounding error.
        x: width / 2 + (sx / sourceW - 0.5) * contentAcross * scale,
        y: rowY(v),
        scale,
      };
    },
    unproject: (x, y) => {
      // Solved, not searched. rawY = b·C/(d − b·S), so R·(d − b·S) = b·C gives
      // b = R·d/(C + R·S) — one expression, exact, and the reason the pointer can
      // be turned back into a place on the grass at all.
      const rawY = (y - top) / fit + y0;
      const denominator = GROUND_SQUASH + rawY * SIN;

      // The horizon, where depth reaches zero. It sits about six pitch lengths
      // beyond the far goal, so no real canvas reaches it — but a click above it
      // has no point on the ground under it, and must not come back as one.
      if (denominator <= 1e-9) return { sx: NaN, sy: NaN };

      const b = (rawY * d) / denominator;
      const v = b / contentAlong + 0.5;
      const scale = depthScale(v);

      return {
        sx: ((x - width / 2) / (contentAcross * scale) + 0.5) * sourceW,
        sy: v * sourceH,
      };
    },
  };
}

/**
 * The camera for a board, and the flat viewport the ground layer is drawn in.
 *
 * ONE definition, shared by the renderer and by every hit test. Rebuilding it
 * beside the pointer handling would be a second answer to "where is this player on
 * screen", and the two would drift the way preview and export would.
 */
export type Camera = { proj: Projection; groundView: Viewport };

export function cameraFor(
  pitch: { length: number; width: number },
  half: PitchHalf,
  width: number,
  height: number,
  deviceScale: number,
): Camera {
  const [x0, x1] = halfRange(half, pitch.length);
  const proj = projectionFor(
    pitch.width + PITCH_PADDING * 2,
    x1 - x0 + PITCH_PADDING * 2,
    width,
    height,
    deviceScale,
  );
  // Tilt implies a vertical board, so the layer underneath is always the rotated map.
  const groundView = fitViewport(proj.sourceW, proj.sourceH, pitch.length, pitch.width, {
    half,
    rotated: true,
  });
  return { proj, groundView };
}

/** Where a pitch position lands on screen once the camera has had it. */
export function projectPitch(p: Vec2, cam: Camera, up = 0): Projected {
  const s = toScreen(p, cam.groundView);
  return cam.proj.project(s.x, s.y, up);
}

/**
 * A screen point back to the place on the GRASS under it.
 *
 * Exact for anything lying on the pitch — markings, zones, connectors, the sweep of
 * a marquee. It says nothing about billboards, which stand up off the ground: a
 * token's pixels are nowhere near the grass beneath them, and `unbillboard` is what
 * those are tested with instead.
 */
export function unprojectPitch(screen: Vec2, cam: Camera): Vec2 {
  const g = cam.proj.unproject(screen.x, screen.y);
  return toPitch({ x: g.sx, y: g.sy }, cam.groundView);
}

/**
 * A screen point into the metre space a billboard was drawn in.
 *
 * The exact inverse of what `billboard()` sets up: `anchor` lands on `at`, and one
 * metre is `at.scale` pixels. So a token or a label can be hit-tested by the same
 * pitch-space geometry that draws it, against the pixels it actually occupies —
 * which is what keeps the grab area the size it looks, at either end of the pitch.
 */
export function unbillboard(screen: Vec2, at: Projected, anchor: Vec2): Vec2 {
  return {
    x: anchor.x + (screen.x - at.x) / at.scale,
    y: anchor.y + (screen.y - at.y) / at.scale,
  };
}

/**
 * Paint the flat ground layer into the destination as the projected trapezoid.
 *
 * Horizontal strips rather than a triangle mesh — see the header. Each strip is
 * one axis-aligned drawImage, so the whole warp is a few hundred blits with no
 * clipping and no per-triangle matrix.
 */
export function warpGround(ctx: Ctx, ground: CanvasImageSource, p: Projection): void {
  const strips = Math.max(1, Math.ceil((p.bottom - p.top) / STRIP_PX));

  for (let i = 0; i < strips; i++) {
    const v0 = i / strips;
    const v1 = (i + 1) / strips;

    const y0 = p.rowY(v0);
    const dh = p.rowY(v1) - y0;
    if (dh <= 0) continue;

    const sy = v0 * p.sourceH;
    const sh = (v1 - v0) * p.sourceH;

    // Strips share an edge, and a shared edge between two resampled blits is a
    // visible hairline. Each is drawn a pixel taller and takes the matching extra
    // slice of source with it, so the scale inside the strip is unchanged and the
    // overlap is simply the next strip's first row drawn twice.
    const grow = i === strips - 1 ? 1 : (dh + 1) / dh;

    const half = (p.contentAcross / 2) * p.depthScale((v0 + v1) / 2);

    ctx.drawImage(
      ground,
      0,
      sy,
      p.sourceW,
      Math.min(sh * grow, p.sourceH - sy),
      p.width / 2 - half,
      y0,
      half * 2,
      dh * grow,
    );
  }
}

/**
 * Depth shading over the finished frame.
 *
 * Measuring the reference turned up something worth saying out loud: the taper is
 * mild enough that the perspective alone barely reads as 3D. Most of the depth cue
 * is light — the far end falls off, and the corners fall off. Cheap, and it does
 * more work than the warp does.
 */
export function drawDepthShading(ctx: Ctx, p: Projection): void {
  const far = ctx.createLinearGradient(0, p.top, 0, p.bottom);
  far.addColorStop(0, "rgba(0,0,0,0.30)");
  far.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = far;
  ctx.fillRect(0, 0, p.width, p.height);

  const cx = p.width / 2;
  const cy = (p.top + p.bottom) / 2;
  const r = Math.hypot(p.width, p.bottom - p.top) / 2;
  const edge = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, p.width, p.height);
}
