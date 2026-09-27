/**
 * A field hockey pitch: blue synthetic turf on a green run-off, FIH's markings, and the
 * goals seen from above.
 *
 * Stored in board units (D113) and drawn in the rulebook's metres under one scale, so each
 * number reads as `HOCKEY_FIELD` does.
 */

import { PITCH_PADDING, drawGoalFromAbove, shaded, type Ctx, type PitchTheme } from "./pitch";
import { HOCKEY_FIELD as F, SPORTS } from "./sports";
import { atEachEnd, traceGoalArc } from "./markings";
import type { Grass } from "./types";

/** Water-based turf: the pitch in blue, the run-off around it in green. */
export const TURF_THEME: PitchTheme = {
  surround: "#0d1512",
  grass: "#22609f",
  grassAlt: "#22609f",
  line: "rgba(255,255,255,0.92)",
  stripeWidth: 1,
  apron: "#2c7a4b",
};

export const turfTheme = (doc: { grass?: Grass }): PitchTheme => shaded(TURF_THEME, doc);

export function drawHockeyPitch(
  ctx: Ctx,
  pitch: { length: number; width: number },
  theme: PitchTheme = TURF_THEME,
  /** False where the goals are drawn standing up instead -- the 3D view's ground layer. */
  goals = true,
): void {
  const spec = SPORTS.hockey;
  const u = 1 / spec.metresPerUnit;
  const L = pitch.length / u;
  const W = pitch.width / u;
  const pad = PITCH_PADDING / u;
  const cy = W / 2;
  const half = F.goalWidth / 2;

  ctx.save();
  ctx.scale(u, u);

  ctx.fillStyle = theme.apron ?? theme.grass;
  ctx.fillRect(-pad, -pad, L + pad * 2, W + pad * 2);
  ctx.fillStyle = theme.grass;
  ctx.fillRect(0, 0, L, W);

  ctx.strokeStyle = theme.line;
  ctx.fillStyle = theme.line;
  ctx.lineWidth = F.lineWidth;
  ctx.lineCap = "butt";

  ctx.strokeRect(0, 0, L, W);
  ctx.beginPath();
  ctx.moveTo(L / 2, 0);
  ctx.lineTo(L / 2, W);
  ctx.stroke();

  atEachEnd(ctx, L, () => {
    // The 23-metre line.
    ctx.beginPath();
    ctx.moveTo(F.quarter, 0);
    ctx.lineTo(F.quarter, W);
    ctx.stroke();

    // The shooting circle, and the dashed one five metres beyond it.
    ctx.beginPath();
    traceGoalArc(ctx, cy, half, F.circle);
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([0.3, 1.2]);
    ctx.beginPath();
    traceGoalArc(ctx, cy, half, F.outerCircle);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(F.penaltySpot, cy, 0.15, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  if (goals && spec.goal.kind === "net") {
    for (const dir of [1, -1] as const) {
      drawGoalFromAbove(ctx, dir === 1 ? 0 : pitch.length, dir, pitch.width / 2, spec.goal);
    }
  }
}
