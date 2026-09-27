/**
 * A handball court: the hall floor, IHF's markings, and the goals seen from above.
 *
 * Stored in board units (D113) and drawn in the rulebook's metres under one scale, as the
 * basketball court is, so each number reads as `HANDBALL_COURT` does.
 */

import { PITCH_PADDING, drawGoalFromAbove, shaded, type Ctx, type PitchTheme } from "./pitch";
import { HANDBALL_COURT as H, SPORTS } from "./sports";
import { atEachEnd, traceGoalArc } from "./markings";
import type { Grass } from "./types";

/** A sports-hall floor: a blue court on a darker surround, and a goal area painted gold. */
export const HALL_THEME: PitchTheme = {
  surround: "#0f141b",
  grass: "#3572ad",
  grassAlt: "#3572ad",
  line: "rgba(255,255,255,0.92)",
  stripeWidth: 1,
  apron: "#285a8c",
  area: "#d9a53f",
};

export const hallTheme = (doc: { grass?: Grass }): PitchTheme => shaded(HALL_THEME, doc);

export function drawHandballCourt(
  ctx: Ctx,
  pitch: { length: number; width: number },
  theme: PitchTheme = HALL_THEME,
  /** False where the goals are drawn standing up instead -- the 3D view's ground layer. */
  goals = true,
): void {
  const spec = SPORTS.handball;
  const u = 1 / spec.metresPerUnit;
  const L = pitch.length / u;
  const W = pitch.width / u;
  const pad = PITCH_PADDING / u;
  const cy = W / 2;
  const half = H.goalWidth / 2;

  ctx.save();
  ctx.scale(u, u);

  ctx.fillStyle = theme.apron ?? theme.grass;
  ctx.fillRect(-pad, -pad, L + pad * 2, W + pad * 2);
  ctx.fillStyle = theme.grass;
  ctx.fillRect(0, 0, L, W);

  // The goal areas, painted, under their lines.
  if (theme.area) {
    ctx.fillStyle = theme.area;
    atEachEnd(ctx, L, () => {
      ctx.beginPath();
      traceGoalArc(ctx, cy, half, H.goalArea);
      ctx.closePath();
      ctx.fill();
    });
  }

  ctx.strokeStyle = theme.line;
  ctx.lineWidth = H.lineWidth;
  ctx.lineCap = "butt";

  ctx.strokeRect(0, 0, L, W);
  ctx.beginPath();
  ctx.moveTo(L / 2, 0);
  ctx.lineTo(L / 2, W);
  ctx.stroke();

  atEachEnd(ctx, L, () => {
    ctx.beginPath();
    traceGoalArc(ctx, cy, half, H.goalArea);
    ctx.stroke();

    // Nine metres about a post reaches past the sideline, which is where the line stops.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, L, W);
    ctx.clip();
    ctx.setLineDash([0.15, 0.15]);
    ctx.beginPath();
    traceGoalArc(ctx, cy, half, H.freeThrow);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(H.sevenMetre, cy - H.sevenMetreLength / 2);
    ctx.lineTo(H.sevenMetre, cy + H.sevenMetreLength / 2);
    ctx.moveTo(H.keeperLine, cy - H.keeperLineLength / 2);
    ctx.lineTo(H.keeperLine, cy + H.keeperLineLength / 2);
    ctx.stroke();
  });
  ctx.restore();

  if (goals && spec.goal.kind === "net") {
    for (const dir of [1, -1] as const) {
      drawGoalFromAbove(ctx, dir === 1 ? 0 : pitch.length, dir, pitch.width / 2, spec.goal);
    }
  }
}
