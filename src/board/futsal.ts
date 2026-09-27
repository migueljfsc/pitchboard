/**
 * A futsal court: the hall floor, FIFA's markings, and the goals seen from above.
 *
 * Stored in board units (D113) and drawn in the Laws' metres under one scale, as the
 * handball court is, so each number reads as `FUTSAL_COURT` does.
 */

import { PITCH_PADDING, drawGoalFromAbove, shaded, type Ctx, type PitchTheme } from "./pitch";
import { FUTSAL_COURT as F, SPORTS } from "./sports";
import { atEachEnd, traceGoalArc } from "./markings";
import type { Grass } from "./types";

/** A futsal floor: a blue court on a darker surround, the penalty areas a deeper blue. */
export const FUTSAL_THEME: PitchTheme = {
  surround: "#0d1320",
  grass: "#2f6fb3",
  grassAlt: "#2f6fb3",
  line: "rgba(255,255,255,0.92)",
  stripeWidth: 1,
  apron: "#1f4f86",
  area: "#24558f",
};

export const futsalTheme = (doc: { grass?: Grass }): PitchTheme => shaded(FUTSAL_THEME, doc);

export function drawFutsalCourt(
  ctx: Ctx,
  pitch: { length: number; width: number },
  theme: PitchTheme = FUTSAL_THEME,
  /** False where the goals are drawn standing up instead -- the 3D view's ground layer. */
  goals = true,
): void {
  const spec = SPORTS.futsal;
  const u = 1 / spec.metresPerUnit;
  const L = pitch.length / u;
  const W = pitch.width / u;
  const pad = PITCH_PADDING / u;
  const cy = W / 2;
  // The arcs are struck about the outside of each post.
  const half = F.goalWidth / 2 + F.postWidth;

  ctx.save();
  ctx.scale(u, u);

  ctx.fillStyle = theme.apron ?? theme.grass;
  ctx.fillRect(-pad, -pad, L + pad * 2, W + pad * 2);
  ctx.fillStyle = theme.grass;
  ctx.fillRect(0, 0, L, W);

  // The penalty areas, painted, under their lines.
  if (theme.area) {
    ctx.fillStyle = theme.area;
    atEachEnd(ctx, L, () => {
      ctx.beginPath();
      traceGoalArc(ctx, cy, half, F.penaltyArea);
      ctx.closePath();
      ctx.fill();
    });
  }

  ctx.strokeStyle = theme.line;
  ctx.fillStyle = theme.line;
  ctx.lineWidth = F.lineWidth;
  ctx.lineCap = "butt";

  ctx.strokeRect(0, 0, L, W);
  ctx.beginPath();
  ctx.moveTo(L / 2, 0);
  ctx.lineTo(L / 2, W);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(L / 2, cy, F.centreCircle, 0, Math.PI * 2);
  ctx.stroke();

  const mark = (x: number, y: number) => {
    ctx.beginPath();
    ctx.arc(x, y, F.markRadius, 0, Math.PI * 2);
    ctx.fill();
  };
  mark(L / 2, cy);

  // The substitution zones, on the bench side of the halfway line: a short line across
  // the touchline at each end of each zone.
  ctx.beginPath();
  for (const side of [-1, 1] as const) {
    for (const at of [F.substitution.from, F.substitution.to]) {
      ctx.moveTo(L / 2 + side * at, -F.substitution.tick);
      ctx.lineTo(L / 2 + side * at, F.substitution.tick);
    }
  }
  ctx.stroke();

  atEachEnd(ctx, L, () => {
    ctx.beginPath();
    traceGoalArc(ctx, cy, half, F.penaltyArea);
    ctx.stroke();

    mark(F.penaltyMark, cy);
    mark(F.secondPenaltyMark, cy);
    mark(F.secondPenaltyMark, cy - F.secondMarkSide);
    mark(F.secondPenaltyMark, cy + F.secondMarkSide);

    ctx.beginPath();
    ctx.arc(0, 0, F.cornerArc, 0, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, W, F.cornerArc, -Math.PI / 2, 0);
    ctx.stroke();
  });
  ctx.restore();

  if (goals && spec.goal.kind === "net") {
    for (const dir of [1, -1] as const) {
      drawGoalFromAbove(ctx, dir === 1 ? 0 : pitch.length, dir, pitch.width / 2, spec.goal);
    }
  }
}
