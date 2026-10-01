/**
 * An ice rink: white ice inside rounded boards, IIHF's markings, and the goals seen from
 * above standing on their goal lines, four metres out from the end boards (D123).
 *
 * Stored in board units (D113) and drawn in the rulebook's metres under one scale, so each
 * number reads as `ICE_RINK` does. The board is the rink, boards to boards: play goes on
 * behind each net, so nothing about this court stops at its goal lines.
 */

import { PITCH_PADDING, drawGoalFromAbove, shaded, type Ctx, type PitchTheme } from "./pitch";
import { ICE_RINK as R, SPORTS, goalLineX } from "./sports";
import { atEachEnd } from "./markings";
import type { Grass } from "./types";

/**
 * Ice: near-white under a cool tint, the boards dark around it. `line` is the goal posts'
 * red, which a goal standing in 3D is framed in.
 */
export const ICE_THEME: PitchTheme = {
  surround: "#0b1016",
  grass: "#eef4f8",
  grassAlt: "#eef4f8",
  line: "#c8102e",
  stripeWidth: 1,
  apron: "#1c252e",
  area: "#9ccbf0",
};

/** The two line colours a rink is marked in, besides the theme's red. */
const BLUE = "#1f4fa8";
const RED = "#c8102e";

export const iceTheme = (doc: { grass?: Grass }): PitchTheme => shaded(ICE_THEME, doc);

/** The rink's outline: a rectangle whose corners are quarter circles of `R.cornerRadius`. */
function traceRink(ctx: Ctx, L: number, W: number): void {
  const r = R.cornerRadius;
  ctx.moveTo(r, 0);
  ctx.lineTo(L - r, 0);
  ctx.arc(L - r, r, r, -Math.PI / 2, 0);
  ctx.lineTo(L, W - r);
  ctx.arc(L - r, W - r, r, 0, Math.PI / 2);
  ctx.lineTo(r, W);
  ctx.arc(r, W - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(0, r);
  ctx.arc(r, r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

export function drawIceRink(
  ctx: Ctx,
  pitch: { length: number; width: number },
  theme: PitchTheme = ICE_THEME,
  /** False where the goals are drawn standing up instead -- the 3D view's ground layer. */
  goals = true,
): void {
  const spec = SPORTS.icehockey;
  const u = 1 / spec.metresPerUnit;
  const L = pitch.length / u;
  const W = pitch.width / u;
  const pad = PITCH_PADDING / u;
  const cy = W / 2;
  const mid = L / 2;
  const blue = R.blueApart / 2;

  ctx.save();
  ctx.scale(u, u);

  // The boards, then the ice inside them: the corners are the boards' own curve.
  ctx.fillStyle = theme.apron ?? theme.surround;
  ctx.fillRect(-pad, -pad, L + pad * 2, W + pad * 2);
  ctx.beginPath();
  traceRink(ctx, L, W);
  ctx.fillStyle = theme.grass;
  ctx.fill();

  // Everything else is clipped to the ice, as a painted line stops at the boards.
  ctx.save();
  ctx.clip();

  const across = (x: number, width: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x - width / 2, 0, width, W);
  };
  across(mid, R.redWidth, RED);
  across(mid - blue, R.blueWidth, BLUE);
  across(mid + blue, R.blueWidth, BLUE);

  ctx.lineCap = "butt";
  ctx.lineWidth = R.goalLineWidth;

  // Centre ice: the blue spot and its circle.
  ctx.strokeStyle = BLUE;
  ctx.beginPath();
  ctx.arc(mid, cy, R.circleRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = BLUE;
  ctx.beginPath();
  ctx.arc(mid, cy, R.centreSpot, 0, Math.PI * 2);
  ctx.fill();

  // The officials' crease, against the near side boards at centre ice.
  ctx.strokeStyle = RED;
  ctx.beginPath();
  ctx.arc(mid, W, R.officials, Math.PI, Math.PI * 2);
  ctx.stroke();

  const spot = (x: number, y: number) => {
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(x, y, R.spot, 0, Math.PI * 2);
    ctx.fill();
  };

  // The neutral-zone spots, in from each blue line.
  for (const side of [-1, 1] as const) {
    const x = mid + side * (blue - R.neutralSpotIn);
    spot(x, cy - R.spotSide);
    spot(x, cy + R.spotSide);
  }

  atEachEnd(ctx, L, () => {
    const g = R.goalLine;

    // The crease, painted, under its line.
    ctx.beginPath();
    ctx.moveTo(g, cy - R.crease);
    ctx.arc(g, cy, R.crease, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = theme.area ?? theme.grass;
    ctx.fill();
    ctx.strokeStyle = RED;
    ctx.stroke();

    // The goal line, boards to boards.
    ctx.fillStyle = RED;
    ctx.fillRect(g - R.goalLineWidth / 2, 0, R.goalLineWidth, W);

    // The goalkeeper's trapezoid behind the goal, from the goal line to the end boards.
    ctx.beginPath();
    for (const sign of [-1, 1] as const) {
      ctx.moveTo(g, cy + (sign * R.trapezoid.atGoalLine) / 2);
      ctx.lineTo(0, cy + (sign * R.trapezoid.atBoards) / 2);
    }
    ctx.stroke();

    // The end-zone circles, each with its spot and the hash marks on its outer edges.
    const x = g + R.endSpotOut;
    for (const side of [-1, 1] as const) {
      const y = cy + side * R.spotSide;
      ctx.beginPath();
      ctx.arc(x, y, R.circleRadius, 0, Math.PI * 2);
      ctx.stroke();
      spot(x, y);
      ctx.beginPath();
      for (const edge of [-1, 1] as const) {
        for (const off of [-1, 1] as const) {
          const hx = x + (off * R.hashApart) / 2;
          const hy = y + edge * R.circleRadius;
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx, hy + edge * R.hashLength);
        }
      }
      ctx.stroke();
    }
  });

  ctx.restore();

  // The boards' own edge, over the ice.
  ctx.beginPath();
  traceRink(ctx, L, W);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 0.12;
  ctx.stroke();
  ctx.restore();

  if (goals && spec.goal.kind === "net") {
    for (const dir of [1, -1] as const) {
      drawGoalFromAbove(ctx, goalLineX(spec.goal, pitch.length, dir), dir, pitch.width / 2, spec.goal);
    }
  }
}
